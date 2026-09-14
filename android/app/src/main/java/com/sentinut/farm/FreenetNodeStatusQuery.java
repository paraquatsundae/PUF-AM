package com.sentinut.farm;

import android.os.StrictMode;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Loopback JSON status for the Settings ring. Tries {@code GET /status} then
 * {@code GET /v1/status}; refuses HTML. {@code GET /v1/version} is the only
 * JSON route on Freenet 0.2.135 — peer count then comes from this bake's
 * {@code --log-dir} ({@code ring_connections=} / {@code connection_count=}).
 *
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (peer count from logs).
 */
final class FreenetNodeStatusQuery {
    private static final int TIMEOUT_MS = 1_200;
    private static final String[] STATUS_PATHS = { "/status", "/v1/status" };

    private FreenetNodeStatusQuery() {}

    /**
     * True when {@code GET /v1/version} is Freenet 0.2 JSON, or the WS API
     * answers a hello. TCP alone is not enough.
     */
    static boolean identifyFreenet02(String host, int port) {
        StrictMode.ThreadPolicy previous = StrictMode.getThreadPolicy();
        StrictMode.setThreadPolicy(
                new StrictMode.ThreadPolicy.Builder(previous).permitNetwork().build());
        try {
            String versionBody = getText("http://" + host + ":" + port + "/v1/version");
            if (versionBody != null && looksLikeHtml(versionBody)) return false;
            if (looksLikeFreenet02Version(versionBody)) return true;
            if (versionBody != null) return false;
            return wsHello(host, port);
        } finally {
            StrictMode.setThreadPolicy(previous);
        }
    }

    static boolean looksLikeFreenet02Version(String body) {
        if (body == null) return false;
        String trimmed = body.trim();
        if (trimmed.isEmpty() || looksLikeHtml(trimmed)) return false;
        // Do not use org.json.JSONObject here — JVM unit tests see the Android stub.
        String version = jsonStringField(trimmed, "version");
        if (version == null || version.isEmpty()) version = jsonStringField(trimmed, "nodeVersion");
        if (version == null || version.isEmpty()) return false;
        if (version.startsWith("0.2")) return true;
        String lower = version.toLowerCase();
        return lower.contains("freenet") && version.matches(".*0\\.2\\.\\d+.*");
    }

    /** Tiny `"key":"value"` reader so identity tests do not need Robolectric. */
    static String jsonStringField(String json, String key) {
        String needle = "\"" + key + "\"";
        int i = json.indexOf(needle);
        if (i < 0) return null;
        int colon = json.indexOf(':', i + needle.length());
        if (colon < 0) return null;
        int q1 = json.indexOf('"', colon + 1);
        if (q1 < 0) return null;
        int q2 = json.indexOf('"', q1 + 1);
        if (q2 < 0) return null;
        return json.substring(q1 + 1, q2).trim();
    }

    private static boolean looksLikeHtml(String body) {
        String trimmed = body.trim();
        return !trimmed.isEmpty()
                && (trimmed.charAt(0) == '<' || trimmed.regionMatches(true, 0, "<html", 0, 5));
    }

    private static boolean wsHello(String host, int port) {
        java.net.Socket socket = null;
        try {
            socket = new java.net.Socket();
            socket.connect(new java.net.InetSocketAddress(host, port), TIMEOUT_MS);
            socket.setSoTimeout(TIMEOUT_MS);
            String key = "dGhlIHNhbXBsZSBub25jZQ==";
            String req =
                    "GET /v1/contract/command HTTP/1.1\r\n"
                            + "Host: "
                            + host
                            + ":"
                            + port
                            + "\r\n"
                            + "Upgrade: websocket\r\n"
                            + "Connection: Upgrade\r\n"
                            + "Sec-WebSocket-Key: "
                            + key
                            + "\r\n"
                            + "Sec-WebSocket-Version: 13\r\n\r\n";
            socket.getOutputStream().write(req.getBytes(StandardCharsets.US_ASCII));
            BufferedReader reader =
                    new BufferedReader(
                            new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            String line = reader.readLine();
            return line != null && line.contains(" 101");
        } catch (Exception e) {
            return false;
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (Exception ignored) {
                    /* closed */
                }
            }
        }
    }

    static JSObject fetchRing(String host, int port) {
        StrictMode.ThreadPolicy previous = StrictMode.getThreadPolicy();
        StrictMode.setThreadPolicy(
                new StrictMode.ThreadPolicy.Builder(previous).permitNetwork().build());
        try {
            JSObject ring = null;
            for (String path : STATUS_PATHS) {
                String body = getText("http://" + host + ":" + port + path);
                JSObject parsed = parseStatusJson(body);
                if (parsed != null) {
                    ring = parsed;
                    break;
                }
            }
            String versionBody = getText("http://" + host + ":" + port + "/v1/version");
            String version = parseVersion(versionBody);
            if (version != null) {
                if (ring == null) {
                    ring = emptyRing();
                    ring.put("peerSource", "unreported");
                }
                if (!ring.has("nodeVersion")) {
                    ring.put("nodeVersion", version);
                }
            }
            return ring;
        } finally {
            StrictMode.setThreadPolicy(previous);
        }
    }

