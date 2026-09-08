package ru.dygdyg.trackanime;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Shows history-new FCM pushes while the WebView shell is backgrounded or closed. */
public final class TrackAnimeFirebaseMessagingService extends FirebaseMessagingService {
    public static final String CHANNEL_ID = "history_new";
    private static final String LOG_TAG = "TrackAnimeFcm";
    private static final int FALLBACK_NOTIFICATION_ID = 42001;

    @Override
    public void onNewToken(String token) {
        Log.i(LOG_TAG, "FCM token refreshed");
        // Site re-registers on next open via TrackAnimeAndroid.requestFcmToken.
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        ensureChannel();

        Map<String, String> data = message.getData();
        String title = firstNonEmpty(
                data.get("title"),
                message.getNotification() != null ? message.getNotification().getTitle() : null,
                "Track Anime"
        );
        String body = firstNonEmpty(
                data.get("body"),
                message.getNotification() != null ? message.getNotification().getBody() : null,
                ""
        );
        String url = firstNonEmpty(data.get("url"), "https://track-anime.dygdyg.ru/");
        String tag = firstNonEmpty(data.get("tag"), "history-new");

        Intent open = new Intent(this, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.setData(Uri.parse(url));
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pending = PendingIntent.getActivity(
                this,
                tag.hashCode(),
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.site_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pending);

        int notificationId = tag.hashCode();
        if (notificationId == 0) notificationId = FALLBACK_NOTIFICATION_ID;

        try {
            NotificationManagerCompat.from(this).notify(tag, notificationId, builder.build());
        } catch (SecurityException error) {
            Log.w(LOG_TAG, "Notification permission missing", error);
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Новые серии",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Уведомления о новых сериях из вашей истории");
        manager.createNotificationChannel(channel);
    }

    private static String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }
}
