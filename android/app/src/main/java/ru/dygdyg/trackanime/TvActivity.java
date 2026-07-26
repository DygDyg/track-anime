package ru.dygdyg.trackanime;

import android.os.Bundle;
import android.os.Build;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

public final class TvActivity extends BaseWebActivity {
    @Override protected boolean isTvMode() { return true; }
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                            | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }
}
