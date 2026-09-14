package com.sentinut.farm;

import java.io.File;
import java.util.Map;

/**
 * Attach only when :7509 is Freenet 0.2, then spawn the bundled android-arm64
 * node, else fail clean. TCP alone is not enough. A dead child never restarts
 * the service (no crash-dialog loop) and never implies we killed a verified
 * Freenet node on :7509.
 * Pure so the JUnit suite can cover it without a device.
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (attach only if Freenet 0.2).
 */
final class FreenetNodePolicy {
    enum Action {
        ATTACH,
        SPAWN,
        MISSING,
        OCCUPIED,
        /** Same-uid leftover of our {@code libfreenet.so} — stay managed, do not spawn. */
        REUSE
    }

    enum AfterDeath {
        ATTACH,
        REUSE,
        FAIL_CLEAN
    }

    /** Brief poll after Stop / before spawn — not a busy loop. Isolated :freenet can take seconds. */
    static final int PORT_WAIT_MS = 4_000;
    static final int PORT_POLL_MS = 250;

    static final String PORT_NOT_FREENET =
            "127.0.0.1:7509 is in use by something that is not Freenet 0.2";

    /** Third-party APK — never {@code kill -9} or otherwise signal this package. */
    static final String FREENET_ANDROID_NODE_PACKAGE = "org.freenet.androidnode";

    private FreenetNodePolicy() {}

    /**
     * Stop is only for a node we spawned ({@code :freenet}). {@code attached}
     * is Freenet Android Node or another leftover — leave it running.
     */
    static boolean mayStopOurNode(String mode) {
        return "managed".equals(mode) || "starting".equals(mode);
    }

    static boolean isThirdPartyFreenetPackage(String packageName) {
        return FREENET_ANDROID_NODE_PACKAGE.equals(packageName);
    }

    static Action decide(boolean portTaken, boolean looksLikeFreenet, File binary) {
        return decide(portTaken, looksLikeFreenet, binary, false);
    }

    /**
     * {@code listenerIsOurs}: same uid and our {@code libfreenet.so}. Reuse
     * that process — do not ATTACH+stopSelf (that stacks start attempts).
     */
    static Action decide(
            boolean portTaken, boolean looksLikeFreenet, File binary, boolean listenerIsOurs) {
        if (portTaken && looksLikeFreenet) {
            return listenerIsOurs ? Action.REUSE : Action.ATTACH;
        }
        if (binary != null && binary.isFile()) return Action.SPAWN;
        if (portTaken) return Action.OCCUPIED;
        return Action.MISSING;
    }

    static boolean reuseOurListener(
            boolean portTaken, boolean looksLikeFreenet, boolean storedOurs, boolean listenerIsOurs) {
        return portTaken && looksLikeFreenet && (storedOurs || listenerIsOurs);
    }

    /**
     * Same-app uid on Android is our isolated {@code :freenet}. Hidepid often
     * hides {@code /proc/pid/exe} from the WebView — do not require the path.
     */
    static boolean exeLooksLikeOurLeftover(String exe) {
        if (exe == null || exe.isEmpty()) return true;
        return exeLooksLikeOurFreenet(exe);
    }

    static boolean exeLooksLikeOurFreenet(String exe) {
        return FreenetLoopbackOwner.exeLooksLikeOurFreenet(exe);
    }

    static boolean mayStopListener(boolean ourUid, String exe) {
        return ourUid && exeLooksLikeOurLeftover(exe);
    }

    static String classifyLeftover(
            boolean portStillFreenet, boolean ourUid, String exe, String[] packages) {
        if (!portStillFreenet) return "none";
        if (containsPackage(packages, FREENET_ANDROID_NODE_PACKAGE)) return "android-node";
        if (ourUid && exeLooksLikeOurLeftover(exe)) return "ours";
        return "foreign";
    }

    /** Wait after Stop while our dying child still holds :7509. Not for a foreign leftover. */
    static boolean shouldWaitAfterStop(boolean portTaken, String leftover) {
        if (!portTaken) return false;
        if ("android-node".equals(leftover) || "foreign".equals(leftover)) return false;
        return true;
    }

