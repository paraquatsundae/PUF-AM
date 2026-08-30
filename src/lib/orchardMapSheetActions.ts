import { isTreeCropKind } from '../../shared/farm/farmTypes';
import { removeMappedLeafletLayer } from './mapLayerCleanup';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from './mapStore';

type NamingUpdates = Partial<
  Pick<OrchardBlock, 'name' | 'cultivar' | 'species' | 'cropKind' | 'geometryKind' | 'seasonLabel' | 'density'>
>;

type Deps = {
  namingBlock: OrchardBlock | null;
  updateBlock: (id: string, updates: Partial<OrchardBlock>) => void;
  setNamingBlock: (block: OrchardBlock | null) => void;
  setEditingBlockId: (id: string | null) => void;
  setIsConfirmingDeleteBlock: (v: boolean) => void;
  editingBlockId: string | null;
  removeBlock: (id: string) => void;
  featureGroupRef: { current: any };
  layerMapRef: { current: Record<number, { type: 'block' | 'pin' | 'track'; id: string }> };
  setEditingPinId: (id: string | null) => void;
  farmId: string | undefined;
  resetFarmFit: () => void;
  loadData: (farmId: string) => Promise<unknown>;
  fitFarmInView: (opts: { animate: boolean }) => void;
  setIsConfirmingDeletePin: (v: boolean) => void;
  editingPinId: string | null;
  removePin: (id: string) => void;
  setEditingTrackId: (id: string | null) => void;
  setIsConfirmingDeleteTrack: (v: boolean) => void;
  editingTrackId: string | null;
  removeTrack: (id: string) => void;
};

/** Metadata-sheet handlers. Not a second map page. */
export function orchardMapSheetActions(d: Deps) {
  return {
    onDismissNaming: () => {
      if (!d.namingBlock) return;
      if (d.namingBlock.cropKind && !isTreeCropKind(d.namingBlock.cropKind)) {
        d.updateBlock(d.namingBlock.id, {
          species: '',
          cultivar: d.namingBlock.seasonLabel || '',
          density: '',
        });
      }
      d.setNamingBlock(null);
    },
    onSaveNaming: (updates: NamingUpdates) => {
      if (!d.namingBlock) return;
      d.updateBlock(d.namingBlock.id, updates);
      d.setNamingBlock(null);
    },
    onCloseBlock: () => {
      d.setEditingBlockId(null);
      d.setIsConfirmingDeleteBlock(false);
    },
    onDeleteBlock: () => {
      if (!d.editingBlockId) return;
      d.removeBlock(d.editingBlockId);
      d.setEditingBlockId(null);
      d.setIsConfirmingDeleteBlock(false);
      removeMappedLeafletLayer(
        d.featureGroupRef.current,
        d.layerMapRef.current,
        'block',
        d.editingBlockId
      );
    },
    onOpenPin: (pinId: string) => {
      d.setEditingBlockId(null);
      d.setIsConfirmingDeleteBlock(false);
      d.setEditingPinId(pinId);
    },
    onImported: async ({ currentAdded }: { currentAdded: number }) => {
      if (!d.farmId || currentAdded <= 0) return;
      d.resetFarmFit();
      await d.loadData(d.farmId);
      window.requestAnimationFrame(() => {
        d.fitFarmInView({ animate: true });
      });
    },
    onClosePin: () => {
      d.setEditingPinId(null);
      d.setIsConfirmingDeletePin(false);
    },
    onDeletePin: () => {
      if (!d.editingPinId) return;
      d.removePin(d.editingPinId);
      d.setEditingPinId(null);
      d.setIsConfirmingDeletePin(false);
      removeMappedLeafletLayer(
        d.featureGroupRef.current,
        d.layerMapRef.current,
        'pin',
        d.editingPinId
      );
    },
    onCloseTrack: () => {
      d.setEditingTrackId(null);
      d.setIsConfirmingDeleteTrack(false);
    },
    onDeleteTrack: () => {
      if (!d.editingTrackId) return;
      d.removeTrack(d.editingTrackId);
      d.setEditingTrackId(null);
      d.setIsConfirmingDeleteTrack(false);
      removeMappedLeafletLayer(
        d.featureGroupRef.current,
        d.layerMapRef.current,
        'track',
        d.editingTrackId
      );
    },
  };
}
