package com.sentinut.farm;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PufomNsdPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
