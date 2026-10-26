package ru.dygdyg.trackanime.player;

import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;

/** Single tap / double-tap ±10 / horizontal swipe seek / vertical brightness|volume. */
public final class GestureSeekHelper implements View.OnTouchListener {
    public interface Callbacks {
        void onSingleTap();
        void onSeekDelta(int deltaSeconds);
        void onVerticalLeft(float deltaFraction);
        void onVerticalRight(float deltaFraction);
        void onGestureHud(String text);
        void onGestureHudClear();
        boolean isFullscreen();
    }

    private final Callbacks callbacks;
    private final int touchSlop;
    private float downX;
    private float downY;
    private long downAt;
    private long lastTapAt;
    private float lastTapX;
    private boolean tracking;
    private boolean horizontal;
    private boolean vertical;
    private boolean leftHalf;
    private int accumulatedSeek;
    private float startY;

    public GestureSeekHelper(View host, Callbacks callbacks) {
        this.callbacks = callbacks;
        this.touchSlop = ViewConfiguration.get(host.getContext()).getScaledTouchSlop();
        host.setOnTouchListener(this);
    }

    @Override
    public boolean onTouch(View v, MotionEvent event) {
        final int action = event.getActionMasked();
        final float x = event.getX();
        final float y = event.getY();
        final int w = Math.max(1, v.getWidth());
        final int h = Math.max(1, v.getHeight());

        switch (action) {
            case MotionEvent.ACTION_DOWN:
                downX = x;
                downY = y;
                startY = y;
                downAt = System.currentTimeMillis();
                tracking = true;
                horizontal = false;
                vertical = false;
                leftHalf = x < w / 2f;
                accumulatedSeek = 0;
                return true;
            case MotionEvent.ACTION_MOVE:
                if (!tracking) return false;
                float dx = x - downX;
                float dy = y - downY;
                if (!horizontal && !vertical) {
                    if (Math.abs(dx) > touchSlop && Math.abs(dx) > Math.abs(dy)) {
                        horizontal = true;
                    } else if (callbacks.isFullscreen()
                            && Math.abs(dy) > touchSlop
                            && Math.abs(dy) > Math.abs(dx)) {
                        vertical = true;
                    }
                }
                if (horizontal) {
                    int steps = Math.round(dx / (w * 0.05f));
                    int delta = steps * 10 - accumulatedSeek;
                    if (delta != 0) {
                        accumulatedSeek = steps * 10;
                        callbacks.onSeekDelta(delta);
                        callbacks.onGestureHud((accumulatedSeek >= 0 ? "+" : "") + accumulatedSeek + " с");
                    }
                    return true;
                }
                if (vertical) {
                    float frac = (startY - y) / h;
                    startY = y;
                    if (leftHalf) callbacks.onVerticalLeft(frac);
                    else callbacks.onVerticalRight(frac);
                    return true;
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (!tracking) return false;
                tracking = false;
                callbacks.onGestureHudClear();
                if (horizontal || vertical) return true;
                long now = System.currentTimeMillis();
                boolean quick = now - downAt < ViewConfiguration.getTapTimeout() * 2L
                        && Math.hypot(x - downX, y - downY) < touchSlop * 2;
                if (!quick) return true;
                if (now - lastTapAt < 350 && Math.abs(x - lastTapX) < w * 0.35f) {
                    boolean right = x >= w / 2f;
                    callbacks.onSeekDelta(right ? 10 : -10);
                    callbacks.onGestureHud(right ? "+10 с" : "−10 с");
                    lastTapAt = 0;
                } else {
                    lastTapAt = now;
                    lastTapX = x;
                    v.postDelayed(() -> {
                        if (lastTapAt != 0 && System.currentTimeMillis() - lastTapAt >= 300) {
                            lastTapAt = 0;
                            callbacks.onSingleTap();
                        }
                    }, 320);
                }
                return true;
            default:
                return false;
        }
    }
}
