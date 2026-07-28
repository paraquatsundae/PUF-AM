/**
 * Live GPS “you are here” marker + accuracy halo for Orchard Map.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Circle, Marker, useMap } from 'react-leaflet';
import { Capacitor } from '@capacitor/core';
import L from '../../lib/leaflet-setup';

export type UserGeoFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  heading: number | null;
};

type Props = {
  /** When true, map follows the user as GPS updates (gentle). */
  follow?: boolean;
  onFix?: (fix: UserGeoFix | null) => void;
};

const userLocationIcon = L.divIcon({
  className: 'pufom-user-location-icon',
  html: `
    <div class="pufom-user-loc">
      <span class="pufom-user-loc__pulse"></span>
      <span class="pufom-user-loc__dot"></span>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

async function ensureNativeLocationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      status = await Geolocation.requestPermissions();
    }
    return status.location === 'granted' || status.coarseLocation === 'granted';
  } catch (e) {
    console.warn('[UserLocation] Capacitor Geolocation unavailable', e);
    return true; // fall through to browser API
  }
}

export function useUserGeolocation(enabled = true): {
  fix: UserGeoFix | null;
  error: string | null;
} {
  const [fix, setFix] = useState<UserGeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let watchId: string | number | null = null;
    let usedCapacitor = false;

    const applyPos = (lat: number, lng: number, accuracyM: number, heading: number | null) => {
      if (cancelled) return;
      setFix({ lat, lng, accuracyM, heading });
      setError(null);
    };

    void (async () => {
      const ok = await ensureNativeLocationPermission();
      if (cancelled) return;
      if (!ok) {
        setError('Location permission denied');
        return;
      }

      // Prefer Capacitor watch on native (more reliable permission + GPS on Android WebView)
      if (Capacitor.isNativePlatform()) {
        try {
          const { Geolocation } = await import('@capacitor/geolocation');
          usedCapacitor = true;
          watchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 },
            (pos, err) => {
              if (cancelled) return;
              if (err || !pos) {
                setError(err?.message || 'Location unavailable');
                return;
              }
              applyPos(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy ?? 0,
                typeof pos.coords.heading === 'number' ? pos.coords.heading : null
              );
            }
          );
          return;
        } catch (e) {
          console.warn('[UserLocation] falling back to navigator.geolocation', e);
        }
      }

      if (!navigator.geolocation) {
        setError('Geolocation not available');
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          applyPos(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy || 0,
            typeof pos.coords.heading === 'number' ? pos.coords.heading : null
          );
        },
        (err) => {
          if (!cancelled) setError(err.message || 'Location unavailable');
        },
        { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 }
      );
    })();

    return () => {
      cancelled = true;
      if (watchId == null) return;
      if (usedCapacitor && typeof watchId === 'string') {
        void import('@capacitor/geolocation').then(({ Geolocation }) => {
          void Geolocation.clearWatch({ id: watchId as string });
        });
      } else if (typeof watchId === 'number') {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [enabled]);

  return { fix, error };
}

/** Must render inside MapContainer. */
export function UserLocationLayer({ follow = false, onFix }: Props) {
  const map = useMap();
  const { fix } = useUserGeolocation(true);

  useEffect(() => {
    onFix?.(fix);
  }, [fix, onFix]);

  useEffect(() => {
    if (!follow || !fix) return;
    map.setView([fix.lat, fix.lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [follow, fix?.lat, fix?.lng, map]);

  const accuracyRadius = useMemo(() => {
    if (!fix) return 0;
    return Math.min(Math.max(fix.accuracyM, 8), 80);
  }, [fix]);

  if (!fix) return null;

  return (
    <>
      {accuracyRadius > 0 && (
        <Circle
          center={[fix.lat, fix.lng]}
          radius={accuracyRadius}
          pathOptions={{
            color: '#2563eb',
            weight: 1,
            opacity: 0.35,
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
            interactive: false,
          }}
        />
      )}
      <Marker
        position={[fix.lat, fix.lng]}
        icon={userLocationIcon}
        zIndexOffset={1200}
        interactive={false}
      />
    </>
  );
}
