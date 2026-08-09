package com.sentinut.farm;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin NSD browse for workshop LAN hubs advertised as _pufom-sync._tcp.
 */
@CapacitorPlugin(name = "PufomNsd")
public class PufomNsdPlugin extends Plugin {
    private static final String TAG = "PufomNsd";

    private NsdManager nsdManager;
    private WifiManager.MulticastLock multicastLock;
    private NsdManager.DiscoveryListener discoveryListener;
    private final Map<String, NsdServiceInfo> found = new HashMap<>();
    private final List<JSObject> resolved = new ArrayList<>();
    private int pendingResolves = 0;
    private boolean finishing = false;
    private PluginCall activeCall;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void discover(PluginCall call) {
        String serviceType = call.getString("serviceType", "_pufom-sync._tcp.");
        int timeoutMs = call.getInt("timeoutMs", 3500);

        if (activeCall != null) {
            call.reject("NSD discovery already in progress");
            return;
        }

        activeCall = call;
        found.clear();
        resolved.clear();
        pendingResolves = 0;
        finishing = false;

        Context ctx = getContext();
        nsdManager = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        if (nsdManager == null) {
            activeCall = null;
            call.reject("NsdManager unavailable");
            return;
        }

        WifiManager wifi = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            multicastLock = wifi.createMulticastLock("pufom-nsd");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
        }

        discoveryListener = new NsdManager.DiscoveryListener() {
            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                Log.w(TAG, "start failed " + errorCode);
                finishWithError("NSD start failed: " + errorCode);
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                Log.w(TAG, "stop failed " + errorCode);
            }

            @Override
            public void onDiscoveryStarted(String serviceType) {
                Log.i(TAG, "discovery started " + serviceType);
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                Log.i(TAG, "discovery stopped");
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                String name = serviceInfo.getServiceName();
                if (name == null) return;
                if (found.containsKey(name)) return;
                found.put(name, serviceInfo);
                pendingResolves++;
                nsdManager.resolveService(serviceInfo, new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                        Log.w(TAG, "resolve failed " + errorCode);
                        pendingResolves--;
                        maybeComplete();
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo info) {
                        JSObject row = new JSObject();
                        row.put("name", info.getServiceName() != null ? info.getServiceName() : "");
                        row.put("host", info.getHost() != null ? info.getHost().getHostAddress() : "");
                        row.put("port", info.getPort());
                        JSArray addrs = new JSArray();
                        if (info.getHost() != null && info.getHost().getHostAddress() != null) {
                            addrs.put(info.getHost().getHostAddress());
                        }
                        row.put("addresses", addrs);
                        // A multi-homed hub answers getaddrinfo with whichever
                        // interface it feels like — on a laptop with USB tethering
                        // up, that is routinely the address the tablet cannot
                        // reach. The hub also states its LAN address in TXT, so
                        // pass the attributes through and let the caller prefer it.
                        row.put("txt", readAttributes(info));
                        synchronized (resolved) {
                            resolved.add(row);
                        }
                        pendingResolves--;
                        maybeComplete();
                    }
                });
            }

            @Override
            public void onServiceLost(NsdServiceInfo serviceInfo) {
                if (serviceInfo.getServiceName() != null) {
                    found.remove(serviceInfo.getServiceName());
                }
            }
        };

        try {
            nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
        } catch (Exception e) {
            finishWithError(e.getMessage() != null ? e.getMessage() : "discoverServices failed");
            return;
        }

        mainHandler.postDelayed(this::stopAndComplete, Math.max(1200, timeoutMs));
    }

    private JSObject readAttributes(NsdServiceInfo info) {
        JSObject txt = new JSObject();
        Map<String, byte[]> attrs = info.getAttributes();
        if (attrs == null) return txt;
        for (Map.Entry<String, byte[]> entry : attrs.entrySet()) {
            byte[] value = entry.getValue();
            txt.put(entry.getKey(), value == null ? "" : new String(value, StandardCharsets.UTF_8));
        }
        return txt;
    }

    private void maybeComplete() {
        if (finishing && pendingResolves <= 0) {
            deliverResult();
        }
    }

    private void stopAndComplete() {
        finishing = true;
        stopDiscoveryQuietly();
        if (pendingResolves <= 0) {
            deliverResult();
        } else {
            // Wait a bit more for in-flight resolves
            mainHandler.postDelayed(() -> {
                pendingResolves = 0;
                deliverResult();
            }, 1500);
        }
    }

    private void finishWithError(String message) {
        stopDiscoveryQuietly();
        releaseMulticast();
        PluginCall call = activeCall;
        activeCall = null;
        finishing = false;
        if (call != null) {
            call.reject(message);
        }
    }

    private void deliverResult() {
        PluginCall call = activeCall;
        if (call == null) return;
        activeCall = null;
        finishing = false;
        releaseMulticast();

        JSObject ret = new JSObject();
        JSArray services = new JSArray();
        synchronized (resolved) {
            for (JSObject row : resolved) {
                services.put(row);
            }
        }
        ret.put("services", services);
        call.resolve(ret);
    }

    private void stopDiscoveryQuietly() {
        if (nsdManager != null && discoveryListener != null) {
            try {
                nsdManager.stopServiceDiscovery(discoveryListener);
            } catch (Exception e) {
                Log.w(TAG, "stopServiceDiscovery", e);
            }
        }
        discoveryListener = null;
    }

    private void releaseMulticast() {
        if (multicastLock != null && multicastLock.isHeld()) {
            try {
                multicastLock.release();
            } catch (Exception ignored) {
            }
        }
        multicastLock = null;
    }
}