    /**
     * Fill N from this bake's log when JSON has no peer list.
     * {@code logDir} may be null (tests / no files yet).
     */
    static JSObject applyLogPeerCount(JSObject ring, File logDir) {
        Integer n = FreenetLogPeerCount.readDir(logDir);
        if (n == null) return ring;
        if (jsonHasReportedPeers(ring)) return ring;
        if (ring == null) ring = emptyRing();
        ring.put("peerCount", n.intValue());
        ring.put("peerSource", n > 0 ? "count" : "none");
        return ring;
    }

    private static boolean jsonHasReportedPeers(JSObject ring) {
        if (ring == null) return false;
        String source = ring.optString("peerSource", "");
        if ("locations".equals(source) || "ids".equals(source)) return true;
        return "count".equals(source) && ring.optInt("peerCount", 0) > 0;
    }

    private static JSObject emptyRing() {
        JSObject o = new JSObject();
        o.put("peers", new JSArray());
        o.put("peerCount", 0);
        o.put("peerSource", "none");
        return o;
    }

    private static String getText(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestProperty("Accept", "application/json, text/plain;q=0.1");
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            String type = conn.getContentType();
            if (type != null && type.toLowerCase().contains("text/html")) return null;
            BufferedReader reader =
                    new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line).append('\n');
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            Log.d(FreenetHostPlugin.TAG, "status GET " + url + " " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    static JSObject parseStatusJson(String body) {
        if (body == null) return null;
        String trimmed = body.trim();
        if (trimmed.isEmpty() || trimmed.charAt(0) == '<' || trimmed.regionMatches(true, 0, "<html", 0, 5)) {
            return null;
        }
        try {
            JSONObject raw = new JSONObject(trimmed);
            JSObject out = emptyRing();
            Double location = ringLocation(first(raw, "location", "ownLocation", "own_location", "ringLocation"));
            if (location != null) out.put("location", location);

            JSONArray list = firstArray(raw, "peers", "connectedPeers", "connected_peers", "peerList");
            JSArray peers = new JSArray();
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    JSObject peer = peerFrom(list.opt(i));
                    if (peer != null) peers.put(peer);
                }
            }
            out.put("peers", peers);

            int count = peers.length();
            if (count == 0) {
                Number n = asNumber(first(raw, "peerCount", "peer_count", "connectedPeerCount", "connections"));
                if (n != null) count = Math.max(0, n.intValue());
            }
            out.put("peerCount", count);

            boolean hasLoc = out.has("location");
            if (!hasLoc) {
                for (int i = 0; i < peers.length(); i++) {
                    if (peers.optJSONObject(i) != null && peers.optJSONObject(i).has("location")) {
                        hasLoc = true;
                        break;
                    }
                }
            }
            boolean hasIds = false;
            for (int i = 0; i < peers.length(); i++) {
                if (peers.optJSONObject(i) != null && peers.optJSONObject(i).has("id")) {
                    hasIds = true;
                    break;
                }
            }
            if (hasLoc) out.put("peerSource", "locations");
            else if (hasIds) out.put("peerSource", "ids");
            else if (count > 0) out.put("peerSource", "count");
            else out.put("peerSource", "none");

            String version = raw.optString("version", raw.optString("nodeVersion", "")).trim();
            if (!version.isEmpty()) out.put("nodeVersion", version);
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    private static String parseVersion(String body) {
        JSObject parsed = parseStatusJson(body);
        if (parsed == null) return null;
        String v = parsed.optString("nodeVersion", "");
        return v.isEmpty() ? null : v;
    }

    private static JSObject peerFrom(Object raw) {
        try {
            if (raw instanceof String) {
                String id = ((String) raw).trim();
                if (id.isEmpty()) return null;
                JSObject o = new JSObject();
                o.put("id", id);
                return o;
            }
            if (raw instanceof Number) {
                Double loc = ringLocation(raw);
                if (loc == null) return null;
                JSObject o = new JSObject();
                o.put("location", loc);
                return o;
            }
            if (!(raw instanceof JSONObject)) return null;
            JSONObject j = (JSONObject) raw;
            String id = firstString(j, "id", "peerId", "peer_id", "address", "addr");
            Double loc = ringLocation(first(j, "location", "loc", "ringLocation"));
            if (id == null && loc == null) return null;
            JSObject o = new JSObject();
            if (id != null) o.put("id", id);
            if (loc != null) o.put("location", loc);
            return o;
        } catch (Exception e) {
            return null;
        }
    }

    private static Object first(JSONObject o, String... keys) {
        for (String k : keys) {
            if (o.has(k) && !o.isNull(k)) return o.opt(k);
        }
        return null;
    }

    private static JSONArray firstArray(JSONObject o, String... keys) {
        for (String k : keys) {
            JSONArray a = o.optJSONArray(k);
            if (a != null) return a;
        }
        return null;
    }

    private static String firstString(JSONObject o, String... keys) {
        for (String k : keys) {
            String v = o.optString(k, "").trim();
            if (!v.isEmpty()) return v;
        }
        return null;
    }

    private static Number asNumber(Object raw) {
        if (raw instanceof Number) return (Number) raw;
        if (raw instanceof String) {
            try {
                return Double.parseDouble(((String) raw).trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static Double ringLocation(Object raw) {
        Number n = asNumber(raw);
        if (n == null) return null;
        double d = n.doubleValue();
        if (d < 0 || d >= 1 || Double.isNaN(d)) return null;
        return d;
    }
}
