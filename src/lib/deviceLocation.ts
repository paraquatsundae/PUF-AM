/** Browser / Capacitor geolocation helper for farm create + nearby join. */

export type DeviceCoords = { lat: number; lng: number };

export async function getDeviceCoords(timeoutMs = 12000): Promise<DeviceCoords> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Location is not available on this device.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location permission denied. You can still join with a PIN only.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Location timed out. Try again or join with a PIN only.'));
        } else {
          reject(new Error('Could not read location. Join with a PIN only.'));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}
