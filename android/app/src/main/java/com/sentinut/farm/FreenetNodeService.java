package com.sentinut.farm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.IOException;

/**
 * Isolated {@code :freenet} process. Attach only when {@code :7509} is
 * Freenet 0.2; otherwise exec the bundled {@code libfreenet.so}
 * (android-arm64). Child death is fail-clean ({@code stopSelf}, no sticky
 * restart). Never kills a verified Freenet node on {@code :7509}.
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14.
 */
public class FreenetNodeService extends Service {
    static final String ACTION_START = "com.sentinut.farm.FREENET_START";
    static final String ACTION_STOP = "com.sentinut.farm.FREENET_STOP";
    private static final String CHANNEL = "freenet-host";
    private static final int NOTIFY_ID = 7509;

    private Process child;
    private volatile boolean stopping;
    private HandlerThread worker;
    private Handler workerHandler;

    @Override
    public void onCreate() {
        super.onCreate();
        worker = new HandlerThread("freenet-host-worker");
        worker.start();
        workerHandler = new Handler(worker.getLooper());
        installQuietDeath();
        try {
            ensureChannel();
            startHostForeground();
        } catch (Throwable t) {
            Log.e(FreenetHostPlugin.TAG, "onCreate", t);
            try {
                startHostForeground();
            } catch (Throwable ignored) {
                /* RemoteServiceException is worse than a missing icon */
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final Intent captured = intent;
        Handler handler = workerHandler;
        if (handler == null) {
            try {
                return handleStart(captured);
            } catch (Throwable t) {
                Log.e(FreenetHostPlugin.TAG, "onStartCommand", t);
                failClean(FreenetNodePolicy.failureMessage(t), null);
                return START_NOT_STICKY;
            }
        }
        handler.post(() -> {
            try {
                handleStart(captured);
            } catch (Throwable t) {
                Log.e(FreenetHostPlugin.TAG, "onStartCommand", t);
                failClean(FreenetNodePolicy.failureMessage(t), null);
            }
        });
        return START_NOT_STICKY;
    }

    private int handleStart(Intent intent) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopping = true;
            destroyChild();
            FreenetHostStatusStore.write(this, "stopped", false, null, null);
            finishQuiet();
            return START_NOT_STICKY;
        }
        if (FreenetNodePolicy.processAlive(child)) {
            Log.i(FreenetHostPlugin.TAG, "child still running — not respawning");
            File live = findBinary(this);
            FreenetHostStatusStore.write(
                    this, "managed", FreenetHostPlugin.probeLoopback(), null,
                    live != null ? live.getAbsolutePath() : null);
            return START_NOT_STICKY;
        }
        boolean portTaken = FreenetHostPlugin.probeLoopback();
        boolean looksLike = portTaken && FreenetHostPlugin.looksLikeFreenet();
        File binary = findBinary(this);
        boolean ours = FreenetLoopbackOwner.listenerIsOurs(FreenetHostPlugin.WS_PORT);
        if (FreenetNodePolicy.shouldWaitBeforeSpawn(portTaken, looksLike, ours)) {
            FreenetHostPlugin.waitUntilPortFree();
            portTaken = FreenetHostPlugin.probeLoopback();
            looksLike = portTaken && FreenetHostPlugin.looksLikeFreenet();
            ours = FreenetLoopbackOwner.listenerIsOurs(FreenetHostPlugin.WS_PORT);
        }
        FreenetNodePolicy.Action action = FreenetNodePolicy.decide(portTaken, looksLike, binary, ours);
        if (action == FreenetNodePolicy.Action.REUSE) {
            FreenetHostStatusStore.write(
                    this, "managed", true, null, binary != null ? binary.getAbsolutePath() : null);
            return START_NOT_STICKY;
        }
        if (action == FreenetNodePolicy.Action.ATTACH) {
            FreenetHostStatusStore.write(this, "attached", true, null, null);
            finishQuiet();
            return START_NOT_STICKY;
        }
        if (action == FreenetNodePolicy.Action.OCCUPIED) {
            failClean(FreenetNodePolicy.PORT_NOT_FREENET, null);
            return START_NOT_STICKY;
        }
        if (action != FreenetNodePolicy.Action.SPAWN) {
            String looked = getApplicationInfo().nativeLibraryDir;
            String msg = FreenetHostPlugin.NO_BINARY + " (looked in " + looked + ")";
            Log.w(FreenetHostPlugin.TAG, msg);
            failClean(msg, null);
            return START_NOT_STICKY;
        }
        try {
            spawn(binary);
            FreenetHostStatusStore.write(this, "starting", false, null, binary.getAbsolutePath());
            return START_NOT_STICKY;
        } catch (Throwable e) {
            String msg = FreenetNodePolicy.failureMessage(e);
            Log.w(FreenetHostPlugin.TAG, "spawn", e);
            failClean(msg, binary.getAbsolutePath());
            return START_NOT_STICKY;
        }
    }

