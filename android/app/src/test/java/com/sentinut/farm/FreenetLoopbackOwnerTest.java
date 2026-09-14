package com.sentinut.farm;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FreenetLoopbackOwnerTest {
    private static final String TCP =
            "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n"
                    + "   0: 0100007F:1D55 00000000:0000 0A 00000000:00000000 00:00000000 00000000  10234        0 99999 1 0000000000000000 100 0 0 10 0\n";

    @Test
    public void parseListenReadsUidForPort7509() {
        FreenetLoopbackOwner.TcpListen listen = FreenetLoopbackOwner.parseListen(TCP, 7509);
        assertNotNull(listen);
        assertEquals(10234, listen.uid);
        assertEquals(99999, listen.inode);
        assertNull(FreenetLoopbackOwner.parseListen(TCP, 80));
    }

    @Test
    public void ourSoIsRecognizedAndTheirsIsNot() {
        assertTrue(FreenetLoopbackOwner.exeLooksLikeOurFreenet("/data/app/~~x/lib/arm64/libfreenet.so"));
        assertTrue(FreenetLoopbackOwner.exeLooksLikeOurFreenet("/data/app/~~x/lib/arm64/libfnwrap.so"));
        assertTrue(FreenetNodePolicy.exeLooksLikeOurLeftover(null));
        assertTrue(FreenetNodePolicy.exeLooksLikeOurLeftover(""));
        assertFalse(FreenetLoopbackOwner.exeLooksLikeOurFreenet("/data/app/org.freenet.androidnode/lib/x.so"));
        assertTrue(FreenetLoopbackOwner.isLoopbackHex("0100007F"));
        assertFalse(FreenetLoopbackOwner.isLoopbackHex("00000000"));
    }
}
