package ru.dygdyg.trackanime;

import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;

/** Applies an optional HTTP proxy to the WebView only after direct mirrors fail. */
final class ProxyFallback {
    enum Mode { NONE, SERVER, MANUAL }

    static final class Settings {
        final Mode mode;
        final String host;
        final int port;
        final String username;
        final String password;

        Settings(Mode mode, String host, int port, String username, String password) {
            this.mode = mode;
            this.host = host;
            this.port = port;
            this.username = username;
            this.password = password;
        }
    }

    /** Result of parsing a {@code taproxy://} deep link. */
    static final class DeepLinkResult {
        final Settings settings;
        final String error;

        DeepLinkResult(Settings settings, String error) {
            this.settings = settings;
            this.error = error;
        }

        boolean isOk() {
            return settings != null && error == null;
        }
    }

    private static final String LOG_TAG = "TrackAnimeProxy";
    private static final String MODE_KEY = "proxy-mode";
    private static final String HOST_KEY = "proxy-manual-host";
    private static final String PORT_KEY = "proxy-manual-port";
    private static final String USERNAME_KEY = "proxy-manual-username";
    private static final String PASSWORD_KEY = "proxy-manual-password";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final SharedPreferences preferences;
    private boolean enabled;
    private Settings enabledSettings;

    ProxyFallback(SharedPreferences preferences) {
        this.preferences = preferences;
    }

    /**
     * Supported forms:
     * <ul>
     *   <li>{@code taproxy://host:port}</li>
     *   <li>{@code taproxy://user:pass@host:port}</li>
     *   <li>{@code taproxy://host:port?user=...&pass=...} ({@code username}/{@code password} also accepted)</li>
     *   <li>{@code taproxy://clear} / {@code none} / {@code off} — disable proxy</li>
     *   <li>{@code taproxy://server} — use built-in server proxy from local.properties</li>
     * </ul>
     */
    static DeepLinkResult parseDeepLink(Uri uri) {
        if (uri == null || !"taproxy".equalsIgnoreCase(uri.getScheme())) {
            return new DeepLinkResult(null, "Неверная ссылка прокси.");
        }

        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            return new DeepLinkResult(null, "Укажите адрес прокси в ссылке.");
        }

        String hostLower = host.toLowerCase();
        if ("clear".equals(hostLower) || "none".equals(hostLower) || "off".equals(hostLower)
                || "disable".equals(hostLower)) {
            return new DeepLinkResult(new Settings(Mode.NONE, "", 0, "", ""), null);
        }
        if ("server".equals(hostLower) || "default".equals(hostLower)) {
            return new DeepLinkResult(new Settings(Mode.SERVER, "", 0, "", ""), null);
        }

        int port = uri.getPort();
        if (port < 0) {
            String portQuery = firstQuery(uri, "port");
            if (portQuery != null) {
                try {
                    port = Integer.parseInt(portQuery.trim());
                } catch (NumberFormatException ignored) {
                    port = -1;
                }
            }
        }
        if (port < 1 || port > 65535) {
            return new DeepLinkResult(null, "Укажите порт прокси от 1 до 65535.");
        }

        String username = "";
        String password = "";
        String userInfo = uri.getUserInfo();
        if (userInfo != null && !userInfo.isEmpty()) {
            int separator = userInfo.indexOf(':');
            if (separator < 0) {
                username = Uri.decode(userInfo);
            } else {
                username = Uri.decode(userInfo.substring(0, separator));
                password = Uri.decode(userInfo.substring(separator + 1));
            }
        }
        String queryUser = firstQuery(uri, "user", "username");
        String queryPass = firstQuery(uri, "pass", "password");
        if (queryUser != null) username = queryUser;
        if (queryPass != null) password = queryPass;

