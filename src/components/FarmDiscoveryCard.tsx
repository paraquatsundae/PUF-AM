import React, { useState } from 'react';
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { updateFarmDiscovery } from '../lib/invitePinAuth';
import { getDeviceCoords } from '../lib/deviceLocation';

/** Admin control: stamp farm location for nearby join discovery. */
export function FarmDiscoveryCard() {
  const [showNearby, setShowNearby] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publishLocation = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const coords = await getDeviceCoords();
      await updateFarmDiscovery({ ...coords, showNearby });
      setMessage(
        showNearby
          ? `Nearby joiners can see this farm (~${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}).`
          : 'Location saved but nearby discovery is off.'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update location');
    } finally {
      setBusy(false);
    }
  };

  const hideFromNearby = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateFarmDiscovery({ showNearby: false });
      setShowNearby(false);
      setMessage('Farm hidden from nearby join list.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to hide farm');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-sky-50 rounded-xl">
          <MapPin className="w-5 h-5 text-sky-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Nearby discovery</h2>
          <p className="text-sm text-slate-500">
            Workers on the join screen see farms near their phone — tap the name, then enter a PIN.
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {message && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          {message}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showNearby}
          onChange={(e) => setShowNearby(e.target.checked)}
          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        Show this farm on nearby join lists
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void publishLocation()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          Use this device location
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void hideFromNearby()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Hide from nearby
        </button>
      </div>
    </div>
  );
}
