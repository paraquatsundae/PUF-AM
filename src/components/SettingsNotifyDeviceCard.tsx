/**
 * Lets this browser receive directed alerts while the site is closed.
 * Does not prompt until the person turns it on.
 */
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { enableNotifyDevice } from '../lib/directedNotifyApi';
import { isByoFirebase } from '../lib/byoFirebaseConfig';

export function SettingsNotifyDeviceCard() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (isByoFirebase()) return null;

  const turnOn = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await enableNotifyDevice();
      if (result === 'ready') {
        setStatus('This browser can receive alerts when the site is closed.');
      } else if (result === 'denied') {
        setStatus('Notifications are blocked in this browser.');
      } else if (result === 'not-configured') {
        setStatus('Push is not set up on this server yet. A Google account can still be emailed.');
      } else {
        setStatus('This browser cannot receive push alerts.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-bold text-slate-900">Notifications on this device</h2>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">
        Allow alerts so a highlight sent to you can arrive when PUF-AM is not open. A Google
        account is emailed instead if this device has not allowed them.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void turnOn()}
        className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Allow notifications'}
      </button>
      {status && <p className="text-sm text-slate-600">{status}</p>}
    </div>
  );
}