        return new DeepLinkResult(
                new Settings(Mode.MANUAL, host.trim(), port, username == null ? "" : username,
                        password == null ? "" : password),
                null
        );
    }

    /** Builds a shareable {@code taproxy://} link for the given manual proxy fields. */
    static String buildDeepLink(String host, int port, String username, String password) {
        String trimmedHost = host == null ? "" : host.trim();
        if (trimmedHost.isEmpty() || port < 1 || port > 65535) return null;
        String user = username == null ? "" : username.trim();
        String pass = password == null ? "" : password;
        Uri.Builder builder = new Uri.Builder().scheme("taproxy");
        if (!user.isEmpty() || !pass.isEmpty()) {
            builder.encodedAuthority(
                    Uri.encode(user) + ":" + Uri.encode(pass) + "@" + trimmedHost + ":" + port);
        } else {
            builder.encodedAuthority(trimmedHost + ":" + port);
        }
        return builder.build().toString();
    }

    private static String firstQuery(Uri uri, String... keys) {
        for (String key : keys) {
            String value = uri.getQueryParameter(key);
            if (value != null) return value;
        }
        return null;
    }

    boolean isConfigured() {
        Settings settings = getSettings();
        return settings.mode != Mode.NONE && !settings.host.isEmpty() && settings.port > 0 && settings.port <= 65535;
    }

    Settings getSettings() {
        Mode mode;
        try {
            mode = Mode.valueOf(preferences.getString(MODE_KEY, Mode.SERVER.name()));
        } catch (IllegalArgumentException | NullPointerException ignored) {
            mode = Mode.SERVER;
        }

        if (mode == Mode.MANUAL) {
            return new Settings(mode, preferences.getString(HOST_KEY, "").trim(), preferences.getInt(PORT_KEY, 0),
                    preferences.getString(USERNAME_KEY, ""), preferences.getString(PASSWORD_KEY, ""));
        }
        if (mode == Mode.SERVER) {
            return new Settings(mode, BuildConfig.FALLBACK_PROXY_HOST, BuildConfig.FALLBACK_PROXY_PORT,
                    BuildConfig.FALLBACK_PROXY_USERNAME, BuildConfig.FALLBACK_PROXY_PASSWORD);
        }
        return new Settings(mode, "", 0, "", "");
    }

    void saveSettings(Settings settings) {
        preferences.edit().putString(MODE_KEY, settings.mode.name()).putString(HOST_KEY, settings.host.trim())
                .putInt(PORT_KEY, settings.port).putString(USERNAME_KEY, settings.username)
                .putString(PASSWORD_KEY, settings.password).apply();
    }

    boolean matchesEnabledProxy(String host) {
        return enabled && enabledSettings != null && enabledSettings.host.equalsIgnoreCase(host);
    }

    String getEnabledUsername() { return enabledSettings == null ? "" : enabledSettings.username; }

    String getEnabledPassword() { return enabledSettings == null ? "" : enabledSettings.password; }

    void clearOverride(Runnable onReady) {
        enabled = false;
        enabledSettings = null;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            onReady.run();
            return;
        }
        try {
            ProxyController.getInstance().clearProxyOverride(handler::post, () -> handler.post(onReady));
        } catch (IllegalArgumentException | UnsupportedOperationException error) {
            Log.w(LOG_TAG, "Could not clear proxy override.", error);
            onReady.run();
        }
    }

    void enable(Runnable onReady) {
        Settings settings = getSettings();
        if (enabled && enabledSettings != null && enabledSettings.host.equals(settings.host)
                && enabledSettings.port == settings.port && enabledSettings.username.equals(settings.username)
                && enabledSettings.password.equals(settings.password)) {
            onReady.run();
            return;
        }
        if (!isConfigured() || !WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            Log.w(LOG_TAG, "Proxy fallback is unavailable on this device or is disabled.");
            onReady.run();
            return;
        }

        ProxyConfig config = new ProxyConfig.Builder().addProxyRule(
                settings.host + ":" + settings.port, ProxyConfig.MATCH_ALL_SCHEMES).build();
        try {
            ProxyController.getInstance().setProxyOverride(config, handler::post, () -> {
                enabled = true;
                enabledSettings = settings;
                Log.i(LOG_TAG, "Proxy fallback enabled: " + settings.mode);
                handler.post(onReady);
            });
        } catch (IllegalArgumentException | UnsupportedOperationException error) {
            Log.w(LOG_TAG, "Could not enable proxy fallback.", error);
            onReady.run();
        }
    }
}
