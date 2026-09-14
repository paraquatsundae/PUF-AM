package com.sentinut.farm;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Identity check for attach — {@code GET /v1/version} must look like Freenet 0.2.
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14.
 */
public class FreenetNodeStatusQueryTest {
    @Test
    public void acceptsFreenet02VersionJson() {
        assertTrue(FreenetNodeStatusQuery.looksLikeFreenet02Version("{\"version\":\"0.2.135\"}"));
        assertTrue(FreenetNodeStatusQuery.looksLikeFreenet02Version("{\"version\":\"0.2.123\"}"));
        assertTrue(
                FreenetNodeStatusQuery.looksLikeFreenet02Version(
                        "{\"version\":\"Freenet 0.2.135 (ea1ff5f)\"}"));
    }

    @Test
    public void refusesHtmlDashboardAndOtherVersions() {
        assertFalse(
                FreenetNodeStatusQuery.looksLikeFreenet02Version(
                        "<!DOCTYPE html><html><title>Dashboard</title></html>"));
        assertFalse(FreenetNodeStatusQuery.looksLikeFreenet02Version("{\"version\":\"1.0.2\"}"));
        assertFalse(FreenetNodeStatusQuery.looksLikeFreenet02Version("{\"version\":\"hello\"}"));
        assertFalse(FreenetNodeStatusQuery.looksLikeFreenet02Version("{}"));
        assertFalse(FreenetNodeStatusQuery.looksLikeFreenet02Version(null));
    }
}
