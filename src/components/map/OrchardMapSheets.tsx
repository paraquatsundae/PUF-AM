import { AnimatePresence } from 'motion/react';
import type { BasemapPack } from '../../lib/basemapPack';
import type { FarmProfile } from '../../lib/farmDiary';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from '../../lib/mapStore';
import type { NewPaddockSave } from './NewPaddockSheet';
import type { MapMode } from './editMapTypes';
import type { InternalBoundaryKind } from './BoundaryEditActionBar';
import { BlockMetadataModal } from './BlockMetadataModal';
import { PinMetadataModal } from './PinMetadataModal';
import { TrackMetadataModal } from './TrackMetadataModal';
import { BoundaryImportSheet } from './BoundaryImportSheet';
import { NewPaddockSheet } from './NewPaddockSheet';
import { OrchardMapHelp } from './OrchardMapHelp';

export function OrchardMapSheets({
  farmId,
  farmName,
  farmProfile,
  canEdit,
  mapMode,
  namingBlock,
  onDismissNaming,
  onSaveNaming,
  editingBlockId,
  blocks,
  pins,
  isConfirmingDeleteBlock,
  setIsConfirmingDeleteBlock,
  updateBlock,
  beginInternalBoundaryDraw,
  beginBoundaryEdit,
  onCloseBlock,
  onDeleteBlock,
  onOpenPin,
  showBoundaryImport,
  onCloseImport,
  onCurrentFarmBlock,
  onCurrentFarmDelete,
  onImported,
  editingPinId,
  isConfirmingDeletePin,
  setIsConfirmingDeletePin,
  updatePin,
  onClosePin,
  onDeletePin,
  editingTrackId,
  tracks,
  isConfirmingDeleteTrack,
  setIsConfirmingDeleteTrack,
  updateTrack,
  debouncedUpdateTrackName,
  onCloseTrack,
  onDeleteTrack,
  showHelp,
  onCloseHelp,
  basemapPack,
  basemapBusy,
  onUpdatePack,
  onClearPack,
}: {
  farmId: string;
  farmName: string;
  farmProfile: FarmProfile | undefined;
  canEdit: boolean;
  mapMode: MapMode;
  namingBlock: OrchardBlock | null;
  onDismissNaming: () => void;
  onSaveNaming: (updates: NewPaddockSave) => void;
  editingBlockId: string | null;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  isConfirmingDeleteBlock: boolean;
  setIsConfirmingDeleteBlock: (v: boolean) => void;
  updateBlock: (id: string, updates: Partial<OrchardBlock>) => void;
  beginInternalBoundaryDraw: (kind: InternalBoundaryKind, blockId: string) => void;
  beginBoundaryEdit: (blockId: string) => void;
  onCloseBlock: () => void;
  onDeleteBlock: () => void;
  onOpenPin: (pinId: string) => void;
  showBoundaryImport: boolean;
  onCloseImport: () => void;
  onCurrentFarmBlock: (block: OrchardBlock) => Promise<void>;
  onCurrentFarmDelete: (id: string) => Promise<void>;
  onImported: (result: { currentAdded: number; otherFarms: number }) => void | Promise<void>;
  editingPinId: string | null;
  isConfirmingDeletePin: boolean;
  setIsConfirmingDeletePin: (v: boolean) => void;
  updatePin: (id: string, updates: Partial<InfrastructurePin>) => void;
  onClosePin: () => void;
  onDeletePin: () => void;
  editingTrackId: string | null;
  tracks: FarmTrack[];
  isConfirmingDeleteTrack: boolean;
  setIsConfirmingDeleteTrack: (v: boolean) => void;
  updateTrack: (id: string, updates: Partial<FarmTrack>) => void;
  debouncedUpdateTrackName: ((id: string, name: string) => void) & {
    flush: () => void;
    cancel: () => void;
  };
  onCloseTrack: () => void;
  onDeleteTrack: () => void;
  showHelp: boolean;
  onCloseHelp: () => void;
  basemapPack: BasemapPack | null;
  basemapBusy: boolean;
  onUpdatePack: () => void;
  onClearPack: () => void;
}) {
  return (
    <>
      {namingBlock && (
        <NewPaddockSheet
          block={namingBlock}
          farmProfile={farmProfile}
          onDismiss={onDismissNaming}
          onSave={onSaveNaming}
        />
      )}

      <AnimatePresence>
        {editingBlockId && !namingBlock && (
          <BlockMetadataModal
            editingBlockId={editingBlockId}
            blocks={blocks}
            pins={pins}
            farmProfile={farmProfile}
            canEdit={canEdit}
            mapMode={mapMode}
            isConfirmingDeleteBlock={isConfirmingDeleteBlock}
            setIsConfirmingDeleteBlock={setIsConfirmingDeleteBlock}
            updateBlock={updateBlock}
            beginInternalBoundaryDraw={beginInternalBoundaryDraw}
            beginBoundaryEdit={beginBoundaryEdit}
            onClose={onCloseBlock}
            onDelete={onDeleteBlock}
            onOpenPin={onOpenPin}
          />
        )}

        <BoundaryImportSheet
          open={showBoundaryImport}
          onClose={onCloseImport}
          currentFarmId={farmId}
          currentFarmName={farmName}
          onCurrentFarmBlock={onCurrentFarmBlock}
          onCurrentFarmDelete={onCurrentFarmDelete}
          onImported={onImported}
        />

        {editingPinId && (
          <PinMetadataModal
            editingPinId={editingPinId}
            pins={pins}
            isConfirmingDeletePin={isConfirmingDeletePin}
            setIsConfirmingDeletePin={setIsConfirmingDeletePin}
            updatePin={updatePin}
            onClose={onClosePin}
            onDelete={onDeletePin}
          />
        )}

        {editingTrackId && (
          <TrackMetadataModal
            editingTrackId={editingTrackId}
            tracks={tracks}
            isConfirmingDeleteTrack={isConfirmingDeleteTrack}
            setIsConfirmingDeleteTrack={setIsConfirmingDeleteTrack}
            updateTrack={updateTrack}
            debouncedUpdateTrackName={debouncedUpdateTrackName}
            onClose={onCloseTrack}
            onDelete={onDeleteTrack}
          />
        )}
      </AnimatePresence>

      <OrchardMapHelp
        open={showHelp}
        onClose={onCloseHelp}
        basemapPack={basemapPack}
        basemapBusy={basemapBusy}
        onUpdatePack={onUpdatePack}
        onClearPack={onClearPack}
      />
    </>
  );
}
