/**
 * If this browser already allowed notifications, refresh the push token.
 * Never prompts. The Settings card is what asks.
 */
import { useEffect } from 'react';
import { enableNotifyDevice } from '../lib/directedNotifyApi';
import { isByoFirebase } from '../lib/byoFirebaseConfig';
import { useAuth } from '../contexts/AuthContext';

export function NotifyDeviceKeeper() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || isByoFirebase()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void enableNotifyDevice().catch(() => undefined);
  }, [user]);
  return null;
}
