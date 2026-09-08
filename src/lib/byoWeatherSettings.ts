/**
 * Firestore read/write for `farms/{id}/settings/weather`.
 * The document holds a function URL only — never a DPIRD key.
 */
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';

import { db } from '../firebase';
import {
  applyWeatherSettingsDoc,
  parseWeatherEndpoint,
  setRuntimeByoWeatherEndpoint,
} from './byoWeatherEndpoint';

export function weatherSettingsDoc(farmId: string) {
  return doc(db, 'farms', farmId, 'settings', 'weather');
}

export function subscribeByoWeatherSettings(farmId: string): () => void {
  return onSnapshot(
    weatherSettingsDoc(farmId),
    (snap) => {
      setRuntimeByoWeatherEndpoint(applyWeatherSettingsDoc(snap.exists() ? snap.data() : null));
    },
    (err) => {
      console.warn('[byo-weather] settings listen failed:', err);
      setRuntimeByoWeatherEndpoint(null);
    }
  );
}

export async function writeByoWeatherEndpoint(farmId: string, raw: string): Promise<string> {
  const parsed = parseWeatherEndpoint(raw);
  if (!('url' in parsed)) throw new Error(parsed.error);
  await setDoc(weatherSettingsDoc(farmId), {
    weatherEndpoint: parsed.url,
    setAt: new Date().toISOString(),
  });
  setRuntimeByoWeatherEndpoint(parsed.url);
  return parsed.url;
}

export async function deleteByoWeatherEndpoint(farmId: string): Promise<void> {
  await deleteDoc(weatherSettingsDoc(farmId));
  setRuntimeByoWeatherEndpoint(null);
}
