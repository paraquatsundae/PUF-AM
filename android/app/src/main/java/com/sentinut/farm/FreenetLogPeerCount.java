package com.sentinut.farm;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Peer count from this bake's Freenet {@code --log-dir}. 0.2.135 has no JSON
 * peer API. Latest {@code ring_connections=} wins; {@code connection_count=}
 * is the fallback. Do not scrape the HTML dashboard.
 *
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (peer count from logs).
 */
final class FreenetLogPeerCount {
    static final String RING_LAST = "pufam-ring.last";
    static final String RING_FALLBACK = "pufam-ring.log";
    static final int TAIL_BYTES = 256 * 1024;
    static final long FRESH_MS = 2L * 60L * 60L * 1000L;
    private static final int MAX_PEER_COUNT = 10_000;
    private static final Pattern HOUR_LOG = Pattern.compile("^freenet\\.\\d{4}-\\d{2}-\\d{2}-\\d{2}\\.log$");
    private static final Pattern RING = Pattern.compile("\\bring_connections=(\\d+)\\b");
    private static final Pattern CONN = Pattern.compile("\\bconnection_count=(\\d+)\\b");
    private static final Pattern TS = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})");

    static final class Hit {
        final int peerCount;
        final String key;

        Hit(int peerCount, String key) {
            this.peerCount = peerCount;
            this.key = key;
        }
    }

    private FreenetLogPeerCount() {}

    static File ringLastFile(File logDir) {
        return new File(logDir, RING_LAST);
    }

    static boolean lineHasPeerCount(String line) {
        return parseLine(line) != null;
    }

    static Hit parseLine(String line) {
        if (line == null) return null;
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.charAt(0) == '<') return null;
        Matcher ring = RING.matcher(line);
        if (ring.find()) {
            Integer n = asPeerCount(ring.group(1));
            if (n != null) return new Hit(n, "ring_connections");
        }
        Matcher conn = CONN.matcher(line);
        if (conn.find()) {
            Integer n = asPeerCount(conn.group(1));
            if (n != null) return new Hit(n, "connection_count");
        }
        return null;
    }

    static Hit parseLatest(String text) {
        return parseLatest(text, System.currentTimeMillis(), FRESH_MS, null);
    }

    static Hit parseLatest(String text, long nowMs, Long freshMs, Long fileMtimeMs) {
        if (text == null) return null;
        String start = text.trim();
        if (start.isEmpty() || start.charAt(0) == '<') return null;
        String[] lines = text.split("\\r?\\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i];
            Hit hit = parseLine(line);
            if (hit == null) continue;
            if (!isFresh(line, nowMs, freshMs, fileMtimeMs)) return null;
            return hit;
        }
        return null;
    }

    static Integer readDir(File logDir) {
        return readDir(logDir, System.currentTimeMillis(), FRESH_MS);
    }

    static Integer readDir(File logDir, long nowMs, Long freshMs) {
        if (logDir == null || !logDir.isDirectory()) return null;
        File[] files = logDir.listFiles();
        if (files == null) return null;
        List<String> hourNames = new ArrayList<>();
        boolean hasLast = false;
        boolean hasFallback = false;
        for (File f : files) {
            String name = f.getName();
            if (HOUR_LOG.matcher(name).matches()) hourNames.add(name);
            else if (RING_LAST.equals(name)) hasLast = true;
            else if (RING_FALLBACK.equals(name)) hasFallback = true;
        }
        Collections.sort(hourNames);
        Collections.reverse(hourNames);
        List<File> order = new ArrayList<>();
        for (String name : hourNames) order.add(new File(logDir, name));
        if (hasLast) order.add(new File(logDir, RING_LAST));
        if (hasFallback) order.add(new File(logDir, RING_FALLBACK));
        for (File file : order) {
            Hit hit = parseLatest(tail(file, TAIL_BYTES), nowMs, freshMs, file.lastModified());
            if (hit != null) return hit.peerCount;
        }
        return null;
    }

    static void writeLatestLine(File file, String line) {
        if (file == null || line == null) return;
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return;
        try (FileWriter writer = new FileWriter(file, false)) {
            writer.write(line);
            writer.write('\n');
        } catch (IOException ignored) {
            /* best-effort */
        }
    }

    static String tail(File file, int maxBytes) {
        if (file == null || !file.isFile()) return "";
        RandomAccessFile raf = null;
        try {
            long size = file.length();
            long start = Math.max(0L, size - maxBytes);
            int len = (int) (size - start);
            if (len <= 0) return "";
            raf = new RandomAccessFile(file, "r");
            raf.seek(start);
            byte[] buf = new byte[len];
            raf.readFully(buf);
            return new String(buf, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        } finally {
            if (raf != null) {
                try {
                    raf.close();
                } catch (IOException ignored) {
                    /* */
                }
            }
        }
    }

    private static Integer asPeerCount(String raw) {
        if (raw == null || raw.length() == 0 || raw.length() > 5) return null;
        try {
            int n = Integer.parseInt(raw);
            if (n < 0 || n > MAX_PEER_COUNT) return null;
            return n;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static boolean isFresh(String line, long nowMs, Long freshMs, Long fileMtimeMs) {
        if (freshMs == null) return true;
        Long at = lineTimeMs(line);
        if (at == null) at = fileMtimeMs;
        if (at == null) return true;
        return nowMs - at <= freshMs;
    }

    static Long lineTimeMs(String line) {
        if (line == null) return null;
        Matcher m = TS.matcher(line.trim());
        if (!m.find()) return null;
        try {
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            fmt.setLenient(false);
            return fmt.parse(m.group(1)).getTime();
        } catch (Exception e) {
            return null;
        }
    }
}
