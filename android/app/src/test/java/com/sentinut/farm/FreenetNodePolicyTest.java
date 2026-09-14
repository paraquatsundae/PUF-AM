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
 * Isolated :freenet bring-up policy — attach only when the listener is
 * Freenet 0.2, spawn when a binary is present, fail clean when it is not.
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14.
 */
public class FreenetNodePolicyTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void reuseWhenTheListenerIsOurFreenet() throws IOException {
        File binary = tmp.newFile("libfreenet.so");
        assertEquals(
                FreenetNodePolicy.Action.REUSE,
                FreenetNodePolicy.decide(true, true, binary, true));
        org.junit.Assert.assertTrue(
                FreenetNodePolicy.reuseOurListener(true, true, true, false));
        org.junit.Assert.assertTrue(
                FreenetNodePolicy.reuseOurListener(true, true, false, true));
        assertFalse(FreenetNodePolicy.reuseOurListener(true, true, false, false));
    }

    @Test
    public void classifyLeftoverDoesNotClaimAndroidNodeWhenThePortIsFree() {
        assertEquals("none", FreenetNodePolicy.classifyLeftover(false, false, null, new String[] {
            FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE
        }));
        assertEquals(
                "android-node",
                FreenetNodePolicy.classifyLeftover(
                        true,
                        false,
                        "/data/app/org.freenet.androidnode/libfreenet.so",
                        new String[] { FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE }));
        assertEquals(
                "ours",
                FreenetNodePolicy.classifyLeftover(
                        true, true, "/data/app/com.sentinut.farm/lib/arm64/libfreenet.so", new String[0]));
        // Hidepid: same-uid leftover with no exe path is still ours — not foreign ATTACH.
        assertEquals("ours", FreenetNodePolicy.classifyLeftover(true, true, null, new String[0]));
        assertEquals("ours", FreenetNodePolicy.classifyLeftover(true, true, "", new String[0]));
        assertEquals("foreign", FreenetNodePolicy.classifyLeftover(true, false, null, new String[0]));
        assertFalse(FreenetNodePolicy.mayStopListener(false, "/data/app/org.freenet.androidnode/x"));
        org.junit.Assert.assertTrue(
                FreenetNodePolicy.mayStopListener(
                        true, "/data/app/com.sentinut.farm/lib/arm64/libfreenet.so"));
        org.junit.Assert.assertTrue(FreenetNodePolicy.mayStopListener(true, null));
    }

    @Test
    public void stopThenStartReusesOurLeftoverInsteadOfAttach() throws IOException {
        File binary = tmp.newFile("libfreenet.so");
        // After Stop: dying :7509 still ours (exe hidden) — Start reuses, no already-open.
        org.junit.Assert.assertTrue(FreenetNodePolicy.reuseOurListener(true, true, false, true));
        assertEquals(
                FreenetNodePolicy.Action.REUSE,
                FreenetNodePolicy.decide(true, true, binary, true));
        assertEquals("managed", FreenetNodePolicy.modeWhenPortUp(false, true));
        assertEquals("managed", FreenetNodePolicy.modeAfterStop(true, "ours"));
        assertFalse(FreenetNodePolicy.shouldWaitBeforeSpawn(true, true, true));
        // Foreign leftover stays attach — honest, not a PUF-AM "already open" failure.
        assertEquals(
                FreenetNodePolicy.Action.ATTACH,
                FreenetNodePolicy.decide(true, true, binary, false));
        assertEquals("attached", FreenetNodePolicy.modeAfterStop(true, "android-node"));
        assertEquals("attached", FreenetNodePolicy.modeAfterStop(true, "foreign"));
        assertEquals(
                "android-node",
                FreenetNodePolicy.classifyLeftover(
                        true,
                        false,
                        null,
                        new String[] {FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE}));
    }

    @Test
    public void waitAfterStopForOurDyingPortNotForForeign() {
        org.junit.Assert.assertTrue(FreenetNodePolicy.shouldWaitAfterStop(true, "ours"));
        org.junit.Assert.assertTrue(FreenetNodePolicy.shouldWaitAfterStop(true, "none"));
        assertFalse(FreenetNodePolicy.shouldWaitAfterStop(false, "ours"));
        assertFalse(FreenetNodePolicy.shouldWaitAfterStop(true, "foreign"));
        assertFalse(FreenetNodePolicy.shouldWaitAfterStop(true, "android-node"));
        org.junit.Assert.assertTrue(FreenetNodePolicy.shouldWaitBeforeSpawn(true, false, false));
        org.junit.Assert.assertTrue(FreenetNodePolicy.shouldWaitBeforeSpawn(true, false, true));
        assertFalse(FreenetNodePolicy.shouldWaitBeforeSpawn(true, true, false));
        assertFalse(FreenetNodePolicy.shouldWaitBeforeSpawn(false, false, false));
        assertEquals(4_000, FreenetNodePolicy.PORT_WAIT_MS);
        assertEquals(250, FreenetNodePolicy.PORT_POLL_MS);
    }

    @Test
    public void attachWinsWhenTheListenerIsFreenetEvenIfABinaryIsPresent() throws IOException {
        File binary = tmp.newFile("libfreenet.so");
        assertEquals(FreenetNodePolicy.Action.ATTACH, FreenetNodePolicy.decide(true, true, binary));
        assertEquals(FreenetNodePolicy.Action.ATTACH, FreenetNodePolicy.decide(true, true, null));
    }

    @Test
    public void spawnWhenPortIsTakenBySomethingThatIsNotFreenet() throws IOException {
        File binary = tmp.newFile("libfreenet.so");
        assertEquals(FreenetNodePolicy.Action.SPAWN, FreenetNodePolicy.decide(true, false, binary));
    }

    @Test
    public void occupiedWhenPortIsTakenByNonFreenetAndThereIsNoBinary() {
        assertEquals(FreenetNodePolicy.Action.OCCUPIED, FreenetNodePolicy.decide(true, false, null));
        assertEquals(
                FreenetNodePolicy.PORT_NOT_FREENET,
                "127.0.0.1:7509 is in use by something that is not Freenet 0.2");
    }

    @Test
    public void spawnWhenPortIsFreeAndBinaryExists() throws IOException {
        File binary = tmp.newFile("libfreenet.so");
        assertEquals(FreenetNodePolicy.Action.SPAWN, FreenetNodePolicy.decide(false, false, binary));
    }

    @Test
    public void missingWhenPortIsFreeAndThereIsNoBinary() {
        assertEquals(FreenetNodePolicy.Action.MISSING, FreenetNodePolicy.decide(false, false, null));
        assertEquals(
                FreenetNodePolicy.Action.MISSING,
                FreenetNodePolicy.decide(false, false, new File(tmp.getRoot(), "no-such-so")));
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
    public void afterDeathAttachesOnlyWhenTheListenerIsStillFreenet() {
        assertEquals(FreenetNodePolicy.AfterDeath.ATTACH, FreenetNodePolicy.afterDeath(true, true));
        assertEquals(
                FreenetNodePolicy.AfterDeath.REUSE,
                FreenetNodePolicy.afterDeath(true, true, true));
        assertEquals(
                FreenetNodePolicy.AfterDeath.FAIL_CLEAN, FreenetNodePolicy.afterDeath(true, false));
    }

    @Test
    public void afterDeathFailsCleanWhenNothingIsListening() {
        assertEquals(FreenetNodePolicy.AfterDeath.FAIL_CLEAN, FreenetNodePolicy.afterDeath(false, false));
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
    public void failureMessageNamesTheClassWhenTheThrowableHasNoMessage() {
        assertEquals("RuntimeException", FreenetNodePolicy.failureMessage(new RuntimeException()));
        assertEquals("no android-arm64 binary", FreenetNodePolicy.failureMessage(null));
        assertEquals("boom", FreenetNodePolicy.failureMessage(new RuntimeException("boom")));
    }

    @Test
    public void processAliveIsFalseForNull() {
        assertFalse(FreenetNodePolicy.processAlive(null));
    }

    @Test
    public void mayStopOnlyManagedOrStarting() {
        org.junit.Assert.assertTrue(FreenetNodePolicy.mayStopOurNode("managed"));
        org.junit.Assert.assertTrue(FreenetNodePolicy.mayStopOurNode("starting"));
        assertFalse(FreenetNodePolicy.mayStopOurNode("attached"));
        assertFalse(FreenetNodePolicy.mayStopOurNode("stopped"));
        assertFalse(FreenetNodePolicy.mayStopOurNode("failed"));
        assertFalse(FreenetNodePolicy.mayStopOurNode(""));
        assertFalse(FreenetNodePolicy.mayStopOurNode(null));
    }

    @Test
    public void neverTargetsFreenetAndroidNodePackage() {
        org.junit.Assert.assertTrue(
                FreenetNodePolicy.isThirdPartyFreenetPackage("org.freenet.androidnode"));
        assertFalse(FreenetNodePolicy.isThirdPartyFreenetPackage("com.sentinut.farm"));
        assertEquals("org.freenet.androidnode", FreenetNodePolicy.FREENET_ANDROID_NODE_PACKAGE);
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
