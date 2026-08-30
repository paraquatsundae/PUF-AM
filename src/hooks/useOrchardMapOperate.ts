import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Map as LeafletMap } from 'leaflet';
import { issuesForBlock } from '../lib/blockIssueCounts';
import { useFieldStore, type FieldIssue } from '../lib/fieldStore';
import type { OrchardBlock } from '../lib/mapStore';

export function useOrchardMapOperate({
  farmId,
  uid,
  mapInstance,
  mapMode,
  blocks,
  highlightedBlockId,
  setHighlightedBlockId,
  fitBlockInView,
}: {
  farmId: string | undefined;
  uid: string | undefined;
  mapInstance: LeafletMap | null;
  mapMode: 'operate' | 'edit';
  blocks: OrchardBlock[];
  highlightedBlockId: string | null;
  setHighlightedBlockId: (id: string | null) => void;
  fitBlockInView: (block: OrchardBlock, opts?: { animate?: boolean }) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusIssueId = searchParams.get('issue');
  const focusedIssueRef = useRef<string | null>(null);
  const fieldIssues = useFieldStore((s) => s.issues);
  const loadFieldData = useFieldStore((s) => s.loadData);
  const addFieldIssue = useFieldStore((s) => s.addIssue);
  const updateFieldIssue = useFieldStore((s) => s.updateIssue);

  const [showIssueFlags, setShowIssueFlags] = useState(false);
  const [placingFlag, setPlacingFlag] = useState(false);
  const [issuesPanelBlockId, setIssuesPanelBlockId] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState<{
    lat: number;
    lng: number;
    blockId?: string;
  } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<FieldIssue | null>(null);

  useEffect(() => {
    if (farmId) loadFieldData(farmId);
  }, [farmId, loadFieldData]);

  useEffect(() => {
    if (mapMode !== 'operate' || !highlightedBlockId || !mapInstance) return;
    const block = blocks.find((b) => b.id === highlightedBlockId);
    if (!block?.geojson) return;
    fitBlockInView(block);
    // Only re-fit when the selection changes — not on every blocks refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [highlightedBlockId, mapMode, mapInstance]);

  useEffect(() => {
    if (!focusIssueId) {
      focusedIssueRef.current = null;
      return;
    }
    if (!mapInstance || mapMode !== 'operate') return;
    if (focusedIssueRef.current === focusIssueId) return;
    const issue = fieldIssues.find((i) => i.id === focusIssueId);
    if (!issue) return;

    focusedIssueRef.current = focusIssueId;
    setShowIssueFlags(true);
    setPlacingFlag(false);
    setReportDraft(null);
    setIssuesPanelBlockId(null);
    setHighlightedBlockId(null);
    setSelectedIssue(issue);
    mapInstance.flyTo([issue.lat, issue.lng], 18, { animate: true });

    const next = new URLSearchParams(searchParams);
    next.delete('issue');
    setSearchParams(next, { replace: true });
  }, [focusIssueId, fieldIssues, mapInstance, mapMode, searchParams, setSearchParams, setHighlightedBlockId]);

  useEffect(() => {
    if (!mapInstance || !reportDraft) return;
    mapInstance.panTo([reportDraft.lat, reportDraft.lng], { animate: true });
    window.setTimeout(() => {
      mapInstance.panBy([0, 90], { animate: true });
    }, 180);
  }, [mapInstance, reportDraft?.lat, reportDraft?.lng]);

  const selectedOperateBlock = highlightedBlockId
    ? blocks.find((b) => b.id === highlightedBlockId) || null
    : null;
  const issuesPanelBlock = issuesPanelBlockId
    ? blocks.find((b) => b.id === issuesPanelBlockId) || null
    : null;
  const issuesForPanel = useMemo(
    () => (issuesPanelBlock ? issuesForBlock(issuesPanelBlock, fieldIssues) : []),
    [issuesPanelBlock, fieldIssues]
  );

  const startReportForBlock = useCallback(
    (block: OrchardBlock) => {
      setHighlightedBlockId(block.id);
      setIssuesPanelBlockId(null);
      setReportDraft(null);
      setSelectedIssue(null);
      setPlacingFlag(true);
      fitBlockInView(block);
    },
    [fitBlockInView, setHighlightedBlockId]
  );

  const handleSaveIssue = useCallback(
    async (data: {
      category: FieldIssue['category'];
      priority: FieldIssue['priority'];
      note: string;
    }) => {
      if (!farmId || !reportDraft || !uid) return;
      const issue: FieldIssue = {
        id: crypto.randomUUID(),
        lat: reportDraft.lat,
        lng: reportDraft.lng,
        category: data.category,
        priority: data.priority,
        note: data.note || undefined,
        status: 'open',
        reportedBy: uid,
        reportedAt: new Date().toISOString(),
      };
      await addFieldIssue(farmId, issue);
      setReportDraft(null);
      setShowIssueFlags(true);
    },
    [farmId, reportDraft, uid, addFieldIssue]
  );

  const resolveIssue = useCallback(
    (issueId: string) => {
      if (!farmId) return Promise.resolve();
      return updateFieldIssue(farmId, issueId, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
      });
    },
    [farmId, updateFieldIssue]
  );

  return {
    fieldIssues,
    showIssueFlags,
    setShowIssueFlags,
    placingFlag,
    setPlacingFlag,
    issuesPanelBlockId,
    setIssuesPanelBlockId,
    reportDraft,
    setReportDraft,
    selectedIssue,
    setSelectedIssue,
    selectedOperateBlock,
    issuesPanelBlock,
    issuesForPanel,
    startReportForBlock,
    handleSaveIssue,
    resolveIssue,
  };
}
