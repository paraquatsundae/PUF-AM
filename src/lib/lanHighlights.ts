/**
 * Workshop LAN map highlights via Express hub.
 */
import { auth } from '../firebase';
import {
  type MapHighlightDoc,
  mergeHighlightsById,
} from './mapHighlights';
import { syncApiUrl } from './mdnsPeers';

export const HIGHLIGHT_LAN_POLL_MS = 3_000;

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function upsertLanHighlight(
  farmId: string,
  highlight: MapHighlightDoc
): Promise<void> {
  if (!farmId || !highlight.id) return;
  const headers = await authHeaders();
  const res = await fetch(syncApiUrl(`/api/highlights/${encodeURIComponent(farmId)}`), {
    method: 'POST',
    headers,
    body: JSON.stringify(highlight),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `LAN highlight upsert ${res.status}`);
  }
}

export async function deleteLanHighlight(farmId: string, id: string): Promise<void> {
  if (!farmId || !id) return;
  try {
    const headers = await authHeaders();
    const res = await fetch(
      syncApiUrl(
        `/api/highlights/${encodeURIComponent(farmId)}/${encodeURIComponent(id)}`
      ),
      { method: 'DELETE', headers }
    );
    if (!res.ok && res.status !== 401 && res.status !== 404) {
      console.warn('[lanHighlights] delete failed', res.status);
    }
  } catch (err) {
    console.warn('[lanHighlights] delete failed', err);
  }
}

export async function fetchLanHighlights(farmId: string): Promise<MapHighlightDoc[]> {
  if (!farmId) return [];
  const headers = await authHeaders();
  const res = await fetch(syncApiUrl(`/api/highlights/${encodeURIComponent(farmId)}`), {
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `LAN highlight fetch ${res.status}`);
  }
  const data = (await res.json()) as { entries?: MapHighlightDoc[] };
  return (data.entries || []).map((e) => ({
    ...e,
    id: e.id,
    audience: e.audience ?? 'all',
  }));
}

export { mergeHighlightsById };
