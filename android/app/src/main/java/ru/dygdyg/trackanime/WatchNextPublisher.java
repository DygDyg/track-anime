package ru.dygdyg.trackanime;

import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

import androidx.tvprovider.media.tv.TvContractCompat;
import androidx.tvprovider.media.tv.WatchNextProgram;

/**
 * Publishes Continue-watching tiles into the system Watch Next row (Google TV / Android TV).
 * One tile per shikimoriId ({@code internalProviderId}).
 */
public final class WatchNextPublisher {
    private static final String LOG_TAG = "TrackAnimeWatchNext";

    public static final class Item {
        public final int shikimoriId;
        public final String title;
        public final String description;
        public final String posterUrl;
        public final String pageUrl;
        public final long positionMillis;
        public final long durationMillis;

        public Item(
                int shikimoriId,
                String title,
                String description,
                String posterUrl,
                String pageUrl,
                long positionMillis,
                long durationMillis
        ) {
            this.shikimoriId = shikimoriId;
            this.title = title;
            this.description = description;
            this.posterUrl = posterUrl;
            this.pageUrl = pageUrl;
            this.positionMillis = Math.max(0L, positionMillis);
            this.durationMillis = Math.max(0L, durationMillis);
        }
    }

    private WatchNextPublisher() {}

    public static void upsert(Context context, Item item) {
        if (context == null || item == null || item.shikimoriId <= 0) return;
        if (item.title == null || item.title.trim().isEmpty()) return;
        if (item.pageUrl == null || item.pageUrl.trim().isEmpty()) return;

        try {
            String providerId = String.valueOf(item.shikimoriId);
            Intent open = new Intent(context, TvActivity.class);
            open.setAction(Intent.ACTION_VIEW);
            open.setData(Uri.parse(item.pageUrl.trim()));
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            WatchNextProgram.Builder builder = new WatchNextProgram.Builder()
                    .setType(TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE)
                    .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                    .setLastEngagementTimeUtcMillis(System.currentTimeMillis())
                    .setTitle(item.title.trim())
                    .setInternalProviderId(providerId)
                    .setIntent(open)
                    .setLastPlaybackPositionMillis((int) Math.min(Integer.MAX_VALUE, item.positionMillis))
                    .setDurationMillis((int) Math.min(Integer.MAX_VALUE, Math.max(item.durationMillis, item.positionMillis + 1)));

            if (item.description != null && !item.description.trim().isEmpty()) {
                builder.setDescription(item.description.trim());
            }
            if (item.posterUrl != null && !item.posterUrl.trim().isEmpty()) {
                builder.setPosterArtUri(Uri.parse(item.posterUrl.trim()));
            }

            Long existingId = findProgramId(context, providerId);
            if (existingId != null) {
                Uri uri = ContentUris.withAppendedId(
                        TvContractCompat.WatchNextPrograms.CONTENT_URI,
                        existingId
                );
                int updated = context.getContentResolver().update(
                        uri,
                        builder.build().toContentValues(),
                        null,
                        null
                );
                Log.i(LOG_TAG, "Updated Watch Next id=" + existingId + " rows=" + updated);
            } else {
                Uri inserted = context.getContentResolver().insert(
                        TvContractCompat.WatchNextPrograms.CONTENT_URI,
                        builder.build().toContentValues()
                );
                Log.i(LOG_TAG, "Inserted Watch Next uri=" + inserted);
            }
        } catch (SecurityException error) {
            Log.w(LOG_TAG, "Watch Next permission denied", error);
        } catch (Exception error) {
            Log.w(LOG_TAG, "Watch Next upsert failed", error);
        }
    }

    public static void remove(Context context, int shikimoriId) {
        if (context == null || shikimoriId <= 0) return;
        try {
            Long existingId = findProgramId(context, String.valueOf(shikimoriId));
            if (existingId == null) return;
            Uri uri = ContentUris.withAppendedId(
                    TvContractCompat.WatchNextPrograms.CONTENT_URI,
                    existingId
            );
            int deleted = context.getContentResolver().delete(uri, null, null);
            Log.i(LOG_TAG, "Removed Watch Next id=" + existingId + " rows=" + deleted);
        } catch (SecurityException error) {
            Log.w(LOG_TAG, "Watch Next permission denied", error);
        } catch (Exception error) {
            Log.w(LOG_TAG, "Watch Next remove failed", error);
        }
    }

    /** Deletes all Watch Next programs published by this package. */
    public static void clearAll(Context context) {
        if (context == null) return;
        try {
            int deleted = context.getContentResolver().delete(
                    TvContractCompat.WatchNextPrograms.CONTENT_URI,
                    null,
                    null
            );
            Log.i(LOG_TAG, "Cleared Watch Next rows=" + deleted);
        } catch (SecurityException error) {
            Log.w(LOG_TAG, "Watch Next permission denied", error);
        } catch (Exception error) {
            Log.w(LOG_TAG, "Watch Next clear failed", error);
        }
    }

    private static Long findProgramId(Context context, String internalProviderId) {
        try (Cursor cursor = context.getContentResolver().query(
                TvContractCompat.WatchNextPrograms.CONTENT_URI,
                new String[] { TvContractCompat.WatchNextPrograms._ID },
                TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID + "=?",
                new String[] { internalProviderId },
                null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getLong(0);
            }
        } catch (Exception error) {
            Log.w(LOG_TAG, "Watch Next query failed", error);
        }
        return null;
    }
}
