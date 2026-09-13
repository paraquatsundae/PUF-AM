package com.sentinut.farm;

import java.io.File;
import java.util.Map;

/**
 * Attach-if-port-taken, then spawn the bundled android-arm64 node, else fail
 * clean. A dead child never restarts the service (no crash-dialog loop) and
 * never implies we killed a third-party node on :7509.
 * Pure so the JUnit suite can cover it without a device.
 * Plans/FREENET_NETWORK_PACK.md Phase 3 · Plans/APK_FREENET_HOST.md Phase 2.
 */
final class FreenetNodePolicy {
    enum Action {
        ATTACH,
        SPAWN,
        MISSING
    }

    enum AfterDeath {
        ATTACH,
        FAIL_CLEAN
    }

    private FreenetNodePolicy() {}

    static Action decide(boolean portTaken, File binary) {
        if (portTaken) return Action.ATTACH;
        if (binary != null && binary.isFile()) return Action.SPAWN;
        return Action.MISSING;
    }

    /** After our child exits: attach if :7509 still answers, else fail clean. */
    static AfterDeath afterDeath(boolean portTaken) {
        return portTaken ? AfterDeath.ATTACH : AfterDeath.FAIL_CLEAN;
    }

    static String childDiedMessage(int exitCode) {
        if (exitCode > 128 && exitCode < 160) {
            return "node aborted (signal " + (exitCode - 128) + ")";
        }
        if (exitCode == 0) return "node exited";
        return "node exited " + exitCode;
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
