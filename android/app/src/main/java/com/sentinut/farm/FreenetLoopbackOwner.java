package com.sentinut.farm;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Process;
import android.system.Os;
import android.util.Log;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Who holds {@code 127.0.0.1:7509} — our {@code libfreenet.so} vs another uid.
 * Uses {@code /proc/net/tcp} uid (and same-uid inode walk). Cannot force-stop
 * another package. Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14.
 */
final class FreenetLoopbackOwner {
    static final class Listener {
        Integer uid;
        Integer pid;
        String exe;
        boolean ourUid;
    }

    static final class TcpListen {
        final int uid;
        final int inode;

        TcpListen(int uid, int inode) {
            this.uid = uid;
            this.inode = inode;
        }
    }

    private FreenetLoopbackOwner() {}

    /**
     * First LISTEN row for {@code port} on loopback. {@code st=0A}.
     * Column layout matches Linux {@code /proc/net/tcp}.
     */
    static TcpListen parseListen(String procNet, int port) {
        if (procNet == null || procNet.isEmpty()) return null;
        String[] lines = procNet.split("\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty() || line.startsWith("sl")) continue;
            String[] cols = line.split("\\s+");
            if (cols.length < 10) continue;
            String local = cols[1];
            int colon = local.lastIndexOf(':');
            if (colon < 0) continue;
            int listenPort;
            try {
                listenPort = Integer.parseInt(local.substring(colon + 1), 16);
            } catch (NumberFormatException e) {
                continue;
            }
            if (listenPort != port) continue;
            if (cols.length > 3 && !"0A".equalsIgnoreCase(cols[3])) continue;
            String addr = local.substring(0, colon);
            if (!isLoopbackHex(addr)) continue;
            try {
                int uid = Integer.parseInt(cols[7]);
                int inode = Integer.parseInt(cols[9]);
                return new TcpListen(uid, inode);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    static boolean isLoopbackHex(String addr) {
        if (addr == null) return false;
        String upper = addr.toUpperCase();
        if ("0100007F".equals(upper)) return true;
        if ("00000000".equals(upper)) return false;
        return upper.matches("(?:0{8}){3}01000000");
    }

    static boolean exeLooksLikeOurFreenet(String exe) {
        if (exe == null || exe.isEmpty()) return false;
        String p = exe.replace('\\', '/');
        return p.contains("libfreenet.so")
                || p.contains("libfnwrap.so")
                || p.contains("/freenet/android-arm64/freenet")
                || p.contains("/freenet/libfreenet.so");
    }

    static Listener inspect(int port) {
        TcpListen listen = parseListen(readProc("tcp"), port);
        if (listen == null) listen = parseListen(readProc("tcp6"), port);
        if (listen == null) return null;
        Listener out = new Listener();
        out.uid = listen.uid;
        out.ourUid = listen.uid == Process.myUid();
        if (out.ourUid) {
            Integer pid = findPidForInode(listen.inode);
            if (pid != null) {
                out.pid = pid;
                out.exe = readLink("/proc/" + pid + "/exe");
            }
        }
        return out;
    }

    static boolean listenerIsOurs(int port) {
        Listener l = inspect(port);
        if (l == null || !l.ourUid) return false;
        // Same-app uid is our :freenet. Hidepid often leaves exe null.
        return FreenetNodePolicy.exeLooksLikeOurLeftover(l.exe);
    }

    static String[] packagesForUid(Context ctx, Listener listener) {
        if (ctx == null || listener == null || listener.uid == null) return new String[0];
        try {
            String[] pkgs = ctx.getPackageManager().getPackagesForUid(listener.uid);
            return pkgs != null ? pkgs : new String[0];
        } catch (Throwable e) {
            return new String[0];
        }
    }

    static boolean signalTerm(int pid) {
        if (pid <= 0 || pid == Process.myPid()) return false;
        try {
            Process.sendSignal(pid, 15);
            return true;
        } catch (Throwable e) {
            Log.w(FreenetHostPlugin.TAG, "signalTerm " + pid, e);
            return false;
        }
    }

    static boolean isInstalled(Context ctx, String packageName) {
        if (ctx == null || packageName == null) return false;
        try {
            ctx.getPackageManager().getPackageInfo(packageName, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private static String readProc(String table) {
        return readFile("/proc/net/" + table);
    }

    private static Integer findPidForInode(int inode) {
        File proc = new File("/proc");
        String[] names = proc.list();
        if (names == null) return null;
        String needle = "socket:[" + inode + "]";
        for (String name : names) {
            if (!name.matches("\\d+")) continue;
            File fdDir = new File("/proc/" + name + "/fd");
            String[] fds = fdDir.list();
            if (fds == null) continue;
            for (String fd : fds) {
                String target = readLink("/proc/" + name + "/fd/" + fd);
                if (needle.equals(target)) {
                    try {
                        return Integer.parseInt(name);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                }
            }
        }
        return null;
    }

    private static String readLink(String path) {
        try {
            return Os.readlink(path);
        } catch (Exception e) {
            try {
                return new File(path).getCanonicalPath();
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    private static String readFile(String path) {
        File file = new File(path);
        if (!file.isFile()) return null;
        try (BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
