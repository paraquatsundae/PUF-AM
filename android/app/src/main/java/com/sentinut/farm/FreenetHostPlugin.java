package com.sentinut.farm;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.StrictMode;
import android.util.Log;

import com.getcapacitor.JSArray;
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
 * Capacitor lifecycle for the Freenet node. Attach only when :7509 is Freenet
 * 0.2 ({@code GET /v1/version} or WS hello); otherwise start the isolated
 * {@code :freenet} process and exec the bundled libfreenet.so. TCP alone is
 * not enough. Probe and bring-up must not run on the main thread (debug
 * StrictMode). Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14.
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
            if (probeLoopback() && looksLikeFreenet()) {
                return statusObject("attached", true, null, null);
            }
            if (probeLoopback()) {
                return statusObject("failed", false, FreenetNodePolicy.PORT_NOT_FREENET, null);
            }
            return statusObject("failed", false, "nothing listening on 127.0.0.1:7509", null);
        });
    }

    @PluginMethod
    public void stopAllOurs(PluginCall call) {
        runOffMain(call, () -> {
            Context ctx = getContext();
            stopOurService(ctx);
            FreenetLoopbackOwner.Listener listener = FreenetLoopbackOwner.inspect(WS_PORT);
            if (listener != null
                    && listener.pid != null
                    && FreenetNodePolicy.mayStopListener(listener.ourUid, listener.exe)) {
                FreenetLoopbackOwner.signalTerm(listener.pid);
            }
            LeftoverSnap snap = classifyPort(ctx);
            if (FreenetNodePolicy.shouldWaitAfterStop(snap.port, snap.leftover)) {
                waitUntilPortFree();
                snap = classifyPort(ctx);
            }
            String mode = FreenetNodePolicy.modeAfterStop(snap.freenet, snap.leftover);
            FreenetHostStatusStore.write(ctx, mode, snap.freenet, null, null);
            JSObject o = statusObject(mode, snap.freenet, null, null);
            putLeftover(o, snap);
            o.put("portFree", !snap.port);
            o.put("stoppedOurs", true);
            return o;
        });
    }

    @PluginMethod
    public void openFreenetAndroidNode(PluginCall call) {
        runOffMain(call, () -> {
            JSObject o = new JSObject();
            Context ctx = getContext();
            try {
                PackageManager pm = ctx.getPackageManager();
                Intent launch = pm.getLaunchIntentForPackage(FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE);
                if (launch == null) {
                    o.put("opened", false);
                    return o;
                }
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(launch);
                o.put("opened", true);
                return o;
            } catch (Throwable e) {
                Log.w(TAG, "openFreenetAndroidNode", e);
                o.put("opened", false);
                return o;
            }
        });
    }

    private static void stopOurService(Context ctx) {
        try {
            Intent stop = new Intent(ctx, FreenetNodeService.class);
            stop.setAction(FreenetNodeService.ACTION_STOP);
            ctx.startService(stop);
            ctx.stopService(new Intent(ctx, FreenetNodeService.class));
        } catch (Throwable e) {
            Log.w(TAG, "stopOurService", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        runOffMain(call, () -> {
            Context ctx = getContext();
            String mode = storedMode(FreenetHostStatusStore.read(ctx));
            // Never stop a node we only attached to (Freenet Android Node / leftover).
            if (!FreenetNodePolicy.mayStopOurNode(mode)) {
                if (probeLoopback() && looksLikeFreenet()) {
                    FreenetHostStatusStore.write(ctx, "attached", true, null, null);
                    return statusObject("attached", true, null, null);
                }
                FreenetHostStatusStore.write(ctx, "stopped", false, null, null);
                return statusObject("stopped", false, null, null);
            }
            stopOurService(ctx);
            FreenetHostStatusStore.write(ctx, "stopped", false, null, null);
            // Our child is gone. If :7509 is still Freenet 0.2, that is someone else.
            if (probeLoopback() && looksLikeFreenet()) {
                FreenetHostStatusStore.write(ctx, "attached", true, null, null);
                return statusObject("attached", true, null, null);
            }
            return statusObject("stopped", false, null, null);
        });
    }

    static String storedMode(JSObject stored) {
        if (stored == null) return "";
        try {
            String mode = stored.getString("mode");
            return mode != null ? mode : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        final boolean probe = Boolean.TRUE.equals(call.getBoolean("probe", true));
        runOffMain(call, () -> {
            if (probe && probeLoopback() && looksLikeFreenet()) {
                JSObject stored = FreenetHostStatusStore.read(getContext());
                String storedMode = storedMode(stored);
                boolean storedOurs = "managed".equals(storedMode) || "starting".equals(storedMode);
                boolean listenerOurs = FreenetLoopbackOwner.listenerIsOurs(WS_PORT);
                String mode = FreenetNodePolicy.modeWhenPortUp(storedOurs, listenerOurs);
                String binaryPath = null;
                if (stored != null) {
                    try {
                        JSObject bin = stored.getJSObject("binary");
                        if (bin != null) binaryPath = bin.getString("path");
                    } catch (Exception ignored) {
                        /* no binary */
                    }
                }
                JSObject live = statusObject(mode, true, null, binaryPath);
                LeftoverSnap snap = classifyPort(getContext());
                if (!"ours".equals(snap.leftover) && !"none".equals(snap.leftover)) {
                    putLeftover(live, snap);
                }
                File logs = FreenetNodeService.logDir(getContext());
                live.put("logDir", logs.getAbsolutePath());
                JSObject ring = FreenetNodeStatusQuery.applyLogPeerCount(
                        FreenetNodeStatusQuery.fetchRing(WS_HOST, WS_PORT), logs);
                if (ring != null) live.put("nodeRing", ring);
                JSArray traffic = FreenetLogContractTraffic.readDir(logs);
                if (traffic != null && traffic.length() > 0) live.put("contractTraffic", traffic);
                return live;
            }
            JSObject stored = FreenetHostStatusStore.read(getContext());
            if (stored != null) return stored;
            return statusObject("stopped", false, null, null);
        });
    }

    static JSObject bringUp(Context ctx) {
        boolean portTaken = probeLoopback();
        boolean looksLike = portTaken && looksLikeFreenet();
        File binary = FreenetNodeService.findBinary(ctx);
        String priorMode = storedMode(FreenetHostStatusStore.read(ctx));
        boolean storedOurs = "managed".equals(priorMode) || "starting".equals(priorMode);
        boolean listenerOurs = FreenetLoopbackOwner.listenerIsOurs(WS_PORT);
        if (FreenetNodePolicy.reuseOurListener(portTaken, looksLike, storedOurs, listenerOurs)) {
            String path = binary != null ? binary.getAbsolutePath() : null;
            JSObject managed = statusObject("managed", true, null, path);
            FreenetHostStatusStore.write(ctx, "managed", true, null, path);
            return managed;
        }
        if (FreenetNodePolicy.shouldWaitBeforeSpawn(portTaken, looksLike, listenerOurs)) {
            waitUntilPortFree();
            portTaken = probeLoopback();
            looksLike = portTaken && looksLikeFreenet();
            priorMode = storedMode(FreenetHostStatusStore.read(ctx));
            storedOurs = "managed".equals(priorMode) || "starting".equals(priorMode);
            listenerOurs = FreenetLoopbackOwner.listenerIsOurs(WS_PORT);
            if (FreenetNodePolicy.reuseOurListener(portTaken, looksLike, storedOurs, listenerOurs)) {
                String path = binary != null ? binary.getAbsolutePath() : null;
                JSObject managed = statusObject("managed", true, null, path);
                FreenetHostStatusStore.write(ctx, "managed", true, null, path);
                return managed;
            }
        }
        FreenetNodePolicy.Action action = FreenetNodePolicy.decide(portTaken, looksLike, binary, listenerOurs);
        if (action == FreenetNodePolicy.Action.REUSE) {
            String path = binary != null ? binary.getAbsolutePath() : null;
            JSObject managed = statusObject("managed", true, null, path);
            FreenetHostStatusStore.write(ctx, "managed", true, null, path);
            return managed;
        }
        if (action == FreenetNodePolicy.Action.ATTACH) {
            LeftoverSnap snap = classifyPort(ctx);
            JSObject attached = statusObject("attached", true, null, null);
            putLeftover(attached, snap);
            FreenetHostStatusStore.write(ctx, "attached", true, null, null);
            return attached;
        }
        if (action == FreenetNodePolicy.Action.OCCUPIED) {
            String msg = FreenetNodePolicy.PORT_NOT_FREENET;
            JSObject failed = statusObject("failed", false, msg, null);
            FreenetHostStatusStore.write(ctx, "failed", false, msg, null);
            return failed;
        }
        if (action != FreenetNodePolicy.Action.SPAWN || binary == null) {
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
            if (probeLoopback() && looksLikeFreenet()) {
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

    static boolean looksLikeFreenet() {
        return FreenetNodeStatusQuery.identifyFreenet02(WS_HOST, WS_PORT);
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

    static final class LeftoverSnap {
        boolean port;
        boolean freenet;
        String leftover;
        String leftoverPkg;
    }

    static LeftoverSnap classifyPort(Context ctx) {
        LeftoverSnap snap = new LeftoverSnap();
        snap.port = probeLoopback();
        snap.freenet = snap.port && looksLikeFreenet();
        FreenetLoopbackOwner.Listener again = snap.port ? FreenetLoopbackOwner.inspect(WS_PORT) : null;
        String[] pkgs = FreenetLoopbackOwner.packagesForUid(ctx, again);
        boolean ourUid = again != null && again.ourUid;
        String exe = again != null ? again.exe : null;
        snap.leftover = FreenetNodePolicy.classifyLeftover(snap.freenet, ourUid, exe, pkgs);
        if ("foreign".equals(snap.leftover)
                && FreenetLoopbackOwner.isInstalled(ctx, FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE)
                && FreenetNodePolicy.containsPackage(
                        pkgs, FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE)) {
            snap.leftover = "android-node";
        }
        snap.leftoverPkg =
                FreenetNodePolicy.containsPackage(pkgs, FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE)
                        ? FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE
                        : null;
        return snap;
    }

    static void putLeftover(JSObject o, LeftoverSnap snap) {
        o.put("leftover", snap.leftover);
        if (snap.leftoverPkg != null) o.put("leftoverPackage", snap.leftoverPkg);
    }

    /** Sleep-poll until :7509 is free or {@link FreenetNodePolicy#PORT_WAIT_MS}. */
    static boolean waitUntilPortFree() {
        long deadline = System.currentTimeMillis() + FreenetNodePolicy.PORT_WAIT_MS;
        while (probeLoopback()) {
            if (System.currentTimeMillis() >= deadline) return false;
            try {
                Thread.sleep(FreenetNodePolicy.PORT_POLL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return !probeLoopback();
            }
        }
        return true;
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