    /**
     * Wait before spawn when TCP is up but not Freenet 0.2 (dying bind).
     * Reuse ours / attach foreign immediately — do not start a second node.
     */
    static boolean shouldWaitBeforeSpawn(
            boolean portTaken, boolean looksLikeFreenet, boolean listenerIsOurs) {
        if (!portTaken) return false;
        if (looksLikeFreenet) return false;
        return true;
    }

    static String modeWhenPortUp(boolean storedOurs, boolean listenerIsOurs) {
        return storedOurs || listenerIsOurs ? "managed" : "attached";
    }

    static String modeAfterStop(boolean freenet, String leftover) {
        if (!freenet) return "stopped";
        return "ours".equals(leftover) ? "managed" : "attached";
    }

    /** After our child exits: reuse our leftover, attach only a foreign Freenet 0.2. */
    static AfterDeath afterDeath(boolean portTaken, boolean looksLikeFreenet) {
        return afterDeath(portTaken, looksLikeFreenet, false);
    }

    static AfterDeath afterDeath(
            boolean portTaken, boolean looksLikeFreenet, boolean listenerIsOurs) {
        if (portTaken && looksLikeFreenet) {
            return listenerIsOurs ? AfterDeath.REUSE : AfterDeath.ATTACH;
        }
        return AfterDeath.FAIL_CLEAN;
    }

    static boolean containsPackage(String[] packages, String name) {
        if (packages == null || name == null) return false;
        for (String p : packages) {
            if (name.equals(p)) return true;
        }
        return false;
    }

    static String childDiedMessage(int exitCode) {
        if (exitCode > 128 && exitCode < 160) {
            return "node aborted (signal " + (exitCode - 128) + ")";
        }
        if (exitCode == 0) return "node exited";
        return "node exited " + exitCode;
    }

    /**
     * {@code NetworkOnMainThreadException} and similar have a null message.
     * Mapping that to {@link FreenetHostPlugin#NO_BINARY} sent operators to a
     * laptop hub while {@code libfreenet.so} was sitting in nativeLibraryDir.
     */
    static String failureMessage(Throwable error) {
        if (error == null) return FreenetHostPlugin.NO_BINARY;
        String msg = error.getMessage();
        if (msg != null && !msg.isEmpty()) return msg;
        return error.getClass().getSimpleName();
    }

    static boolean processAlive(Process proc) {
        if (proc == null) return false;
        try {
            proc.exitValue();
            return false;
        } catch (IllegalThreadStateException e) {
            return true;
        }
    }

    static String[] spawnArgs(String binaryPath, String configDir, String dataDir, String logDir) {
        return new String[] {
            binaryPath,
            "network",
            "--ws-api-address",
            FreenetHostPlugin.WS_HOST,
            "--ws-api-port",
            String.valueOf(FreenetHostPlugin.WS_PORT),
            "--config-dir",
            configDir,
            "--data-dir",
            dataDir,
            "--log-dir",
            logDir,
        };
    }

    /**
     * Optional {@code libfnwrap.so} sets dumpable=0 then execs the node so a
     * native abort is not reported as an app crash.
     */
    static String[] spawnCommand(
            String wrapperPath, String binaryPath, String configDir, String dataDir, String logDir) {
        String[] args = spawnArgs(binaryPath, configDir, dataDir, logDir);
        if (wrapperPath == null || wrapperPath.isEmpty()) return args;
        String[] out = new String[args.length + 1];
        out[0] = wrapperPath;
        System.arraycopy(args, 0, out, 1, args.length);
        return out;
    }

    static void applySpawnEnv(Map<String, String> env, String home, String tmpdir) {
        if (home != null) env.put("HOME", home);
        if (tmpdir != null) env.put("TMPDIR", tmpdir);
        env.put("RUST_BACKTRACE", "1");
        try {
            env.remove("LD_PRELOAD");
        } catch (UnsupportedOperationException ignored) {
            /* Android ProcessBuilder maps are usually mutable */
        }
    }
}
