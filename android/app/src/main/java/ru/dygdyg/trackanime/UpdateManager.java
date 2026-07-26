package ru.dygdyg.trackanime;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Checks the signed static release manifest and always delegates APK installation to Android. */
final class UpdateManager {
    private static final String LOG_TAG = "TrackAnimeUpdate";
    private static final String MANIFEST_PATH = "/downloads/TrackAnime.json";
    private final Activity activity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private boolean checkStarted;

    UpdateManager(Activity activity) {
        this.activity = activity;
    }

    void checkForUpdate(Uri loadedUri) {
        if (checkStarted || loadedUri == null || !"https".equalsIgnoreCase(loadedUri.getScheme())) return;
        String host = loadedUri.getHost();
        if (host == null) return;
        checkStarted = true;
        Uri manifestUri = new Uri.Builder().scheme("https").authority(host).path(MANIFEST_PATH).build();
        executor.execute(() -> loadManifest(manifestUri));
    }

    void destroy() {
        executor.shutdownNow();
    }

    private void loadManifest(Uri manifestUri) {
        try {
            JSONObject manifest = new JSONObject(readText(manifestUri.toString()));
            long availableVersion = manifest.getLong("versionCode");
            if (availableVersion <= currentVersionCode()) return;

            String versionName = manifest.getString("versionName");
            String apkUrl = manifest.getString("apkUrl");
            String sha256 = manifest.getString("sha256").toLowerCase(Locale.ROOT);
            if (!sha256.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("Invalid APK checksum");
            if (!apkUrl.startsWith("/")) throw new IllegalArgumentException("APK URL must be an absolute path");
            Uri resolvedApkUri = new Uri.Builder()
                    .scheme("https")
                    .authority(manifestUri.getHost())
                    .path(apkUrl)
                    .build();
            if (!"https".equalsIgnoreCase(resolvedApkUri.getScheme())
                    || !manifestUri.getHost().equalsIgnoreCase(resolvedApkUri.getHost())) {
                throw new IllegalArgumentException("APK URL must use the manifest HTTPS host");
            }
            activity.runOnUiThread(() -> showUpdateDialog(versionName, resolvedApkUri, sha256));
        } catch (Exception error) {
            Log.w(LOG_TAG, "Update check skipped: " + error.getMessage());
        }
    }

    private void showUpdateDialog(String versionName, Uri apkUri, String sha256) {
        if (activity.isFinishing() || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && activity.isDestroyed())) return;
        new AlertDialog.Builder(activity)
                .setTitle("Доступно обновление")
                .setMessage("Доступна версия " + versionName + ". Скачать и открыть установщик Android?")
                .setNegativeButton("Позже", null)
                .setPositiveButton("Скачать", (dialog, ignored) -> downloadAndInstall(apkUri, sha256))
                .show();
    }

    private void downloadAndInstall(Uri apkUri, String expectedSha256) {
        executor.execute(() -> {
            try {
                File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null) throw new IllegalStateException("No app storage");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Cannot create update directory");
                File apk = new File(directory, "TrackAnime-update.apk");
                File partial = new File(directory, "TrackAnime-update.apk.part");
                download(apkUri.toString(), partial);
                if (!expectedSha256.equals(sha256(partial))) throw new IllegalStateException("APK checksum mismatch");
                if (apk.exists() && !apk.delete()) throw new IllegalStateException("Cannot replace previous APK");
                if (!partial.renameTo(apk)) throw new IllegalStateException("Cannot save APK");
                activity.runOnUiThread(() -> requestInstall(apk));
            } catch (Exception error) {
                Log.e(LOG_TAG, "Update download failed", error);
                activity.runOnUiThread(() -> showError("Не удалось скачать обновление. Повторите позже."));
            }
        });
    }

    private void requestInstall(File apk) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            showError("Разрешите установку обновлений для Track Anime в системных настройках, затем скачайте обновление снова.");
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(settings);
            } catch (ActivityNotFoundException ignored) { }
            return;
        }
        Uri apkUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(apkUri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.startActivity(install);
    }

    private void showError(String message) {
        if (!activity.isFinishing()) new AlertDialog.Builder(activity).setMessage(message).setPositiveButton("Понятно", null).show();
    }

    private long currentVersionCode() throws Exception {
        PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private static String readText(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        connection.setInstanceFollowRedirects(false);
        try (InputStream input = connection.getInputStream()) {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IllegalStateException("HTTP " + connection.getResponseCode());
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8 * 1024];
            for (int read; (read = input.read(buffer)) != -1;) output.write(buffer, 0, read);
            return output.toString("UTF-8");
        } finally {
            connection.disconnect();
        }
    }

    private static void download(String address, File output) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setInstanceFollowRedirects(false);
        try (InputStream input = connection.getInputStream(); FileOutputStream stream = new FileOutputStream(output)) {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IllegalStateException("HTTP " + connection.getResponseCode());
            byte[] buffer = new byte[32 * 1024];
            for (int read; (read = input.read(buffer)) != -1;) stream.write(buffer, 0, read);
        } finally {
            connection.disconnect();
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32 * 1024];
            for (int read; (read = input.read(buffer)) != -1;) digest.update(buffer, 0, read);
        }
        StringBuilder result = new StringBuilder(64);
        for (byte value : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", value));
        return result.toString();
    }
}
