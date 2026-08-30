export type MappedLeafletLayer = { _leaflet_id?: number };

export type LayerFeatureGroup = {
  getLayers: () => MappedLeafletLayer[];
  removeLayer: (layer: MappedLeafletLayer) => void;
};

export type LayerMapEntry = { type: string; id: string };

/** Drop a block / pin / track layer immediately so the map matches the store. */
export function removeMappedLeafletLayer(
  featureGroup: LayerFeatureGroup | null | undefined,
  layerMap: Record<number, LayerMapEntry>,
  type: 'block' | 'pin' | 'track',
  id: string
): void {
  if (!featureGroup) return;
  for (const layer of featureGroup.getLayers()) {
    const leafletId = layer._leaflet_id;
    if (leafletId == null) continue;
    const mapping = layerMap[leafletId];
    if (mapping && mapping.type === type && mapping.id === id) {
      featureGroup.removeLayer(layer);
      delete layerMap[leafletId];
    }
  }
}
