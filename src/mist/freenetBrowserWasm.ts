/**
 * Pack and slot contract WASM for a WebView PUT.
 *
 * Desktop main reads these off disk (`FREENET_PACK_WASM` / `FREENET_SLOT_WASM`).
 * The APK has no Node fs, so Vite ships the pinned files as URL assets and we
 * fetch them once. Same bytes as `units/mist-freenet/assets/` — a hash drift
 * would move every published URI.
 *
 * Plans/FREENET_NETWORK_PACK.md Phase 3.
 */

import packUrl from '../../units/mist-freenet/assets/pack-contract.wasm?url';
import slotUrl from '../../units/mist-freenet/assets/slot-contract.wasm?url';

export type FreenetBrowserWasmKind = 'pack' | 'slot';

const cache: Partial<Record<FreenetBrowserWasmKind, Uint8Array>> = {};
const loaders: Record<FreenetBrowserWasmKind, () => Promise<Uint8Array>> = {
  pack: () => fetchWasm(packUrl),
  slot: () => fetchWasm(slotUrl),
};

async function fetchWasm(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Freenet contract WASM missing (${res.status}): ${url}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadFreenetBrowserWasm(kind: FreenetBrowserWasmKind): Promise<Uint8Array> {
  const hit = cache[kind];
  if (hit) return hit;
  const bytes = await loaders[kind]();
  cache[kind] = bytes;
  return bytes;
}

/** Tests: stand in for the Vite asset fetch. */
export function setFreenetBrowserWasmLoader(
  kind: FreenetBrowserWasmKind,
  loader: (() => Promise<Uint8Array>) | null,
): void {
  loaders[kind] = loader ?? (kind === 'pack' ? () => fetchWasm(packUrl) : () => fetchWasm(slotUrl));
  delete cache[kind];
}

export function resetFreenetBrowserWasmCache(): void {
  delete cache.pack;
  delete cache.slot;
}
