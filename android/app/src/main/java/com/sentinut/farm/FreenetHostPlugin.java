package com.sentinut.farm;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Capacitor lifecycle for the Freenet node. Product path is attach-if-port-taken
 * (Freenet Android Node on 127.0.0.1:7509). Our :freenet process is optional
 * and must not block attach. Plans/FREENET_NETWORK_PACK.md Phase 3.
 */
@CapacitorPlugin(name = "FreenetHost")
public class FreenetHostPlugin extends Plugin {
    static final String TAG = "FreenetHost";
    static final String HOST_ID = "puf-freenet-host-android";
    static final String WS_HOST = "127.0.0.1";
    static final int WS_PORT = 7509;
    static final String WS_URL = "ws://127.0.0.1:7509/v1/contract/command";
    static final String NO_BINARY = "no android-arm64 binary";
    private static final int PROBE_MS = 400;

    @PluginMethod
    public void start(PluginCall call) {
        call.resolve(bringUp(getContext()));
    }

    @PluginMethod
    public void attach(PluginCall call) {
        if (probeLoopback()) {
            call.resolve(statusObject("attached", true, null, null));
            return;
        }
        call.resolve(statusObject("failed", false, "nothing listening on 127.0.0.1:7509", null));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        try {
            ctx.stopService(new Intent(ctx, FreenetNodeService.class));
        } catch (Exception e) {
            Log.w(TAG, "stopService", e);
        }
        FreenetHostStatusStore.write(ctx, "stopped", false, null, null);
        // Never kill Freenet Android Node — if :7509 still answers, we stay attached.
        if (probeLoopback()) {
            call.resolve(statusObject("attached", true, null, null));
            return;
        }
        call.resolve(statusObject("stopped", false, null, null));
    }

    @PluginMethod
    public void status(PluginCall call) {
        boolean probe = Boolean.TRUE.equals(call.getBoolean("probe", true));
        if (probe && probeLoopback()) {
            call.resolve(statusObject("attached", true, null, null));
            return;
        }
        JSObject stored = FreenetHostStatusStore.read(getContext());
        if (stored != null) {
            call.resolve(stored);
            return;
        }
        call.resolve(statusObject("stopped", false, null, null));
    }

    static JSObject bringUp(Context ctx) {
        if (probeLoopback()) {
            JSObject attached = statusObject("attached", true, null, null);
            FreenetHostStatusStore.write(ctx, "attached", true, null, null);
            return attached;
        }
        File binary = FreenetNodeService.findBinary(ctx);
        if (binary == null) {
            JSObject failed = statusObject("failed", false, NO_BINARY, null);
            FreenetHostStatusStore.write(ctx, "failed", false, NO_BINARY, null);
            return failed;
        }
        Intent intent = new Intent(ctx, FreenetNodeService.class);
        intent.setAction(FreenetNodeService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : NO_BINARY;
            JSObject failed = statusObject("failed", false, msg, null);
            FreenetHostStatusStore.write(ctx, "failed", false, msg, null);
            return failed;
        }
        if (probeLoopback()) {
            return statusObject("managed", true, null, binary.getAbsolutePath());
        }
        return statusObject("starting", false, null, binary.getAbsolutePath());
    }

    static boolean probeLoopback() {
        Socket socket = null;
        try {
            socket = new Socket();
            socket.connect(new InetSocketAddress(WS_HOST, WS_PORT), PROBE_MS);
            return true;
        } catch (IOException e) {
            return false;
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    static JSObject statusObject(String mode, boolean reachable, String lastError, String binaryPath) {
        JSObject o = new JSObject();
        o.put("hostId", HOST_ID);
        o.put("mode", mode);
        o.put("reachable", reachable);
        o.put("wsUrl", WS_URL);
        o.put("wsHost", WS_HOST);
        o.put("wsPort", WS_PORT);
        o.put("configDir", "");
        o.put("dataDir", "");
        o.put("logDir", "");
        o.put("updateRequired", false);
        if (lastError != null) o.put("lastError", lastError);
        if (binaryPath != null) {
            JSObject bin = new JSObject();
            bin.put("path", binaryPath);
            bin.put("source", "bundled");
            o.put("binary", bin);
        }
        return o;
    }
}
