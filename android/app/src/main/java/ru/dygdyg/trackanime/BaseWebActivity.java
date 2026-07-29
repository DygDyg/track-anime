package ru.dygdyg.trackanime;

import android.app.Activity;
import android.app.Dialog;
import android.Manifest;
import android.app.UiModeManager;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ActivityInfo;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.DownloadListener;
import android.webkit.HttpAuthHandler;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceError;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

abstract class BaseWebActivity extends Activity {
    private static final String LOG_TAG = "TrackAnimeWebView";
    private static final String SITE_HOST = "track-anime.dygdyg.ru";
    private static final String SITE_URL = "https://" + SITE_HOST + "/";
    private static final String MIRROR_HOST = "track-anime.duckdns.org";
    private static final String MIRROR_URL = "https://" + MIRROR_HOST + "/";
    private static final String THIRD_MIRROR_HOST = "ta.dygdyg.ru";
    private static final String THIRD_MIRROR_URL = "https://" + THIRD_MIRROR_HOST + "/";
    private static final String[] SITE_HOSTS = { SITE_HOST, MIRROR_HOST, THIRD_MIRROR_HOST };
    private static final long MIRROR_FALLBACK_DELAY_MS = 12_000L;
    private static final String SESSION_COOKIE_NAME = "ta.session";
    private static final String PREFERENCES_NAME = "track-anime-app";
    private static final String LAST_SESSION_HOST_KEY = "last-session-host";
    private static final String SYSTEM_BARS_MODE_KEY = "system-bars-mode";
    private static final String SYSTEM_BARS_MODE_SHOW = "show";
    private static final String SYSTEM_BARS_MODE_ALWAYS = "always";
    private static final String SYSTEM_BARS_MODE_VIDEO = "video";
    private static final int CAMERA_PERMISSION_REQUEST_CODE = 11;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable mirrorFallback = this::loadNextMirrorIfNeeded;
    private WebView webView;
    private TrackAnimeChromeClient chromeClient;
    private View customFullscreenView;
    private WebChromeClient.CustomViewCallback customFullscreenCallback;
    private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private boolean currentLoadStarted;
    private String currentHost;
    private SharedPreferences preferences;
    private UpdateManager updateManager;
    private PermissionRequest pendingCameraRequest;
    private ProxyFallback proxyFallback;
    private boolean proxyFallbackAttempted;
    private float windowBrightnessOverride = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;

