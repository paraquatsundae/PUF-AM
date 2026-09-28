package com.sentinut.farm;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Persist-pid file for the spawned {@code libfreenet.so}. No Robolectric —
 * parse and file helpers only.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-16 (hidepid leftover).
 */
public class FreenetChildPidTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void parsePidAcceptsAPositiveDecimal() {
        assertEquals(4242, FreenetChildPid.parsePid("4242"));
        assertEquals(7, FreenetChildPid.parsePid("  7\n"));
        assertEquals(-1, FreenetChildPid.parsePid(""));
        assertEquals(-1, FreenetChildPid.parsePid(null));
        assertEquals(-1, FreenetChildPid.parsePid("0"));
        assertEquals(-1, FreenetChildPid.parsePid("-3"));
        assertEquals(-1, FreenetChildPid.parsePid("nope"));
        assertEquals(-1, FreenetChildPid.pidOf(null));
    }

    @Test
    public void writeReadClearRoundTrip() throws Exception {
        File dest = FreenetChildPid.file(tmp.getRoot());
        assertEquals(-1, FreenetChildPid.readFrom(dest));
        FreenetChildPid.writeTo(dest, 1881);
        assertTrue(dest.isFile());
        assertEquals(1881, FreenetChildPid.readFrom(dest));
        FreenetChildPid.clearFile(dest);
        assertFalse(dest.isFile());
        assertEquals(-1, FreenetChildPid.readFrom(dest));
    }
}
