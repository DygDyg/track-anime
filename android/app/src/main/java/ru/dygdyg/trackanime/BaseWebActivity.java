package ru.dygdyg.trackanime;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ActivityInfo;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.DownloadListener;
import android.webkit.HttpAuthHandler;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceError;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;

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
    private final ProxyFallback proxyFallback = new ProxyFallback();
    private boolean proxyFallbackAttempted;

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
        cookies.setAcceptThirdPartyCookies(webView, true);
        webView.setBackgroundColor(Color.rgb(12, 14, 20));
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        chromeClient = new TrackAnimeChromeClient();
        webView.setWebChromeClient(chromeClient);
        webView.setWebViewClient(new TrackAnimeWebViewClient());
        webView.setDownloadListener(new ExternalDownloadListener());
        updateManager = new UpdateManager(this);
        setContentView(webView);
        Uri requestedUri = getIntent().getData();
        loadSite(isAllowedSiteUrl(requestedUri) ? requestedUri.toString() : SITE_URL);
    }

    @Override protected void onDestroy() {
        handler.removeCallbacks(mirrorFallback);
        exitCustomFullscreen();
        if (webView != null) webView.destroy();
        if (updateManager != null) updateManager.destroy();
        super.onDestroy();
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
        setFullscreenSystemUi(true);
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
        setFullscreenSystemUi(isTvMode());

        if (customFullscreenCallback != null) {
            customFullscreenCallback.onCustomViewHidden();
            customFullscreenCallback = null;
        }
    }

    private void setFullscreenSystemUi(boolean fullscreen) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller == null) return;
            if (fullscreen) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            } else {
                controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
            return;
        }

        getWindow().getDecorView().setSystemUiVisibility(fullscreen
                ? View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : View.SYSTEM_UI_FLAG_VISIBLE);
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

    private void openExternal(Uri uri) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
    }

    private final class TrackAnimeWebViewClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
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
            if (proxyFallback.isEnabled() && BuildConfig.FALLBACK_PROXY_HOST.equalsIgnoreCase(host)) {
                handler.proceed(BuildConfig.FALLBACK_PROXY_USERNAME, BuildConfig.FALLBACK_PROXY_PASSWORD);
                return;
            }
            handler.cancel();
        }
    }

    private void showLoadErrorPage(WebView view, String reason) {
        String safeReason = reason == null ? "ошибка сети" : reason.replace("<", "&lt;").replace(">", "&gt;");
        String html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0c0e14;color:#e8ecf4;font-family:sans-serif;padding:24px;text-align:center}"
                + "h1{font-size:1.25rem;margin:0 0 12px}p{opacity:.8;line-height:1.45;margin:0 0 20px}"
                + "button{background:#6c8cff;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:1rem}"
                + "small{display:block;margin-top:16px;opacity:.55;word-break:break-word}</style></head><body>"
                + "<div><h1>Нет соединения с сайтом</h1>"
                + "<p>Не удалось загрузить Track Anime. Проверьте интернет и VPN (V2Ray/прокси), затем повторите.</p>"
                + "<button onclick=\"location.replace('" + SITE_URL + "')\">Повторить</button>"
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
