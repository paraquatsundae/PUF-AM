/**
 * Local farm-map search (paddock / track / pin name). Geocode stays in the hook.
 */
export type FarmMapSearchMatch =
  | { kind: 'block'; id: string }
  | { kind: 'track'; id: string }
  | { kind: 'pin'; id: string };

export function farmMapNameMatches(name: string | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return Boolean(name?.toLowerCase().includes(q));
}

export function matchFarmMapSearch(
  query: string,
  items: {
    blocks: Array<{ id: string; name?: string }>;
    tracks: Array<{ id: string; name?: string }>;
    pins: Array<{ id: string; name?: string }>;
  }
): FarmMapSearchMatch | null {
  const q = query.trim();
  if (!q) return null;

  const foundBlock = items.blocks.find((b) => farmMapNameMatches(b.name, q));
  if (foundBlock) return { kind: 'block', id: foundBlock.id };

  const foundTrack = items.tracks.find((t) => farmMapNameMatches(t.name, q));
  if (foundTrack) return { kind: 'track', id: foundTrack.id };

  const foundPin = items.pins.find((p) => farmMapNameMatches(p.name, q));
  if (foundPin) return { kind: 'pin', id: foundPin.id };

  return null;
}
