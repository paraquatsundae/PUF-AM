package com.sentinut.farm;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * 0.2.135 peer count is the latest {@code ring_connections=} /
 * {@code connection_count=} in this bake's log dir — not JSON, not HTML.
 */
public class FreenetLogPeerCountTest {
    private static final long NOW = 1_779_000_000_000L; // 2026-05-ish; tests pass explicit now

    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private static final String RING_26 =
            "2026-09-14T10:30:45.621884Z  INFO freenet::node::network_bridge::p2p_protoc: Event loop stats active_connections=26 ring_connections=26";
    private static final String CONN_0 =
            "2026-09-14T10:30:40.000000Z  INFO freenet::ring::connection_manager: add_connection: connection_count=0";

    @Test
    public void parsesRingConnectionsFromEventLoopStats() {
        FreenetLogPeerCount.Hit hit = FreenetLogPeerCount.parseLine(RING_26);
        assertEquals(26, hit.peerCount);
        assertEquals("ring_connections", hit.key);
    }

    @Test
    public void prefersRingConnectionsOnTheSameLine() {
        FreenetLogPeerCount.Hit hit =
                FreenetLogPeerCount.parseLine("active_connections=29 ring_connections=26 connection_count=30");
        assertEquals(26, hit.peerCount);
        assertEquals("ring_connections", hit.key);
    }

    @Test
    public void latestLineWinsAndZeroStaysZero() {
        FreenetLogPeerCount.Hit latest =
                FreenetLogPeerCount.parseLatest(RING_26 + "\n" + CONN_0 + "\n", NOW, null, null);
        assertEquals(0, latest.peerCount);
        assertEquals("connection_count", latest.key);
        assertTrue(FreenetLogPeerCount.lineHasPeerCount(CONN_0));
    }

    @Test
    public void ignoresHtmlAndLinesWithNoCount() {
        assertNull(FreenetLogPeerCount.parseLine("<html>ring_connections=9</html>"));
        assertFalse(FreenetLogPeerCount.lineHasPeerCount("own-loc 0.2 peers 12"));
        assertNull(FreenetLogPeerCount.parseLatest("node starting\n", NOW, null, null));
    }

    @Test
    public void readDirUsesNewestHourLogAndSkipsErrorLogs() throws IOException {
        File dir = tmp.newFolder("logs");
        write(new File(dir, "freenet.error.2026-09-14-10.log"), "ring_connections=99\n");
        write(new File(dir, "freenet.2026-09-14-09.log"), "ring_connections=3\n");
        write(new File(dir, "freenet.2026-09-14-10.log"), RING_26 + "\n");
        assertEquals(Integer.valueOf(26), FreenetLogPeerCount.readDir(dir, NOW, null));
    }

    @Test
    public void readDirFallsBackToPufamRingLast() throws IOException {
        File dir = tmp.newFolder("logs-last");
        write(new File(dir, FreenetLogPeerCount.RING_LAST), "ring_connections=4\n");
        assertEquals(Integer.valueOf(4), FreenetLogPeerCount.readDir(dir, NOW, null));
    }

    private static void write(File file, String text) throws IOException {
        try (FileWriter w = new FileWriter(file)) {
            w.write(text);
        }
    }
}
