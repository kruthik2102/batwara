package com.batwara.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BatwaraSystemPlugin.class);
        super.onCreate(savedInstanceState);
        // Match the app background before the web layer paints, so dark mode doesn't flash white.
        paintBackground(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        paintBackground(newConfig);
    }

    private void paintBackground(Configuration config) {
        boolean night = (config.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(night ? Color.BLACK : Color.parseColor("#F2F2F7"));
        }
    }
}
