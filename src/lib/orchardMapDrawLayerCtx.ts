import type { OrchardMapDrawLayerCtx } from './orchardMapDrawCreated';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from './mapStore';

type ChromeSlice = Pick<
  OrchardMapDrawLayerCtx,
  | 'featureGroupRef'
  | 'layerMapRef'
  | 'activeTabRef'
  | 'infraDrawKindRef'
  | 'setEditingPinId'
  | 'setEditingTrackId'
  | 'setHighlightedBlockId'
  | 'setHighlightedTrackId'
  | 'setActiveTab'
  | 'setShowSidebar'
  | 'setNamingBlock'
>;

type DrawSlice = Pick<
  OrchardMapDrawLayerCtx,
  'activeDrawerRef' | 'internalBoundaryDrawRef' | 'setInternalBoundaryDrawing'
>;

type StoreSlice = Pick<
  OrchardMapDrawLayerCtx,
  | 'addBlock'
  | 'addPin'
  | 'addTrack'
  | 'updateBlock'
  | 'updatePin'
  | 'updateTrack'
  | 'removeBlock'
  | 'removePin'
  | 'removeTrack'
>;

/** Assemble Leaflet draw ctx from the slices the page already owns. */
export function buildOrchardMapDrawLayerCtx(p: {
  farmId: string | undefined;
  canEdit: boolean;
  viewport: { lat: number; lng: number };
  farmProfile: unknown;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  pinsRef: { current: InfrastructurePin[] };
  chrome: ChromeSlice;
  draw: DrawSlice;
  store: StoreSlice;
}): OrchardMapDrawLayerCtx {
  return {
    farmId: p.farmId,
    canEdit: p.canEdit,
    viewport: p.viewport,
    farmProfile: p.farmProfile,
    blocks: p.blocks,
    pins: p.pins,
    tracks: p.tracks,
    pinsRef: p.pinsRef,
    featureGroupRef: p.chrome.featureGroupRef,
    layerMapRef: p.chrome.layerMapRef,
    activeTabRef: p.chrome.activeTabRef,
    infraDrawKindRef: p.chrome.infraDrawKindRef,
    setEditingPinId: p.chrome.setEditingPinId,
    setEditingTrackId: p.chrome.setEditingTrackId,
    setHighlightedBlockId: p.chrome.setHighlightedBlockId,
    setHighlightedTrackId: p.chrome.setHighlightedTrackId,
    setActiveTab: p.chrome.setActiveTab,
    setShowSidebar: p.chrome.setShowSidebar,
    setNamingBlock: p.chrome.setNamingBlock,
    activeDrawerRef: p.draw.activeDrawerRef,
    internalBoundaryDrawRef: p.draw.internalBoundaryDrawRef,
    setInternalBoundaryDrawing: p.draw.setInternalBoundaryDrawing,
    addBlock: p.store.addBlock,
    addPin: p.store.addPin,
    addTrack: p.store.addTrack,
    updateBlock: p.store.updateBlock,
    updatePin: p.store.updatePin,
    updateTrack: p.store.updateTrack,
    removeBlock: p.store.removeBlock,
    removePin: p.store.removePin,
    removeTrack: p.store.removeTrack,
  };
}
