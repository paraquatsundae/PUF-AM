package com.sentinut.farm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.File;

/**
 * Isolated {@code :freenet} process. Looks for {@code libfreenet.so} / a
 * vendored android-arm64 binary; reports {@code no android-arm64 binary}
 * instead of crashing. Does not JNI-link Freenet into the WebView process.
 * Plans/FREENET_NETWORK_PACK.md Phase 3 / Plans/APK_FREENET_HOST.md Phase 2.
 */
public class FreenetNodeService extends Service {
    static final String ACTION_START = "com.sentinut.farm.FREENET_START";
    private static final String CHANNEL = "freenet-host";
    private static final int NOTIFY_ID = 7509;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle(getString(R.string.freenet_host_notification_title))
                .setContentText(getString(R.string.freenet_host_notification_text))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFY_ID, notification);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (FreenetHostPlugin.probeLoopback()) {
            FreenetHostStatusStore.write(this, "attached", true, null, null);
            return START_STICKY;
        }
        File binary = findBinary(this);
        if (binary == null) {
            Log.w(FreenetHostPlugin.TAG, FreenetHostPlugin.NO_BINARY);
            FreenetHostStatusStore.write(this, "failed", false, FreenetHostPlugin.NO_BINARY, null);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        // A real spawn lands when scripts/build-freenet-android.mjs produces one.
        // Exec from filesDir is refused on API 29+; nativeLibraryDir is the path.
        FreenetHostStatusStore.write(this, "failed", false, FreenetHostPlugin.NO_BINARY, binary.getAbsolutePath());
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static File findBinary(Context ctx) {
        File nativeLib = new File(ctx.getApplicationInfo().nativeLibraryDir, "libfreenet.so");
        if (nativeLib.isFile()) return nativeLib;
        File files = new File(ctx.getFilesDir(), "freenet/android-arm64/freenet");
        if (files.isFile()) return files;
        File vendorHint = new File(ctx.getFilesDir(), "freenet/libfreenet.so");
        if (vendorHint.isFile()) return vendorHint;
        return null;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager mgr = getSystemService(NotificationManager.class);
        if (mgr == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                getString(R.string.freenet_host_channel_name),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.freenet_host_channel_desc));
        mgr.createNotificationChannel(channel);
    }
}
