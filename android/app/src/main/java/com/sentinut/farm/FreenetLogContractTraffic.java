package com.sentinut.farm;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * This node's contract PUT/GET from the same {@code --log-dir} as peer count.
 * Skips HTML, neighbor hosting, and relay/auto-fetch. Do not invent hops.
 *
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (Settings Freenet traffic).
 */
final class FreenetLogContractTraffic {
    static final int MAX_EVENTS = 8;
    static final long FRESH_MS = 16_000L;
    private static final Pattern HOUR_LOG = Pattern.compile("^freenet\\.\\d{4}-\\d{2}-\\d{2}-\\d{2}\\.log$");
    private static final Pattern CONTRACT = Pattern.compile("\\b(?:contract|contract_key|key)=([A-Za-z0-9]{8,})\\b");
    private static final Pattern PEER = Pattern.compile("\\bpeer=([A-Za-z0-9.:_-]+)\\b");
    private static final Pattern REQ = Pattern.compile("\\brequest_id=([A-Za-z0-9_-]+)\\b");
    private static final Pattern RELAY =
            Pattern.compile(
                    "NEIGHBOR_HOSTING|GET relay|PUT relay|SUBSCRIBE relay|UPDATE relay|relay_subscribe|relay_streaming|auto-fetch",
                    Pattern.CASE_INSENSITIVE);

    static final class Hit {
        final String id;
        final long at;
        final String op;
        final String direction;
        final String contractKey;
        final String peerId;
        final String label;

        Hit(
                String id,
                long at,
                String op,
                String direction,
                String contractKey,
                String peerId,
                String label) {
            this.id = id;
            this.at = at;
            this.op = op;
            this.direction = direction;
            this.contractKey = contractKey;
            this.peerId = peerId;
            this.label = label;
        }
    }

    private FreenetLogContractTraffic() {}

    static Hit parseLine(String line) {
        return parseLine(line, System.currentTimeMillis(), FRESH_MS, null);
    }

    static Hit parseLine(String line, long nowMs, Long freshMs, Long fileMtimeMs) {
        if (line == null) return null;
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.charAt(0) == '<') return null;
        if (RELAY.matcher(line).find()) return null;
        String op = null;
        if (line.contains("process_client_request")) {
            op = line.contains("Put ") || line.contains(" PUT ") || line.contains("Put accepted")
                    ? "put"
                    : "get";
        } else if (line.contains("freenet::operations::put") && line.contains("contract=")) {
            op = "put";
        }
        if (op == null) return null;
        Long at = FreenetLogPeerCount.lineTimeMs(line);
        if (at == null) at = fileMtimeMs;
        if (at == null) at = nowMs;
        if (freshMs != null && nowMs - at > freshMs) return null;
        Matcher req = REQ.matcher(line);
        Matcher contract = CONTRACT.matcher(line);
        Matcher peer = PEER.matcher(line);
        String contractKey = contract.find() ? contract.group(1) : null;
        String peerId = null;
        if (peer.find()) {
            String raw = peer.group(1);
            if (!raw.startsWith("127.")) peerId = raw;
        }
        String id = req.find() ? "log-" + req.group(1) : "log-" + at + "-" + op;
        String label = "put".equals(op) ? "Sent contract" : "Fetched contract";
        return new Hit(id, at, op, "put".equals(op) ? "out" : "in", contractKey, peerId, label);
    }

    static List<Hit> parseRecent(String text, long nowMs, Long freshMs, Long fileMtimeMs) {
        List<Hit> out = new ArrayList<>();
        if (text == null) return out;
        String start = text.trim();
        if (start.isEmpty() || start.charAt(0) == '<') return out;
        String[] lines = text.split("\\r?\\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            Hit hit = parseLine(lines[i], nowMs, freshMs, fileMtimeMs);
            if (hit == null) continue;
            boolean seen = false;
            for (Hit existing : out) {
                if (existing.id.equals(hit.id)) {
                    seen = true;
                    break;
                }
            }
            if (seen) continue;
            out.add(hit);
            if (out.size() >= MAX_EVENTS) break;
        }
        return out;
    }

    static JSArray readDir(File logDir) {
        return readDir(logDir, System.currentTimeMillis(), FRESH_MS);
    }

    static JSArray readDir(File logDir, long nowMs, Long freshMs) {
        JSArray arr = new JSArray();
        if (logDir == null || !logDir.isDirectory()) return arr;
        File[] files = logDir.listFiles();
        if (files == null) return arr;
        List<String> hourNames = new ArrayList<>();
        for (File f : files) {
            if (HOUR_LOG.matcher(f.getName()).matches()) hourNames.add(f.getName());
        }
        Collections.sort(hourNames);
        Collections.reverse(hourNames);
        List<Hit> hits = new ArrayList<>();
        int limit = Math.min(2, hourNames.size());
        for (int i = 0; i < limit; i++) {
            File file = new File(logDir, hourNames.get(i));
            hits.addAll(parseRecent(FreenetLogPeerCount.tail(file, FreenetLogPeerCount.TAIL_BYTES), nowMs, freshMs, file.lastModified()));
            if (hits.size() >= MAX_EVENTS) break;
        }
        int n = Math.min(MAX_EVENTS, hits.size());
        for (int i = 0; i < n; i++) arr.put(toObject(hits.get(i)));
        return arr;
    }

    static JSObject toObject(Hit hit) {
        JSObject o = new JSObject();
        o.put("id", hit.id);
        o.put("at", hit.at);
        o.put("op", hit.op);
        o.put("direction", hit.direction);
        o.put("slotKind", "unknown");
        o.put("label", hit.label);
        o.put("source", "log");
        if (hit.contractKey != null) o.put("contractKey", hit.contractKey);
        if (hit.peerId != null) o.put("peerId", hit.peerId);
        return o;
    }
}