    protected abstract boolean isTvMode();

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
        );
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        CookieManager.setAcceptFileSchemeCookies(false);
        webView = new WebView(this);
        preferences = getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE);
        proxyFallback = new ProxyFallback(preferences);
        cookies.setAcceptThirdPartyCookies(webView, true);
        webView.setBackgroundColor(Color.rgb(12, 14, 20));
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setUserAgentString(webView.getSettings().getUserAgentString() + " TrackAnimeAndroid/1");
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new TrackAnimeJsBridge(), "TrackAnimeAndroid");
        chromeClient = new TrackAnimeChromeClient();
        webView.setWebChromeClient(chromeClient);
        webView.setWebViewClient(new TrackAnimeWebViewClient());
        webView.setDownloadListener(new ExternalDownloadListener());
        updateManager = new UpdateManager(this);
        setContentView(webView);
        applyDarkSystemBars();
        applySystemBarsPolicy();
        handleLaunchUri(getIntent().getData());
    }

    @Override protected void onDestroy() {
        handler.removeCallbacks(mirrorFallback);
        exitCustomFullscreen();
        if (webView != null) webView.destroy();
        if (updateManager != null) updateManager.destroy();
        super.onDestroy();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchUri(intent.getData());
    }

    @Override protected void onResume() {
        super.onResume();
        applySystemBarsPolicy();
        if (webView == null || updateManager == null) return;
        String currentUrl = webView.getUrl();
        if (currentUrl != null) updateManager.checkForUpdate(Uri.parse(currentUrl));
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemBarsPolicy();
    }

    @Override public void onBackPressed() {
        if (customFullscreenView != null) {
            exitCustomFullscreen();
            return;
        }
        if (webView != null && webView.canGoBack()) { webView.goBack(); return; }
        super.onBackPressed();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST_CODE || pendingCameraRequest == null) return;
        PermissionRequest request = pendingCameraRequest;
        pendingCameraRequest = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        } else {
            request.deny();
        }
    }

    private void enterCustomFullscreen(View view, WebChromeClient.CustomViewCallback callback) {
        if (customFullscreenView != null) {
            callback.onCustomViewHidden();
            return;
        }

        customFullscreenView = view;
        customFullscreenCallback = callback;
        previousOrientation = getRequestedOrientation();
        addContentView(view, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setVisibility(View.GONE);
        applySystemBarsPolicy();
        if (!isTvMode()) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    private void exitCustomFullscreen() {
        if (customFullscreenView == null) return;

        if (customFullscreenView.getParent() instanceof ViewGroup) {
            ((ViewGroup) customFullscreenView.getParent()).removeView(customFullscreenView);
        }
        customFullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (!isTvMode()) setRequestedOrientation(previousOrientation);
        applySystemBarsPolicy();

        if (customFullscreenCallback != null) {
            customFullscreenCallback.onCustomViewHidden();
            customFullscreenCallback = null;
        }
    }

    private void applyDarkSystemBars() {
        Window window = getWindow();
        int barColor = Color.rgb(12, 14, 20);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(barColor);
        window.setNavigationBarColor(barColor);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        // PhoneWindow.getInsetsController() NPEs before DecorView exists.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && window.peekDecorView() != null) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                        0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
        }
    }

    private String readSystemBarsMode() {
        String mode = preferences.getString(SYSTEM_BARS_MODE_KEY, SYSTEM_BARS_MODE_VIDEO);
        if (SYSTEM_BARS_MODE_SHOW.equals(mode) || SYSTEM_BARS_MODE_ALWAYS.equals(mode) || SYSTEM_BARS_MODE_VIDEO.equals(mode)) {
            return mode;
        }
        return SYSTEM_BARS_MODE_VIDEO;
    }

    private void saveSystemBarsMode(String mode) {
        preferences.edit().putString(SYSTEM_BARS_MODE_KEY, mode).apply();
    }

    private boolean shouldHideSystemBars() {
        if (isTvMode()) return true;
        String mode = readSystemBarsMode();
        if (SYSTEM_BARS_MODE_ALWAYS.equals(mode)) return true;
        if (SYSTEM_BARS_MODE_VIDEO.equals(mode)) return customFullscreenView != null;
        return false;
    }

    private void applySystemBarsPolicy() {
        setFullscreenSystemUi(shouldHideSystemBars());
    }

    private void setFullscreenSystemUi(boolean fullscreen) {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (window.peekDecorView() == null) return;
            WindowInsetsController controller = window.getInsetsController();
            if (controller == null) return;
            if (fullscreen) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            } else {
                controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                applyDarkSystemBars();
            }
            return;
        }

        View decor = window.peekDecorView();
        if (decor == null) return;
        decor.setSystemUiVisibility(fullscreen
                ? View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : View.SYSTEM_UI_FLAG_VISIBLE);
        if (!fullscreen) applyDarkSystemBars();
    }

    private boolean isAppSettingsUri(Uri uri) {
        return uri != null
                && "trackanime".equalsIgnoreCase(uri.getScheme())
                && "settings".equalsIgnoreCase(uri.getHost());
    }

    private void handleLaunchUri(Uri requestedUri) {
        if (isAppSettingsUri(requestedUri)) {
            String currentUrl = webView != null ? webView.getUrl() : null;
            if (!isAllowedSiteUrl(currentUrl == null ? null : Uri.parse(currentUrl))) {
                loadSite(SITE_URL);
            }
            handler.post(this::showAppSettings);
            return;
        }
        loadSite(isAllowedSiteUrl(requestedUri) ? requestedUri.toString() : SITE_URL);
    }

    private boolean isAllowedSiteUrl(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && isSiteHost(uri.getHost());
    }

    private boolean isInAppUrl(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        return isSiteHost(host)
                || "shikimori.one".equalsIgnoreCase(host)
                || "shikimori.io".equalsIgnoreCase(host)
                || "shiki.one".equalsIgnoreCase(host);
    }

    private boolean isSiteHost(String host) {
        if (host == null) return false;
        for (String siteHost : SITE_HOSTS) {
            if (siteHost.equalsIgnoreCase(host)) return true;
        }
        return false;
    }

    private boolean isAllowedCameraRequest(PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (!isAllowedSiteUrl(origin)) return false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return true;
        }
        return false;
    }

    private void handleCameraPermissionRequest(PermissionRequest request) {
        if (!isAllowedCameraRequest(request)) {
            request.deny();
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            return;
        }
        if (pendingCameraRequest != null) pendingCameraRequest.deny();
        pendingCameraRequest = request;
        requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_PERMISSION_REQUEST_CODE);
    }

    private void loadSite(String url) {
        String targetHost = Uri.parse(url).getHost();
        currentHost = targetHost;
        currentLoadStarted = false;
        handler.removeCallbacks(mirrorFallback);
        handler.postDelayed(mirrorFallback, MIRROR_FALLBACK_DELAY_MS);
        String sourceHost = preferences.getString(LAST_SESSION_HOST_KEY, null);
        copySessionCookie(sourceHost, targetHost, () -> {
            Log.d(LOG_TAG, "Loading: " + url);
            webView.loadUrl(url);
        });
    }

    private String getNextHost(String host) {
        for (int index = 0; index < SITE_HOSTS.length - 1; index += 1) {
            if (SITE_HOSTS[index].equalsIgnoreCase(host)) return SITE_HOSTS[index + 1];
        }
        return null;
    }

    private boolean loadNextMirror() {
        String nextHost = getNextHost(currentHost);
        if (nextHost != null) {
            Log.w(LOG_TAG, "Current host did not load; switching to " + nextHost + ".");
            loadSite("https://" + nextHost + "/");
            return true;
        }
        return false;
    }

    private void loadNextMirrorIfNeeded() {
        if (!currentLoadStarted && !loadNextMirror()) recoverWithProxyOrShowError("таймаут загрузки");
    }

    private void recoverWithProxyOrShowError(String reason) {
        if (!proxyFallbackAttempted && proxyFallback.isConfigured()) {
            proxyFallbackAttempted = true;
            Log.w(LOG_TAG, "All direct mirrors failed; trying proxy fallback.");
            proxyFallback.enable(() -> loadSite(SITE_URL));
            return;
        }
        showLoadErrorPage(webView, reason);
    }

    /** Only the app session is mirrored; OAuth cookies stay host-scoped. */
    private void copySessionCookie(String sourceHost, String targetHost, Runnable onComplete) {
        if (!isSiteHost(sourceHost) || !isSiteHost(targetHost) || sourceHost.equalsIgnoreCase(targetHost)) {
            onComplete.run();
            return;
        }

        String sessionValue = getCookieValue(sourceHost, SESSION_COOKIE_NAME);
        String cookie = sessionValue == null
                ? SESSION_COOKIE_NAME + "=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"
                : SESSION_COOKIE_NAME + "=" + sessionValue
                    + "; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax";
        CookieManager.getInstance().setCookie(
                "https://" + targetHost + "/",
                cookie,
                new ValueCallback<Boolean>() {
                    @Override public void onReceiveValue(Boolean ignored) {
                        CookieManager.getInstance().flush();
                        onComplete.run();
                    }
                }
        );
    }

    private String getCookieValue(String host, String name) {
        if (!isSiteHost(host)) return null;
        String cookies = CookieManager.getInstance().getCookie("https://" + host + "/");
        if (cookies == null || cookies.isEmpty()) return null;
        for (String part : cookies.split(";\\s*")) {
            int separator = part.indexOf('=');
            if (separator <= 0) continue;
            if (name.equals(part.substring(0, separator))) return part.substring(separator + 1);
        }
        return null;
    }

    private void synchronizeSessionFromCurrentHost(String currentHost) {
        if (!isSiteHost(currentHost)) return;
        preferences.edit().putString(LAST_SESSION_HOST_KEY, currentHost).apply();
        for (String otherHost : SITE_HOSTS) {
            if (!otherHost.equalsIgnoreCase(currentHost)) {
                copySessionCookie(currentHost, otherHost, () -> { });
            }
        }
    }

    private void enableTvSiteNavigation() {
        if (!isTvMode()) return;
        webView.evaluateJavascript("(function(){try{var k='track-anime-site-settings';var s=JSON.parse(localStorage.getItem(k)||'{}');s.tvNavigationEnabled=true;localStorage.setItem(k,JSON.stringify(s));document.documentElement.dataset.tvNav='true';}catch(e){}})();", null);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int color(int resId) {
        return getResources().getColor(resId, getTheme());
    }

    private TextView settingsSectionTitle(String text) {
        TextView title = new TextView(this);
        title.setText(text);
        title.setTextColor(color(R.color.foreground));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        return title;
    }

    private TextView settingsSectionHint(String text) {
        TextView hint = new TextView(this);
        hint.setText(text);
        hint.setTextColor(color(R.color.muted));
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        hint.setLineSpacing(dp(2), 1f);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(4);
        hint.setLayoutParams(params);
        return hint;
    }

    private RadioButton settingsOption(String label) {
        RadioButton option = new RadioButton(this);
        option.setId(View.generateViewId());
        option.setText(label);
        option.setTextColor(color(R.color.foreground));
        option.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        option.setButtonTintList(ColorStateList.valueOf(color(R.color.accent)));
        option.setBackgroundResource(R.drawable.settings_option_bg);
        option.setPadding(dp(12), dp(10), dp(12), dp(10));
        option.setMinHeight(dp(44));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(8);
        option.setLayoutParams(params);
        return option;
    }

    private EditText createProxyField(String hint, int inputType, String value) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setHintTextColor(color(R.color.muted));
        field.setTextColor(color(R.color.foreground));
        field.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        field.setInputType(inputType);
        field.setText(value);
        field.setSingleLine(true);
        field.setBackgroundResource(R.drawable.settings_field_bg);
        field.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(8);
        field.setLayoutParams(params);
        return field;
    }

    private Button settingsGhostButton(String label) {
        Button button = new Button(this, null, android.R.attr.borderlessButtonStyle);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(color(R.color.foreground));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        button.setBackgroundResource(R.drawable.settings_btn_ghost);
        button.setPadding(dp(14), dp(10), dp(14), dp(10));
        button.setMinHeight(dp(40));
        return button;
    }

    private Button settingsAccentButton(String label) {
        Button button = new Button(this, null, android.R.attr.borderlessButtonStyle);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackgroundResource(R.drawable.settings_btn_accent);
        button.setPadding(dp(16), dp(10), dp(16), dp(10));
        button.setMinHeight(dp(40));
        return button;
    }

    private TextView settingsNavItem(String label) {
        TextView item = new TextView(this);
        item.setText(label);
        item.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        item.setTypeface(Typeface.DEFAULT_BOLD);
        item.setBackgroundResource(R.drawable.settings_nav_item_bg);
        item.setPadding(dp(12), dp(10), dp(12), dp(10));
        item.setClickable(true);
        item.setFocusable(true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(4);
        item.setLayoutParams(params);
        return item;
    }

    private void setSettingsNavSelected(TextView item, boolean selected) {
        item.setSelected(selected);
        item.setTextColor(selected ? color(R.color.accent) : color(R.color.muted));
    }

    private boolean isTelevisionUiMode() {
        UiModeManager uiMode = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        return uiMode != null && uiMode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    private String deviceTypeLabel() {
        if (isTvMode() || isTelevisionUiMode()) return "Android TV";
        if (getResources().getConfiguration().smallestScreenWidthDp >= 600) return "Планшет";
        return "Телефон";
    }

    private String deviceShellLabel() {
        return isTvMode() ? "Оболочка Android TV" : "Оболочка телефона / планшета";
    }

    private String deviceModelDescription() {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        String model = Build.MODEL == null ? "" : Build.MODEL.trim();
        if (manufacturer.isEmpty() && model.isEmpty()) return "Неизвестно";
        if (manufacturer.isEmpty()) return model;
        if (model.isEmpty()) return manufacturer;
        if (model.toLowerCase().startsWith(manufacturer.toLowerCase())) return model;
        return manufacturer + " " + model;
    }

    private View settingsInfoRow(String label, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setBackgroundResource(R.drawable.settings_option_bg);
        row.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(8);
        row.setLayoutParams(params);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(color(R.color.muted));
        labelView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        row.addView(labelView);

        TextView valueView = new TextView(this);
        valueView.setText(value);
        valueView.setTextColor(color(R.color.foreground));
        valueView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        valueView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams valueParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        valueParams.topMargin = dp(2);
        valueView.setLayoutParams(valueParams);
        row.addView(valueView);
        return row;
    }

    private void styleSiteDialogWindow(Dialog dialog, int maxWidthDp) {
        Window window = dialog.getWindow();
        if (window == null) return;
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        int width = Math.min(
                getResources().getDisplayMetrics().widthPixels - dp(24),
                dp(maxWidthDp));
        window.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
        window.setGravity(Gravity.CENTER);
    }

    private LinearLayout settingsDialogShell() {
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundResource(R.drawable.settings_dialog_bg);
        return shell;
    }

    private LinearLayout settingsTabPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(16), dp(16), dp(12));
        return panel;
    }

    private void showAppSettings() {
        if (isFinishing()) return;
        ProxyFallback.Settings saved = proxyFallback.getSettings();
        String barsMode = readSystemBarsMode();

        Dialog dialog = new Dialog(this, R.style.Theme_TrackAnime_Dialog);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setCanceledOnTouchOutside(true);

        LinearLayout shell = settingsDialogShell();

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(20), dp(18), dp(20), dp(14));
        TextView title = new TextView(this);
        title.setText("Настройки приложения");
        title.setTextColor(color(R.color.foreground));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        TextView subtitle = new TextView(this);
        subtitle.setText("Прокси, панели, кэш и сведения об устройстве");
        subtitle.setTextColor(color(R.color.muted));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(4);
        subtitle.setLayoutParams(subtitleParams);
        header.addView(title);
        header.addView(subtitle);
        shell.addView(header);

        View headerDivider = new View(this);
        headerDivider.setBackgroundColor(color(R.color.border));
        shell.addView(headerDivider, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(1))));

        boolean wide = getResources().getDisplayMetrics().widthPixels >= dp(520);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(wide ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(wide ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        nav.setPadding(dp(8), dp(12), dp(8), dp(12));
        if (wide) {
            LinearLayout.LayoutParams navParams = new LinearLayout.LayoutParams(dp(148), ViewGroup.LayoutParams.MATCH_PARENT);
            nav.setLayoutParams(navParams);
        } else {
            nav.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }

        TextView navBars = settingsNavItem("Панели");
        TextView navProxy = settingsNavItem("Прокси");
        TextView navCache = settingsNavItem("Кэш");
        TextView navDevice = settingsNavItem("Устройство");
        if (!wide) {
            LinearLayout.LayoutParams tabParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tabParams.setMargins(dp(2), 0, dp(2), 0);
            navBars.setLayoutParams(new LinearLayout.LayoutParams(tabParams));
            navProxy.setLayoutParams(new LinearLayout.LayoutParams(tabParams));
            navCache.setLayoutParams(new LinearLayout.LayoutParams(tabParams));
            navDevice.setLayoutParams(new LinearLayout.LayoutParams(tabParams));
            navBars.setGravity(Gravity.CENTER);
            navProxy.setGravity(Gravity.CENTER);
            navCache.setGravity(Gravity.CENTER);
            navDevice.setGravity(Gravity.CENTER);
        }
        nav.addView(navBars);
        nav.addView(navProxy);
        nav.addView(navCache);
        nav.addView(navDevice);
        if (wide) {
            body.addView(nav);
        } else {
            HorizontalScrollView navScroll = new HorizontalScrollView(this);
            navScroll.setHorizontalScrollBarEnabled(false);
            navScroll.addView(nav);
            navScroll.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            body.addView(navScroll);
        }

        View bodyDivider = new View(this);
        bodyDivider.setBackgroundColor(color(R.color.border));
        if (wide) {
            body.addView(bodyDivider, new LinearLayout.LayoutParams(Math.max(1, dp(1)), ViewGroup.LayoutParams.MATCH_PARENT));
        } else {
            body.addView(bodyDivider, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(1))));
        }

        FrameLayout panelsHost = new FrameLayout(this);
        LinearLayout.LayoutParams panelsParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, wide ? 1f : 0f);
        if (wide) panelsParams.width = 0;
        panelsHost.setLayoutParams(panelsParams);

        LinearLayout barsPanel = settingsTabPanel();
        barsPanel.addView(settingsSectionTitle("Системные панели"));
        barsPanel.addView(settingsSectionHint("Статус-бар и навигация Android"));
        RadioGroup barsModes = new RadioGroup(this);
        barsModes.setOrientation(RadioGroup.VERTICAL);
        RadioButton barsShow = settingsOption("Показывать панели");
        RadioButton barsAlways = settingsOption("Всегда скрывать (полноэкранный режим)");
        RadioButton barsVideo = settingsOption("Скрывать только в полноэкранном видео");
        barsModes.addView(barsShow);
        barsModes.addView(barsAlways);
        barsModes.addView(barsVideo);
        barsPanel.addView(barsModes);
        int barsCheckedId = SYSTEM_BARS_MODE_ALWAYS.equals(barsMode) ? barsAlways.getId()
                : SYSTEM_BARS_MODE_SHOW.equals(barsMode) ? barsShow.getId() : barsVideo.getId();
        barsModes.check(barsCheckedId);

        LinearLayout proxyPanel = settingsTabPanel();
        proxyPanel.addView(settingsSectionTitle("Прокси"));
        proxyPanel.addView(settingsSectionHint(
                "Используется только после ошибки всех прямых зеркал. Поддерживается HTTP/HTTPS proxy."));
        RadioGroup modes = new RadioGroup(this);
        modes.setOrientation(RadioGroup.VERTICAL);
        RadioButton noProxy = settingsOption("Без прокси");
        RadioButton serverProxy = settingsOption("Прокси сервера");
        RadioButton manualProxy = settingsOption("Указать вручную");
        modes.addView(noProxy);
        modes.addView(serverProxy);
        modes.addView(manualProxy);
        proxyPanel.addView(modes);
        LinearLayout manualFields = new LinearLayout(this);
        manualFields.setOrientation(LinearLayout.VERTICAL);
        manualFields.setPadding(0, dp(4), 0, 0);
        EditText host = createProxyField("Адрес прокси", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, saved.host);
        EditText port = createProxyField("Порт", InputType.TYPE_CLASS_NUMBER, saved.port > 0 ? String.valueOf(saved.port) : "");
        EditText username = createProxyField("Логин (необязательно)", InputType.TYPE_CLASS_TEXT, saved.username);
        EditText password = createProxyField("Пароль (необязательно)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, saved.password);
        manualFields.addView(host);
        manualFields.addView(port);
        manualFields.addView(username);
        manualFields.addView(password);
        proxyPanel.addView(manualFields);
        int checkedId = saved.mode == ProxyFallback.Mode.NONE ? noProxy.getId()
                : saved.mode == ProxyFallback.Mode.MANUAL ? manualProxy.getId() : serverProxy.getId();
        modes.check(checkedId);
        manualFields.setVisibility(saved.mode == ProxyFallback.Mode.MANUAL ? View.VISIBLE : View.GONE);
        modes.setOnCheckedChangeListener((group, checked) ->
                manualFields.setVisibility(checked == manualProxy.getId() ? View.VISIBLE : View.GONE));

        LinearLayout cachePanel = settingsTabPanel();
        cachePanel.addView(settingsSectionTitle("Кэш WebView"));
        cachePanel.addView(settingsSectionHint(
                "Удаляет кэш страниц и изображений. Вход и настройки сайта сохранятся."));
        Button clearInPanel = settingsGhostButton("Очистить кэш");
        LinearLayout.LayoutParams clearInPanelParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clearInPanelParams.topMargin = dp(16);
        clearInPanel.setLayoutParams(clearInPanelParams);
        clearInPanel.setOnClickListener(v -> confirmCacheClear());
        cachePanel.addView(clearInPanel);

        LinearLayout devicePanel = settingsTabPanel();
        devicePanel.addView(settingsSectionTitle("Устройство"));
        devicePanel.addView(settingsSectionHint("Тип запуска оболочки и сведения о текущем устройстве"));
        devicePanel.addView(settingsInfoRow("Тип устройства", deviceTypeLabel()));
        devicePanel.addView(settingsInfoRow("Режим приложения", deviceShellLabel()));
        devicePanel.addView(settingsInfoRow("Устройство", deviceModelDescription()));
        devicePanel.addView(settingsInfoRow(
                "Android",
                "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")"));
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int widthDp = Math.round(metrics.widthPixels / metrics.density);
        int heightDp = Math.round(metrics.heightPixels / metrics.density);
        devicePanel.addView(settingsInfoRow(
                "Экран",
                widthDp + "×" + heightDp + " dp · sw"
                        + getResources().getConfiguration().smallestScreenWidthDp + " dp"));
        devicePanel.addView(settingsInfoRow(
                "Приложение",
                "Track Anime " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"));

        ScrollView barsScroll = new ScrollView(this);
        barsScroll.addView(barsPanel);
        ScrollView proxyScroll = new ScrollView(this);
        proxyScroll.addView(proxyPanel);
        ScrollView cacheScroll = new ScrollView(this);
        cacheScroll.addView(cachePanel);
        ScrollView deviceScroll = new ScrollView(this);
        deviceScroll.addView(devicePanel);
        FrameLayout.LayoutParams panelLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        panelsHost.addView(barsScroll, panelLp);
        panelsHost.addView(proxyScroll, panelLp);
        panelsHost.addView(cacheScroll, panelLp);
        panelsHost.addView(deviceScroll, panelLp);
        body.addView(panelsHost);

        int bodyHeight = Math.round(getResources().getDisplayMetrics().heightPixels * 0.52f);
        body.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(dp(280), bodyHeight)));
        shell.addView(body);

        TextView[] navItems = { navBars, navProxy, navCache, navDevice };
        View[] panelViews = { barsScroll, proxyScroll, cacheScroll, deviceScroll };
        View.OnClickListener selectTab = clicked -> {
            int index = clicked == navProxy ? 1
                    : clicked == navCache ? 2
                    : clicked == navDevice ? 3 : 0;
            for (int i = 0; i < navItems.length; i++) {
                setSettingsNavSelected(navItems[i], i == index);
                panelViews[i].setVisibility(i == index ? View.VISIBLE : View.GONE);
            }
        };
        navBars.setOnClickListener(selectTab);
        navProxy.setOnClickListener(selectTab);
        navCache.setOnClickListener(selectTab);
        navDevice.setOnClickListener(selectTab);
        selectTab.onClick(navBars);

        View footerDivider = new View(this);
        footerDivider.setBackgroundColor(color(R.color.border));
        shell.addView(footerDivider, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(1))));

        LinearLayout footer = new LinearLayout(this);
        footer.setOrientation(LinearLayout.HORIZONTAL);
        footer.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        footer.setPadding(dp(16), dp(12), dp(16), dp(14));

        Button cancel = settingsGhostButton("Отмена");
        cancel.setOnClickListener(v -> dialog.dismiss());
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cancelParams.setMarginEnd(dp(8));
        footer.addView(cancel, cancelParams);

        Button save = settingsAccentButton("Сохранить");
        save.setOnClickListener(v -> {
            ProxyFallback.Mode mode = modes.getCheckedRadioButtonId() == noProxy.getId()
                    ? ProxyFallback.Mode.NONE
                    : modes.getCheckedRadioButtonId() == manualProxy.getId()
                            ? ProxyFallback.Mode.MANUAL : ProxyFallback.Mode.SERVER;
            int manualPort = 0;
            if (mode == ProxyFallback.Mode.MANUAL) {
                try { manualPort = Integer.parseInt(port.getText().toString().trim()); } catch (NumberFormatException ignoredError) { }
                if (host.getText().toString().trim().isEmpty() || manualPort < 1 || manualPort > 65535) {
                    selectTab.onClick(navProxy);
                    Toast.makeText(this, "Укажите адрес и порт от 1 до 65535.", Toast.LENGTH_LONG).show();
                    return;
                }
            }
            String nextBarsMode = barsModes.getCheckedRadioButtonId() == barsAlways.getId()
                    ? SYSTEM_BARS_MODE_ALWAYS
                    : barsModes.getCheckedRadioButtonId() == barsShow.getId()
                            ? SYSTEM_BARS_MODE_SHOW : SYSTEM_BARS_MODE_VIDEO;
            saveSystemBarsMode(nextBarsMode);
            proxyFallback.saveSettings(new ProxyFallback.Settings(mode, host.getText().toString(), manualPort,
                    username.getText().toString(), password.getText().toString()));
            proxyFallback.clearOverride(() -> {
                applySystemBarsPolicy();
                Toast.makeText(this, "Настройки сохранены.", Toast.LENGTH_SHORT).show();
            });
            dialog.dismiss();
        });
        footer.addView(save);
        shell.addView(footer);

        dialog.setContentView(shell);
        styleSiteDialogWindow(dialog, 640);
        dialog.show();
    }

    private void confirmCacheClear() {
        if (isFinishing()) return;

        Dialog dialog = new Dialog(this, R.style.Theme_TrackAnime_Dialog);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setCanceledOnTouchOutside(true);

        LinearLayout shell = settingsDialogShell();
        shell.setPadding(dp(20), dp(18), dp(20), dp(16));

        TextView title = new TextView(this);
        title.setText("Очистить кэш?");
        title.setTextColor(color(R.color.foreground));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        shell.addView(title);

        TextView message = new TextView(this);
        message.setText("Кэш страниц и изображений будет удалён. Вход и настройки сайта сохранятся.");
        message.setTextColor(color(R.color.muted));
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        message.setLineSpacing(dp(2), 1f);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = dp(8);
        messageParams.bottomMargin = dp(18);
        message.setLayoutParams(messageParams);
        shell.addView(message);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);

        Button cancel = settingsGhostButton("Отмена");
        cancel.setOnClickListener(v -> dialog.dismiss());
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cancelParams.setMarginEnd(dp(8));
        actions.addView(cancel, cancelParams);

        Button clear = settingsAccentButton("Очистить");
        clear.setOnClickListener(v -> {
            webView.clearCache(true);
            webView.clearHistory();
            proxyFallbackAttempted = false;
            String url = webView.getUrl();
            loadSite(isAllowedSiteUrl(url == null ? null : Uri.parse(url)) ? url : SITE_URL);
            Toast.makeText(this, "Кэш очищен.", Toast.LENGTH_SHORT).show();
            dialog.dismiss();
        });
        actions.addView(clear);
        shell.addView(actions);

        dialog.setContentView(shell);
        styleSiteDialogWindow(dialog, 400);
        dialog.show();
    }

    private void openExternal(Uri uri) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
    }

    private final class TrackAnimeJsBridge {
        @JavascriptInterface
        public boolean hasScreenBrightnessControl() {
            return true;
        }

        @JavascriptInterface
        public void setScreenBrightness(double value) {
            float clamped = (float) Math.max(0.01, Math.min(1.0, value));
            if (Looper.myLooper() == Looper.getMainLooper()) {
                applyWindowBrightness(clamped);
            } else {
                handler.post(() -> applyWindowBrightness(clamped));
            }
        }

        @JavascriptInterface
        public float getScreenBrightness() {
            if (windowBrightnessOverride >= 0f && windowBrightnessOverride <= 1f) {
                return windowBrightnessOverride;
            }
            try {
                int raw = android.provider.Settings.System.getInt(
                        getContentResolver(),
                        android.provider.Settings.System.SCREEN_BRIGHTNESS
                );
                return Math.max(0.01f, Math.min(1f, raw / 255f));
            } catch (Exception ignored) {
                return 0.85f;
            }
        }

        @JavascriptInterface
        public void clearScreenBrightness() {
            if (Looper.myLooper() == Looper.getMainLooper()) {
                clearWindowBrightness();
            } else {
                handler.post(this::clearWindowBrightness);
            }
        }

        private void applyWindowBrightness(float clamped) {
            windowBrightnessOverride = clamped;
            Window window = getWindow();
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.screenBrightness = clamped;
            window.setAttributes(lp);
        }

        private void clearWindowBrightness() {
            windowBrightnessOverride = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            Window window = getWindow();
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            window.setAttributes(lp);
        }
    }

    private final class TrackAnimeWebViewClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAppSettingsUri(uri)) {
                showAppSettings();
                return true;
            }
            if (isInAppUrl(uri)) return false;
            openExternal(uri);
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return AdBlocker.intercept(request);
        }

        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            currentLoadStarted = true;
            handler.removeCallbacks(mirrorFallback);
            Log.d(LOG_TAG, "Page started: " + url);
        }

        @Override public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            handler.removeCallbacks(mirrorFallback);
            Log.d(LOG_TAG, "Page loaded: " + url);
            synchronizeSessionFromCurrentHost(Uri.parse(url).getHost());
            enableTvSiteNavigation();
            updateManager.checkForUpdate(Uri.parse(url));
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (!request.isForMainFrame()) return;
            CharSequence description = error.getDescription();
            Log.e(LOG_TAG, "Page load failed: " + error.getErrorCode() + " " + description);
            if (!loadNextMirror()) recoverWithProxyOrShowError(description != null ? description.toString() : "ошибка сети");
        }

        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            super.onReceivedHttpError(view, request, response);
            if (request.isForMainFrame()) {
                Log.e(LOG_TAG, "Page HTTP error: " + response.getStatusCode() + " " + request.getUrl());
                if (!loadNextMirror()) recoverWithProxyOrShowError("HTTP " + response.getStatusCode());
            }
        }

        @Override public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
            if (proxyFallback.matchesEnabledProxy(host)) {
                handler.proceed(proxyFallback.getEnabledUsername(), proxyFallback.getEnabledPassword());
                return;
            }
            handler.cancel();
        }
    }

    private void showLoadErrorPage(WebView view, String reason) {
        String safeReason = reason == null ? "ошибка сети" : reason.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        String html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0c0e14;color:#e8ecf4;font-family:sans-serif;padding:24px;text-align:center}"
                + "h1{font-size:1.25rem;margin:0 0 12px}p{opacity:.8;line-height:1.45;margin:0 0 20px}"
                + "button{background:#6c8cff;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:1rem;margin:4px}button.secondary{background:#252b3b}"
                + "small{display:block;margin-top:16px;opacity:.55;word-break:break-word}</style></head><body>"
                + "<div><h1>Нет соединения с сайтом</h1>"
                + "<p>Не удалось загрузить Track Anime. Проверьте интернет и VPN (V2Ray/прокси), затем повторите.</p>"
                + "<button onclick=\"location.replace('" + SITE_URL + "')\">Повторить</button>"
                + "<button class=\"secondary\" onclick=\"location.href='trackanime://settings'\">Настройки приложения</button>"
                + "<small>" + safeReason + "<br>" + SITE_URL + "</small></div></body></html>";
        view.loadDataWithBaseURL(SITE_URL, html, "text/html", "utf-8", SITE_URL);
    }

    private final class TrackAnimeChromeClient extends WebChromeClient {
        @Override public boolean onConsoleMessage(ConsoleMessage message) {
            Log.d(LOG_TAG, "Console " + message.messageLevel() + ": " + message.message()
                    + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
            return true;
        }

        @Override public void onShowCustomView(View view, CustomViewCallback callback) {
            enterCustomFullscreen(view, callback);
        }

        @Override public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> handleCameraPermissionRequest(request));
        }

        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingCameraRequest == request) pendingCameraRequest = null;
        }

        @Override public void onHideCustomView() {
            exitCustomFullscreen();
        }
    }

    private final class ExternalDownloadListener implements DownloadListener {
        @Override public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) { openExternal(Uri.parse(url)); }
    }
}
