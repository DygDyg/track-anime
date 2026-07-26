package ru.dygdyg.trackanime;

import android.content.SharedPreferences;
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
