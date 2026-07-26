package ru.dygdyg.trackanime;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;

/** Enables the app-wide WebView proxy only after every direct site mirror has failed. */
final class ProxyFallback {
    private static final String LOG_TAG = "TrackAnimeProxy";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean enabled;

    boolean isEnabled() {
        return enabled;
    }

    boolean isConfigured() {
        return !BuildConfig.FALLBACK_PROXY_HOST.isEmpty()
                && BuildConfig.FALLBACK_PROXY_PORT > 0
                && !BuildConfig.FALLBACK_PROXY_USERNAME.isEmpty()
                && !BuildConfig.FALLBACK_PROXY_PASSWORD.isEmpty();
    }

    void enable(Runnable onReady) {
        if (enabled) {
            onReady.run();
            return;
        }
        if (!isConfigured() || !WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            Log.w(LOG_TAG, "Proxy fallback is unavailable on this device.");
            onReady.run();
            return;
        }

        ProxyConfig config = new ProxyConfig.Builder()
                .addProxyRule(
                        BuildConfig.FALLBACK_PROXY_HOST + ":" + BuildConfig.FALLBACK_PROXY_PORT,
                        ProxyConfig.MATCH_ALL_SCHEMES
                )
                .build();
        try {
            ProxyController.getInstance().setProxyOverride(config, handler::post, () -> {
                enabled = true;
                Log.i(LOG_TAG, "Proxy fallback enabled.");
                handler.post(onReady);
            });
        } catch (IllegalArgumentException | UnsupportedOperationException error) {
            Log.w(LOG_TAG, "Could not enable proxy fallback.", error);
            onReady.run();
        }
    }
}
