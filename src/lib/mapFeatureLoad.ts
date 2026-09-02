/**
 * Rendered-feature load for the orchard map.
 *
 * Nothing on the map is viewport-culled: `syncOrchardMapLayers` adds one Leaflet
 * layer per block, pin and track and never drops them on pan or zoom. The
 * farm-wide total is therefore the layer count actually being drawn, whatever
 * the operator has in frame.
 */

/** Layer count above which pan/zoom drops frames on mid-range mobile. */
export const MAP_FEATURE_WARN_THRESHOLD = 500;

export type MapFeatureLoad = {
  total: number;
  blocks: number;
  pins: number;
  tracks: number;
  message: string;
};

/** Warning for an over-threshold farm, or null when the map is within budget. */
export function assessMapFeatureLoad(
  geometry: {
    blocks: readonly unknown[];
    pins: readonly unknown[];
    tracks: readonly unknown[];
  },
  threshold: number = MAP_FEATURE_WARN_THRESHOLD
): MapFeatureLoad | null {
  const blocks = geometry.blocks.length;
  const pins = geometry.pins.length;
  const tracks = geometry.tracks.length;
  const total = blocks + pins + tracks;

  if (total <= threshold) return null;

  return {
    total,
    blocks,
    pins,
    tracks,
    message:
      `This map is drawing ${total} features ` +
      `(${blocks} blocks, ${pins} pins, ${tracks} tracks). ` +
      `Panning and zooming may stutter on phones and tablets.`,
  };
}
