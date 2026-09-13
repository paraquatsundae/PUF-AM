package com.sentinut.farm;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import java.io.File;
import java.io.IOException;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Isolated :freenet bring-up policy — attach wins, spawn when a binary is
 * present, fail clean when it is not. Plans/FREENET_NETWORK_PACK.md Phase 3.
 */
public class FreenetNodePolicyTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void attachWinsEvenWhenABinaryIsPresent() throws IOException {
        File binary = tmp.newFile("libfreenet.so");
        assertEquals(FreenetNodePolicy.Action.ATTACH, FreenetNodePolicy.decide(true, binary));
        assertEquals(FreenetNodePolicy.Action.ATTACH, FreenetNodePolicy.decide(true, null));
    }

    @Test
    public void spawnWhenPortIsFreeAndBinaryExists() throws IOException {
        File binary = tmp.newFile("libfreenet.so");
        assertEquals(FreenetNodePolicy.Action.SPAWN, FreenetNodePolicy.decide(false, binary));
    }

    @Test
    public void missingWhenPortIsFreeAndThereIsNoBinary() {
        assertEquals(FreenetNodePolicy.Action.MISSING, FreenetNodePolicy.decide(false, null));
        assertEquals(
                FreenetNodePolicy.Action.MISSING,
                FreenetNodePolicy.decide(false, new File(tmp.getRoot(), "no-such-so")));
    }

    @Test
    public void spawnArgsMatchTheDesktopHost() {
        String[] args =
                FreenetNodePolicy.spawnArgs(
                        "/data/app/libfreenet.so", "/cfg", "/data", "/logs");
        assertArrayEquals(
                new String[] {
                    "/data/app/libfreenet.so",
                    "network",
                    "--ws-api-address",
                    "127.0.0.1",
                    "--ws-api-port",
                    "7509",
                    "--config-dir",
                    "/cfg",
                    "--data-dir",
                    "/data",
                    "--log-dir",
                    "/logs",
                },
                args);
        assertEquals("no android-arm64 binary", FreenetHostPlugin.NO_BINARY);
    }

    @Test
    public void afterDeathAttachesWhenPortIsStillTaken() {
        assertEquals(FreenetNodePolicy.AfterDeath.ATTACH, FreenetNodePolicy.afterDeath(true));
    }

    @Test
    public void afterDeathFailsCleanWhenNothingIsListening() {
        assertEquals(FreenetNodePolicy.AfterDeath.FAIL_CLEAN, FreenetNodePolicy.afterDeath(false));
    }

    @Test
    public void childDiedMessageNamesTheSignal() {
        assertEquals("node aborted (signal 6)", FreenetNodePolicy.childDiedMessage(134));
        assertEquals("node exited", FreenetNodePolicy.childDiedMessage(0));
        assertEquals("node exited 42", FreenetNodePolicy.childDiedMessage(42));
    }

    @Test
    public void spawnCommandPrefixesTheDumpableWrapper() {
        String[] wrapped =
                FreenetNodePolicy.spawnCommand(
                        "/data/app/libfnwrap.so",
                        "/data/app/libfreenet.so",
                        "/cfg",
                        "/data",
                        "/logs");
        assertEquals("/data/app/libfnwrap.so", wrapped[0]);
        assertEquals("/data/app/libfreenet.so", wrapped[1]);
        assertArrayEquals(
                FreenetNodePolicy.spawnArgs("/data/app/libfreenet.so", "/cfg", "/data", "/logs"),
                java.util.Arrays.copyOfRange(wrapped, 1, wrapped.length));
        assertArrayEquals(
                FreenetNodePolicy.spawnArgs("/data/app/libfreenet.so", "/cfg", "/data", "/logs"),
                FreenetNodePolicy.spawnCommand(null, "/data/app/libfreenet.so", "/cfg", "/data", "/logs"));
    }

    @Test
    public void applySpawnEnvSetsHomeAndDropsPreload() {
        java.util.Map<String, String> env = new java.util.HashMap<>();
        env.put("LD_PRELOAD", "evil.so");
        FreenetNodePolicy.applySpawnEnv(env, "/data/data/com.sentinut.farm/files", "/tmp");
        assertEquals("/data/data/com.sentinut.farm/files", env.get("HOME"));
        assertEquals("/tmp", env.get("TMPDIR"));
        assertEquals("1", env.get("RUST_BACKTRACE"));
        assertFalse(env.containsKey("LD_PRELOAD"));
    }
}
