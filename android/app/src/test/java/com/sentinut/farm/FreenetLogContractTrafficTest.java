package com.sentinut.farm;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Sample 0.2.135 lines → this-node GET; relay / HTML stay idle.
 */
public class FreenetLogContractTrafficTest {
    private static final long NOW = 1_779_000_000_000L;
    private static final String CLIENT_GET =
            "2026-09-14T11:00:16.012796Z  INFO client_event_handling:process_client_request: freenet::client_events: Returning locally cached contract state request_id=req-11000003 peer=65.181.23.138:41419 contract=FRYxGUjEW1nSkwvSbaLpRTcEWt7i7FeDbK6UMWicTw9m connection_count=22";
    private static final String RELAY =
            "2026-09-14T11:00:51.365424Z  INFO freenet::operations::get::op_ctx_task: GET relay: forwarding stream contract=68i7VVAF3rDF47TqnKCys8ewXewEacJqkVcF6wXZsE1J";

    @Test
    public void parsesClientGet() {
        FreenetLogContractTraffic.Hit hit =
                FreenetLogContractTraffic.parseLine(CLIENT_GET, NOW, null, null);
        assertEquals("get", hit.op);
        assertEquals("in", hit.direction);
        assertEquals("Fetched contract", hit.label);
        assertEquals("log-req-11000003", hit.id);
        assertEquals("FRYxGUjEW1nSkwvSbaLpRTcEWt7i7FeDbK6UMWicTw9m", hit.contractKey);
    }

    @Test
    public void ignoresRelayHtmlAndNeighbor() {
        assertNull(FreenetLogContractTraffic.parseLine(RELAY, NOW, null, null));
        assertNull(
                FreenetLogContractTraffic.parseLine(
                        "<html>process_client_request contract=ABCDEFGH</html>", NOW, null, null));
        assertTrue(FreenetLogContractTraffic.parseRecent("ring_connections=25\n", NOW, null, null).isEmpty());
    }
}
