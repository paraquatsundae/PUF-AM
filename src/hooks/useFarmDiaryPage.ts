import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadFarmExportJson } from '../lib/farmExport';
import { downloadFarmExportDiaryCsv } from '../lib/farmExportSheets';
import type { DiaryEvent } from '../lib/farmDiary';
import { getLastFarm } from '../lib/deviceSession';
import type { OrchardBlock } from '../lib/mapStore';
import {
  type DiaryFilter,
  type DiaryPageMode,
  downloadDiaryCsv,
  filterDiaryEvents,
  groupEventsByBlock,
  sortDiaryBlockIds,
} from '../lib/farmDiaryView';

export function useFarmDiaryPage(
  events: DiaryEvent[],
  blocks: OrchardBlock[],
  farmId: string | undefined,
  farmName: string | undefined
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusBlockId = searchParams.get('block');
  const pageMode: DiaryPageMode = searchParams.get('view') === 'issues' ? 'issues' : 'timeline';
  const [filter, setFilter] = useState<DiaryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [safetyForEventId, setSafetyForEventId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<'json' | 'csv' | null>(null);

  const setPageMode = (mode: DiaryPageMode) => {
    const next = new URLSearchParams(searchParams);
    if (mode === 'issues') next.set('view', 'issues');
    else next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const setFocusBlock = (blockId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (blockId) next.set('block', blockId);
    else next.delete('block');
    setSearchParams(next, { replace: true });
  };

  const focusBlock = useMemo(
    () => (focusBlockId ? blocks.find((b) => b.id === focusBlockId) : undefined),
    [blocks, focusBlockId]
  );

  const blocksSorted = useMemo(
    () => [...blocks].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [blocks]
  );

  const filteredEvents = useMemo(
    () => filterDiaryEvents(events, { filter, searchQuery, focusBlockId }),
    [events, filter, searchQuery, focusBlockId]
  );

  const groupedByBlock = useMemo(() => groupEventsByBlock(filteredEvents), [filteredEvents]);

  const sortedBlockIds = useMemo(
    () => sortDiaryBlockIds(groupedByBlock, focusBlockId, blocks),
    [groupedByBlock, focusBlockId, blocks]
  );

  useEffect(() => {
    if (!focusBlockId) return;
    const t = window.setTimeout(() => {
      document.getElementById(`diary-block-${focusBlockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(t);
  }, [focusBlockId, sortedBlockIds]);

  const handleExport = () => downloadDiaryCsv(filteredEvents);

  const exportFarmJson = () => {
    if (!farmId) return;
    void (async () => {
      setExportBusy('json');
      try {
        await downloadFarmExportJson(farmId, {
          farmName: getLastFarm()?.farmName || farmName,
          includeIssues: false,
          includeIssuesArchive: false,
        });
      } finally {
        setExportBusy(null);
      }
    })();
  };

  const exportDiaryCsv = () => {
    if (!farmId) return;
    void (async () => {
      setExportBusy('csv');
      try {
        await downloadFarmExportDiaryCsv(farmId, {
          farmName: getLastFarm()?.farmName || farmName,
        });
      } finally {
        setExportBusy(null);
      }
    })();
  };

  return {
    focusBlockId,
    pageMode,
    setPageMode,
    setFocusBlock,
    focusBlock,
    blocksSorted,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    filteredEvents,
    groupedByBlock,
    sortedBlockIds,
    handleExport,
    exportBusy,
    exportFarmJson,
    exportDiaryCsv,
    deleteConfirmId,
    setDeleteConfirmId,
    safetyForEventId,
    setSafetyForEventId,
  };
}
