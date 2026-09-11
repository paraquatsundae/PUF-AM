package com.sentinut.farm;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Status file shared by the WebView process and {@code :freenet}. Same UID,
 * same files dir — no JNI, no Binder to Freenet.
 */
final class FreenetHostStatusStore {
    private static final String FILE = "freenet-host-status.json";

    private FreenetHostStatusStore() {}

    static void write(Context ctx, String mode, boolean reachable, String lastError, String binaryPath) {
        try {
            JSObject o = FreenetHostPlugin.statusObject(mode, reachable, lastError, binaryPath);
            FileOutputStream out = new FileOutputStream(new File(ctx.getFilesDir(), FILE));
            out.write(o.toString().getBytes(StandardCharsets.UTF_8));
            out.close();
        } catch (Exception e) {
            Log.w(FreenetHostPlugin.TAG, "status write", e);
        }
    }

    static JSObject read(Context ctx) {
        File file = new File(ctx.getFilesDir(), FILE);
        if (!file.isFile()) return null;
        try {
            FileInputStream in = new FileInputStream(file);
            byte[] buf = new byte[(int) file.length()];
            int n = in.read(buf);
            in.close();
            if (n <= 0) return null;
            return new JSObject(new String(buf, 0, n, StandardCharsets.UTF_8));
        } catch (Exception e) {
            Log.w(FreenetHostPlugin.TAG, "status read", e);
            return null;
        }
    }
}
