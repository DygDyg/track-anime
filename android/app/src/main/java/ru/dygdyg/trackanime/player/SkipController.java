package ru.dygdyg.trackanime.player;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** OP/ED actionable window + one-shot auto-skip. */
public final class SkipController {
    private List<TaPlusApiClient.SkipInterval> intervals = new ArrayList<>();
    private final Set<String> autoSkipped = new HashSet<>();
    private boolean autoSkipEnabled;

    public void setIntervals(List<TaPlusApiClient.SkipInterval> next) {
        intervals = next != null ? new ArrayList<>(next) : new ArrayList<>();
        autoSkipped.clear();
    }

    public void setAutoSkipEnabled(boolean enabled) {
        autoSkipEnabled = enabled;
    }

    public boolean isAutoSkipEnabled() {
        return autoSkipEnabled;
    }

    public void clearAutoSkipMarks() {
        autoSkipped.clear();
    }

    public TaPlusApiClient.SkipInterval findActionable(double positionSeconds) {
        for (TaPlusApiClient.SkipInterval skip : intervals) {
            if (positionSeconds >= skip.startTime && positionSeconds < skip.endTime - 0.25) {
                return skip;
            }
        }
        return null;
    }

    /** Returns endTime to seek to, or -1. */
    public double pollAutoSkip(double positionSeconds) {
        if (!autoSkipEnabled) return -1;
        for (TaPlusApiClient.SkipInterval skip : intervals) {
            String key = skip.skipType + ":" + skip.startTime + ":" + skip.endTime;
            if (autoSkipped.contains(key)) continue;
            // Fire in first 5s of interval (same idea as web).
            if (positionSeconds >= skip.startTime && positionSeconds < skip.startTime + 5.0
                    && positionSeconds < skip.endTime) {
                autoSkipped.add(key);
                return skip.endTime;
            }
        }
        return -1;
    }

    public static String labelFor(TaPlusApiClient.SkipInterval skip) {
        if (skip == null) return "Пропустить";
        String t = skip.skipType == null ? "" : skip.skipType.toLowerCase();
        if (t.contains("ed") || t.contains("ending")) return "Пропустить эндинг";
        return "Пропустить опенинг";
    }
}
