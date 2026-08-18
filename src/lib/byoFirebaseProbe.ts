import { deleteApp, initializeApp } from 'firebase/app';
import { doc, getDoc, initializeFirestore } from 'firebase/firestore';
import type { ByoFirebaseWebConfig } from './byoFirebaseConfig';

/**
 * Spin up a throwaway app to prove the pasted keys reach a real project.
 * Permission-denied is success — the project exists. Invalid API key / 404 is not.
 */
export async function probeByoFirebase(
  config: ByoFirebaseWebConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = `byo-probe-${Date.now()}`;
  const app = initializeApp(config, name);
  try {
    const db = initializeFirestore(app, {});
    await getDoc(doc(db, 'farms', '_pufam_probe'));
    return { ok: true };
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (
      code === 'permission-denied' ||
      code === 'not-found' ||
      /permission/i.test(msg) ||
      /not found/i.test(msg)
    ) {
      return { ok: true };
    }
    if (/api.?key/i.test(msg) || code === 'auth/api-key-not-valid.') {
      return { ok: false, error: 'That API key was refused. Copy the web app config again.' };
    }
    return { ok: false, error: msg.slice(0, 240) };
  } finally {
    await deleteApp(app).catch(() => undefined);
  }
}