    @Override
    public void onDestroy() {
        stopping = true;
        destroyChild();
        if (worker != null) {
            worker.quitSafely();
            worker = null;
            workerHandler = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static File findBinary(Context ctx) {
        File nativeLib = new File(ctx.getApplicationInfo().nativeLibraryDir, "libfreenet.so");
        if (nativeLib.isFile()) {
            Log.i(FreenetHostPlugin.TAG, "binary " + nativeLib.getAbsolutePath());
            return nativeLib;
        }
        File files = new File(ctx.getFilesDir(), "freenet/android-arm64/freenet");
        if (files.isFile()) return files;
        File vendorHint = new File(ctx.getFilesDir(), "freenet/libfreenet.so");
        if (vendorHint.isFile()) return vendorHint;
        Log.w(FreenetHostPlugin.TAG, "no binary in " + ctx.getApplicationInfo().nativeLibraryDir);
        return null;
    }

    static File findWrapper(Context ctx) {
        File wrap = new File(ctx.getApplicationInfo().nativeLibraryDir, "libfnwrap.so");
        return wrap.isFile() ? wrap : null;
    }

    static File configDir(Context ctx) {
        return new File(ctx.getFilesDir(), "freenet/config");
    }

    static File dataDir(Context ctx) {
        return new File(ctx.getFilesDir(), "freenet/data");
    }

    static File logDir(Context ctx) {
        return new File(ctx.getFilesDir(), "freenet/logs");
    }

    private void spawn(File binary) throws IOException {
        destroyChild();
        stopping = false;
        File cfg = configDir(this);
        File data = dataDir(this);
        File logs = logDir(this);
        if (!cfg.mkdirs() && !cfg.isDirectory()) {
            throw new IOException("cannot create " + cfg.getAbsolutePath());
        }
        if (!data.mkdirs() && !data.isDirectory()) {
            throw new IOException("cannot create " + data.getAbsolutePath());
        }
        if (!logs.mkdirs() && !logs.isDirectory()) {
            throw new IOException("cannot create " + logs.getAbsolutePath());
        }
        File wrapper = findWrapper(this);
        ProcessBuilder pb = new ProcessBuilder(FreenetNodePolicy.spawnCommand(
                wrapper != null ? wrapper.getAbsolutePath() : null,
                binary.getAbsolutePath(),
                cfg.getAbsolutePath(),
                data.getAbsolutePath(),
                logs.getAbsolutePath()));
        pb.directory(data);
        pb.redirectErrorStream(true);
        File cache = getCacheDir();
        FreenetNodePolicy.applySpawnEnv(
                pb.environment(),
                getFilesDir().getAbsolutePath(),
                cache != null ? cache.getAbsolutePath() : null);
        child = pb.start();
        watchChild(child, binary.getAbsolutePath(), logs);
        Log.i(FreenetHostPlugin.TAG, "spawned " + binary.getAbsolutePath()
                + (wrapper != null ? " via wrap" : ""));
    }

    private void watchChild(Process proc, String binaryPath, File logDir) {
        Thread watch = new Thread(() -> {
            drain(proc, logDir);
            int code = 1;
            try {
                code = proc.waitFor();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            if (stopping) return;
            boolean portTaken = FreenetHostPlugin.probeLoopback();
            boolean looksLike = portTaken && FreenetHostPlugin.looksLikeFreenet();
            boolean ours = FreenetLoopbackOwner.listenerIsOurs(FreenetHostPlugin.WS_PORT);
            FreenetNodePolicy.AfterDeath next =
                    FreenetNodePolicy.afterDeath(portTaken, looksLike, ours);
            if (next == FreenetNodePolicy.AfterDeath.REUSE) {
                File live = findBinary(this);
                FreenetHostStatusStore.write(
                        this, "managed", true, null, live != null ? live.getAbsolutePath() : null);
                finishQuiet();
                return;
            }
            if (next == FreenetNodePolicy.AfterDeath.ATTACH) {
                FreenetHostStatusStore.write(this, "attached", true, null, null);
                finishQuiet();
                return;
            }
            String msg = portTaken && !looksLike
                    ? FreenetNodePolicy.PORT_NOT_FREENET
                    : FreenetNodePolicy.childDiedMessage(code);
            Log.w(FreenetHostPlugin.TAG, msg);
            failClean(msg, binaryPath);
        }, "freenet-watch");
        watch.setDaemon(true);
        watch.start();
    }

    private static void drain(Process proc, File logDir) {
        File ringLast = logDir != null ? FreenetLogPeerCount.ringLastFile(logDir) : null;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
            String line;
            int n = 0;
            while ((line = reader.readLine()) != null) {
                if (n < 40) Log.i(FreenetHostPlugin.TAG, "node: " + line);
                n++;
                if (ringLast != null && FreenetLogPeerCount.lineHasPeerCount(line)) {
                    FreenetLogPeerCount.writeLatestLine(ringLast, line);
                }
            }
        } catch (IOException ignored) {
            /* child closed the pipe */
        }
    }

    private void failClean(String msg, String binaryPath) {
        FreenetHostStatusStore.write(this, "failed", false, msg, binaryPath);
        finishQuiet();
    }

    private void finishQuiet() {
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Throwable ignored) {
            /* already gone */
        }
        stopSelf();
    }

    /**
     * SIGTERM then SIGKILL of {@code child} only — the Process we spawned.
     * Never a third-party PID or {@code org.freenet.androidnode}.
     */
    private void destroyChild() {
        Process proc = child;
        child = null;
        if (proc == null) return;
        proc.destroy();
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                if (!proc.waitFor(4, java.util.concurrent.TimeUnit.SECONDS)) {
                    proc.destroyForcibly();
                }
            } else {
                proc.waitFor();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            proc.destroy();
        }
    }

    /**
     * Java crashes in {@code :freenet} must not raise the package crash dialog.
     * The WebView process is a different PID and stays up.
     */
    private void installQuietDeath() {
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            Log.e(FreenetHostPlugin.TAG, "uncaught in :freenet", error);
            try {
                String msg = error.getMessage() != null ? error.getMessage() : "freenet process failed";
                FreenetHostStatusStore.write(this, "failed", false, msg, null);
            } catch (Throwable ignored) {
                /* status file is best-effort */
            }
            try {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } catch (Throwable ignored) {
                /* */
            }
            android.os.Process.killProcess(android.os.Process.myPid());
        });
    }

    private void startHostForeground() {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle(getString(R.string.freenet_host_notification_title))
                .setContentText(getString(R.string.freenet_host_notification_text))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFY_ID, notification);
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager mgr = getSystemService(NotificationManager.class);
        if (mgr == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                getString(R.string.freenet_host_channel_name),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.freenet_host_channel_desc));
        mgr.createNotificationChannel(channel);
    }
}
