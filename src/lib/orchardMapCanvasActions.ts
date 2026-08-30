import type { Map as LeafletMap } from 'leaflet';
import { setBasemapSkipped } from './basemapPack';
import { deleteSelectedVertex } from './boundaryEditSession';
import type { FieldIssue } from './fieldStore';
import type { MapHighlightDoc } from './mapHighlights';
import type { OrchardBlock } from './mapStore';

type InternalBoundaryKind = 'internal_passable' | 'internal_impassable';

type HighlightDraft = GeoJSON.Feature | GeoJSON.Geometry | null;

type Deps = {
  farmId: string;
  basemapPack: { id?: string } | null;
  setBasemapSkippedState: (skipped: boolean) => void;
  setShowBasemapSetup: (open: boolean) => void;
  refreshBasemapPack: () => Promise<void>;
  setHighlightedBlockId: (id: string | null) => void;
  setIssuesPanelBlockId: (id: string | null) => void;
  setSelectedIssue: (issue: FieldIssue | null) => void;
  placingHighlight: boolean;
  highlightDraftGeo: HighlightDraft;
  cancelHighlightPaint: () => void;
  startHighlightPaint: () => void;
  placingFlag: boolean;
  setPlacingFlag: (next: boolean) => void;
  setReportDraft: (draft: { lat: number; lng: number; blockId?: string } | null) => void;
  selectedOperateBlock: OrchardBlock | null;
  fitBlockInView: (block: OrchardBlock) => void;
  setHighlightSending: (sending: boolean) => void;
  createHighlight: (input: {
    geojson: GeoJSON.Feature | GeoJSON.Geometry;
    note?: string;
    audience?: 'all';
    durationSeconds?: number | null;
  }) => Promise<MapHighlightDoc | null>;
  setHighlightDraftGeo: (geo: HighlightDraft) => void;
  mapInstance: LeafletMap | null;
  boundaryEditRef: { current: any };
  setBoundaryEditTick: (fn: (t: number) => number) => void;
  boundaryEditBlockId: string | null;
  canEdit: boolean;
  beginInternalBoundaryDraw: (kind: InternalBoundaryKind, blockId: string) => void;
  resolveIssue: (id: string) => Promise<unknown>;
  selectedIssue: FieldIssue | null;
};

/** Canvas event handlers. Not viewport / analytics / clicks. */
export function orchardMapCanvasActions(d: Deps) {
  const boundaryEditBlockId = d.boundaryEditBlockId;
  return {
    onBasemapCancel: () => {
      if (!d.basemapPack) {
        setBasemapSkipped(d.farmId, true);
        d.setBasemapSkippedState(true);
      }
      d.setShowBasemapSetup(false);
    },
    onBasemapComplete: async () => {
      await d.refreshBasemapPack();
      d.setShowBasemapSetup(false);
    },
    onSelectIssueBlock: (blockId: string) => {
      d.setHighlightedBlockId(blockId);
      d.setIssuesPanelBlockId(null);
      d.setSelectedIssue(null);
    },
    onSelectIssue: (issue: FieldIssue) => {
      d.setSelectedIssue(issue);
      d.setHighlightedBlockId(null);
      d.setIssuesPanelBlockId(null);
    },
    onToggleHighlight: () => {
      if (d.placingHighlight || d.highlightDraftGeo) {
        d.cancelHighlightPaint();
        return;
      }
      d.startHighlightPaint();
    },
    onTogglePlaceFlag: () => {
      const next = !d.placingFlag;
      if (next) d.cancelHighlightPaint();
      d.setPlacingFlag(next);
      d.setReportDraft(null);
      d.setIssuesPanelBlockId(null);
      d.setSelectedIssue(null);
      if (next && d.selectedOperateBlock) {
        d.fitBlockInView(d.selectedOperateBlock);
      }
    },
    onSendHighlight: ({ note, durationSeconds }: { note: string; durationSeconds: number }) => {
      if (!d.highlightDraftGeo) return;
      d.setHighlightSending(true);
      void d
        .createHighlight({
          geojson: d.highlightDraftGeo,
          note,
          durationSeconds,
          audience: 'all',
        })
        .then(() => {
          d.setHighlightDraftGeo(null);
        })
        .finally(() => d.setHighlightSending(false));
    },
    onViewIssues: () => {
      if (d.selectedOperateBlock) d.setIssuesPanelBlockId(d.selectedOperateBlock.id);
    },
    onSelectIssueFly: (issue: FieldIssue) => {
      d.setSelectedIssue(issue);
      d.setIssuesPanelBlockId(null);
      if (d.mapInstance) d.mapInstance.flyTo([issue.lat, issue.lng], 17);
    },
    onCancelReport: () => {
      d.setReportDraft(null);
      d.setPlacingFlag(true);
    },
    onResolveSelected: () => {
      if (!d.selectedIssue) return;
      void d.resolveIssue(d.selectedIssue.id).then(() => d.setSelectedIssue(null));
    },
    onResolveListedIssue: (issue: FieldIssue) => {
      void d.resolveIssue(issue.id);
    },
    onDeleteBoundaryPoint: () => {
      if (!d.boundaryEditRef.current) return;
      deleteSelectedVertex(d.boundaryEditRef.current);
      d.setBoundaryEditTick((t) => t + 1);
    },
    onAddInternalBoundary:
      boundaryEditBlockId && d.canEdit
        ? (kind: InternalBoundaryKind) => d.beginInternalBoundaryDraw(kind, boundaryEditBlockId)
        : undefined,
  };
}
