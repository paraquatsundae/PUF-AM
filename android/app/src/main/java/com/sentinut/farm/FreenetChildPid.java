package com.sentinut.farm;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Pid of the bundled {@code libfreenet.so} we spawned. The {@code :freenet}
 * service can be LMK'd while the child keeps :7509; Stop then has no
 * {@code Process} handle. Never used for Freenet Android Node.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-16 (hidepid leftover).
 */
final class FreenetChildPid {
    private static final String FILE = "freenet/child.pid";

    private FreenetChildPid() {}

    static File file(Context ctx) {
        return new File(ctx.getFilesDir(), FILE);
    }

    static File file(File filesDir) {
        return new File(filesDir, FILE);
    }

    /** Positive decimal pid, or {@code -1}. */
    static int parsePid(String text) {
        if (text == null) return -1;
        try {
            int pid = Integer.parseInt(text.trim());
            return pid > 0 ? pid : -1;
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    static void write(Context ctx, Process proc) {
        if (ctx == null || proc == null) return;
        int pid = pidOf(proc);
        if (pid > 0) writePid(ctx, pid);
    }

    /**
     * Android's {@code java.lang.Process} has no {@code pid()} in the compile
     * SDK. ART may still expose {@code pid()} (API 31+) or a {@code pid} field.
     */
    static int pidOf(Process proc) {
        if (proc == null) return -1;
        try {
            Object v = Process.class.getMethod("pid").invoke(proc);
            if (v instanceof Number) {
                int pid = ((Number) v).intValue();
                if (pid > 0) return pid;
            }
        } catch (Throwable ignored) {
            /* compile SDK / older ART */
        }
        try {
            java.lang.reflect.Field f = proc.getClass().getDeclaredField("pid");
            f.setAccessible(true);
            int pid = f.getInt(proc);
            return pid > 0 ? pid : -1;
        } catch (Throwable e) {
            Log.w(FreenetHostPlugin.TAG, "child pid", e);
            return -1;
        }
    }

    static void writePid(Context ctx, int pid) {
        if (ctx == null) return;
        writeTo(file(ctx), pid);
    }

    static void writeTo(File dest, int pid) {
        if (dest == null || pid <= 0) return;
        File parent = dest.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return;
        try (FileOutputStream out = new FileOutputStream(dest)) {
            out.write(Integer.toString(pid).getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            Log.w(FreenetHostPlugin.TAG, "child pid write", e);
        }
    }

    static int read(Context ctx) {
        if (ctx == null) return -1;
        return readFrom(file(ctx));
    }

    static int readFrom(File dest) {
        if (dest == null || !dest.isFile()) return -1;
        try (FileInputStream in = new FileInputStream(dest)) {
            byte[] buf = new byte[(int) dest.length()];
            int n = in.read(buf);
            if (n <= 0) return -1;
            return parsePid(new String(buf, 0, n, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return -1;
        }
    }

    static void clear(Context ctx) {
        if (ctx == null) return;
        clearFile(file(ctx));
    }

    static void clearFile(File dest) {
        if (dest == null) return;
        if (dest.isFile() && !dest.delete()) {
            Log.w(FreenetHostPlugin.TAG, "child pid clear");
        }
    }

    /**
     * SIGTERM, wait, SIGKILL of the pid we persisted. Never a FAN pid
     * ({@link FreenetNodePolicy#maySignalPersistedExe}).
     */
    static boolean stopPersisted(Context ctx) {
        int pid = read(ctx);
        if (pid <= 0) return false;
        String exe = FreenetLoopbackOwner.exeForPid(pid);
        if (!FreenetNodePolicy.maySignalPersistedExe(exe)) {
            clear(ctx);
            return false;
        }
        boolean sent = FreenetLoopbackOwner.signalTerm(pid);
        long deadline = System.currentTimeMillis() + FreenetNodePolicy.PORT_WAIT_MS;
        while (FreenetHostPlugin.probeLoopback() && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(FreenetNodePolicy.PORT_POLL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        if (FreenetHostPlugin.probeLoopback()
                && FreenetNodePolicy.maySignalPersistedExe(FreenetLoopbackOwner.exeForPid(pid))) {
            FreenetLoopbackOwner.signalKill(pid);
        }
        clear(ctx);
        return sent;
    }
}
