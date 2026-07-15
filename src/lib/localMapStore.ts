/**
 * Local-only map geometry for workshop mode (no Firestore).
 * Keyed by farmId in localStorage.
 */
import type { OrchardBlock, InfrastructurePin, FarmTrack, MapViewport } from './mapStore';

type LocalMapBundle = {
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  viewport: MapViewport | null;
};

const KEY = (farmId: string) => `sentinut_local_map_${farmId}`;

function read(farmId: string): LocalMapBundle {
  try {
    const raw = localStorage.getItem(KEY(farmId));
    if (!raw) return { blocks: [], pins: [], tracks: [], viewport: null };
    return JSON.parse(raw) as LocalMapBundle;
  } catch {
    return { blocks: [], pins: [], tracks: [], viewport: null };
  }
}

function write(farmId: string, data: LocalMapBundle) {
  localStorage.setItem(KEY(farmId), JSON.stringify(data));
}

export const localMapStore = {
  getBlocks(farmId: string): OrchardBlock[] {
    return read(farmId).blocks;
  },
  getPins(farmId: string): InfrastructurePin[] {
    return read(farmId).pins;
  },
  getTracks(farmId: string): FarmTrack[] {
    return read(farmId).tracks;
  },
  getViewport(farmId: string): MapViewport | null {
    return read(farmId).viewport;
  },
  saveBlock(farmId: string, block: OrchardBlock) {
    const data = read(farmId);
    const idx = data.blocks.findIndex((b) => b.id === block.id);
    if (idx >= 0) data.blocks[idx] = block;
    else data.blocks.push(block);
    write(farmId, data);
  },
  deleteBlock(farmId: string, id: string) {
    const data = read(farmId);
    data.blocks = data.blocks.filter((b) => b.id !== id);
    write(farmId, data);
  },
  savePin(farmId: string, pin: InfrastructurePin) {
    const data = read(farmId);
    const idx = data.pins.findIndex((p) => p.id === pin.id);
    if (idx >= 0) data.pins[idx] = pin;
    else data.pins.push(pin);
    write(farmId, data);
  },
  deletePin(farmId: string, id: string) {
    const data = read(farmId);
    data.pins = data.pins.filter((p) => p.id !== id);
    write(farmId, data);
  },
  saveTrack(farmId: string, track: FarmTrack) {
    const data = read(farmId);
    const idx = data.tracks.findIndex((t) => t.id === track.id);
    if (idx >= 0) data.tracks[idx] = track;
    else data.tracks.push(track);
    write(farmId, data);
  },
  deleteTrack(farmId: string, id: string) {
    const data = read(farmId);
    data.tracks = data.tracks.filter((t) => t.id !== id);
    write(farmId, data);
  },
  saveViewport(farmId: string, viewport: MapViewport) {
    const data = read(farmId);
    data.viewport = viewport;
    write(farmId, data);
  },
};
