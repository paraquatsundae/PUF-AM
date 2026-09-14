package com.sentinut.farm;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.StrictMode;
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
import java.util.concurrent.Callable;

/**
 * Capacitor lifecycle for the Freenet node. Attach-if-port-taken if :7509 is
 * already bound; otherwise start the isolated :freenet process and exec the
 * bundled libfreenet.so. Probe and bring-up must not run on the main thread
 * (debug StrictMode). Plans/FREENET_NETWORK_PACK.md Phase 3.
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
    /** Short wait so a fast bind returns managed; JS waits longer on {@code starting}. */
    private static final int BIND_WAIT_MS = 4_000;
    private static final int BIND_POLL_MS = 250;

    private void runOffMain(PluginCall call, Callable<JSObject> work) {
        new Thread(() -> {
            try {
                call.resolve(work.call());
            } catch (Throwable t) {
                Log.w(TAG, "plugin", t);
                call.resolve(statusObject("failed", false, FreenetNodePolicy.failureMessage(t), null));
            }
        }, "freenet-host-plugin").start();
    }

    @PluginMethod
    public void start(PluginCall call) {
        runOffMain(call, () -> bringUp(getContext()));
    }

    @PluginMethod
    public void attach(PluginCall call) {
        runOffMain(call, () -> {
            if (probeLoopback()) return statusObject("attached", true, null, null);
            return statusObject("failed", false, "nothing listening on 127.0.0.1:7509", null);
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        runOffMain(call, () -> {
            Context ctx = getContext();
            try {
                Intent stop = new Intent(ctx, FreenetNodeService.class);
                stop.setAction(FreenetNodeService.ACTION_STOP);
                ctx.startService(stop);
                ctx.stopService(new Intent(ctx, FreenetNodeService.class));
            } catch (Throwable e) {
                Log.w(TAG, "stopService", e);
            }
            FreenetHostStatusStore.write(ctx, "stopped", false, null, null);
            // Never kill a third-party node — if :7509 still answers, we stay attached.
            if (probeLoopback()) {
                FreenetHostStatusStore.write(ctx, "attached", true, null, null);
                return statusObject("attached", true, null, null);
            }
            return statusObject("stopped", false, null, null);
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        final boolean probe = Boolean.TRUE.equals(call.getBoolean("probe", true));
        runOffMain(call, () -> {
            if (probe && probeLoopback()) {
                return statusObject("attached", true, null, null);
            }
            JSObject stored = FreenetHostStatusStore.read(getContext());
            if (stored != null) return stored;
            return statusObject("stopped", false, null, null);
        });
    }

    static JSObject bringUp(Context ctx) {
        if (probeLoopback()) {
            JSObject attached = statusObject("attached", true, null, null);
            FreenetHostStatusStore.write(ctx, "attached", true, null, null);
            return attached;
        }
        File binary = FreenetNodeService.findBinary(ctx);
        if (binary == null) {
            String looked = ctx.getApplicationInfo().nativeLibraryDir;
            String msg = NO_BINARY + " (looked in " + looked + ")";
            Log.w(TAG, msg);
            JSObject failed = statusObject("failed", false, msg, null);
            FreenetHostStatusStore.write(ctx, "failed", false, msg, null);
            return failed;
        }
        Log.i(TAG, "starting :freenet; binary=" + binary.getAbsolutePath());
        // Overwrite a stale fail-clean from a previous launch so the wait loop
        // does not treat last night's NetworkOnMainThread as this start.
        FreenetHostStatusStore.write(ctx, "starting", false, null, binary.getAbsolutePath());
        Intent intent = new Intent(ctx, FreenetNodeService.class);
        intent.setAction(FreenetNodeService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Throwable e) {
            String msg = FreenetNodePolicy.failureMessage(e);
            JSObject failed = statusObject("failed", false, msg, null);
            FreenetHostStatusStore.write(ctx, "failed", false, msg, null);
            return failed;
        }
        long deadline = System.currentTimeMillis() + BIND_WAIT_MS;
        while (System.currentTimeMillis() < deadline) {
            if (probeLoopback()) {
                JSObject managed = statusObject("managed", true, null, binary.getAbsolutePath());
                FreenetHostStatusStore.write(ctx, "managed", true, null, binary.getAbsolutePath());
                return managed;
            }
            JSObject stored = FreenetHostStatusStore.read(ctx);
            if (stored != null) {
                String mode = "";
                try {
                    mode = stored.getString("mode");
                } catch (Exception ignored) {
                    /* no mode field */
                }
                if ("failed".equals(mode)) return stored;
                if ("managed".equals(mode) || "attached".equals(mode)) return stored;
            }
            try {
                Thread.sleep(BIND_POLL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        JSObject starting = statusObject("starting", false, null, binary.getAbsolutePath());
        FreenetHostStatusStore.write(ctx, "starting", false, null, binary.getAbsolutePath());
        return starting;
    }

    static boolean probeLoopback() {
        StrictMode.ThreadPolicy previous = StrictMode.getThreadPolicy();
        StrictMode.setThreadPolicy(
                new StrictMode.ThreadPolicy.Builder(previous).permitNetwork().build());
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
            StrictMode.setThreadPolicy(previous);
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
