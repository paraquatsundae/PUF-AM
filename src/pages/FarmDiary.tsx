import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  X,
  CheckCircle2,
  Search,
  Download,
  ShieldCheck,
  AlertTriangle,
  LayoutGrid,
} from 'lucide-react';
import { useFarmDiary, SprayType, ApplicationMethod, getDefaultDiaryStartDate, WorkPriority } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { useFieldStore, type FieldIssue } from '../lib/fieldStore';
import { useAuth } from '../contexts/AuthContext';
import { SafetyAcceptModal } from '../components/SafetyAcceptModal';
import { DiaryIssuesPanel } from '../components/diary/DiaryIssuesPanel';
import { issuesForBlock } from '../lib/blockIssueCounts';
import { DEFAULT_CHEMICALS, DEFAULT_BIOLOGICALS, DEFAULT_CARRIERS, DEFAULT_ADJUVANTS } from '../constants';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { downloadFarmExportJson, downloadFarmExportXlsx } from '../lib/farmExport';
import { getLastFarm } from '../lib/deviceSession';

type DiaryFilter = 'all' | 'plans' | 'spray' | 'irrigation' | 'nutrition' | 'work';
type LogTab = 'spray' | 'irrigation' | 'plan';
type DiaryPageMode = 'timeline' | 'issues';

export function FarmDiary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusBlockId = searchParams.get('block');
  const pageMode: DiaryPageMode = searchParams.get('view') === 'issues' ? 'issues' : 'timeline';
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { events, settings, addEvent, updateEvent, removeEvent, updateSettings, canEdit, loadMore, hasMore, isLoadingMore } = useFarmDiary(getDefaultDiaryStartDate(90));
  const { blocks } = useMapStore();
  const fieldIssues = useFieldStore((s) => s.issues);
  const loadFieldData = useFieldStore((s) => s.loadData);
  const updateFieldIssue = useFieldStore((s) => s.updateIssue);
  const [activeTab, setActiveTab] = useState<LogTab>('plan');
  const [composerOpen, setComposerOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DiaryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [safetyForEventId, setSafetyForEventId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<'json' | 'xlsx' | null>(null);
  const [linkedIssueId, setLinkedIssueId] = useState<string | null>(null);

  useEffect(() => {
    if (farmId) loadFieldData(farmId);
  }, [farmId, loadFieldData]);

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

  const openIssueCount = useMemo(
    () => fieldIssues.filter((i) => i.status === 'open' || i.status === 'in-progress').length,
    [fieldIssues]
  );

  const markIssueInProgress = (issueId: string) => {
    if (!farmId) return;
    void updateFieldIssue(farmId, issueId, { status: 'in-progress' });
  };

  const resolveLinkedIssue = (issueId: string) => {
    if (!farmId) return;
    void updateFieldIssue(farmId, issueId, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
  };

  /** Cancel / unlink — put the field issue back in the open queue. */
  const reopenLinkedIssue = (issueId: string) => {
    if (!farmId) return;
    void updateFieldIssue(farmId, issueId, {
      status: 'open',
      resolvedAt: null as unknown as undefined,
    });
  };

  // Filter and Search logic
  const filteredEvents = events.filter(event => {
    const status = event.status ?? (event.type === 'work' ? 'planned' : 'done');
    const matchesFilter =
      filter === 'all' ||
      (filter === 'plans' && event.type === 'work' && status === 'planned') ||
      (filter === 'work' && event.type === 'work') ||
      (filter !== 'plans' && filter !== 'work' && event.type === filter);
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      searchQuery === '' ||
      event.notes?.toLowerCase().includes(q) ||
      event.agentName?.toLowerCase().includes(q) ||
      event.productName?.toLowerCase().includes(q) ||
      event.title?.toLowerCase().includes(q) ||
      event.assignedToName?.toLowerCase().includes(q) ||
      (event.type === 'spray' && event.sprayType?.toLowerCase().includes(q));
    const matchesBlock =
      !focusBlockId || (event.blockId || 'general') === focusBlockId;

    return matchesFilter && matchesSearch && matchesBlock;
  });

  // Group events by block
  const groupedByBlock = filteredEvents.reduce((acc, event) => {
    const blockId = event.blockId || 'general';
    if (!acc[blockId]) {
      acc[blockId] = [];
    }
    acc[blockId].push(event);
    return acc;
  }, {} as Record<string, typeof events>);

  // Sort blocks: focused block first (from ?block=), then general, then by name
  const sortedBlockIds = useMemo(() => {
    const ids = Object.keys(groupedByBlock);
    if (focusBlockId && !ids.includes(focusBlockId)) ids.unshift(focusBlockId);
    return ids.sort((a, b) => {
      if (focusBlockId) {
        if (a === focusBlockId) return -1;
        if (b === focusBlockId) return 1;
      }
      if (a === 'general') return -1;
      if (b === 'general') return 1;
      const blockA = blocks.find((bl) => bl.id === a)?.name || '';
      const blockB = blocks.find((bl) => bl.id === b)?.name || '';
      return blockA.localeCompare(blockB);
    });
  }, [groupedByBlock, focusBlockId, blocks]);

  useEffect(() => {
    if (!focusBlockId) return;
    const t = window.setTimeout(() => {
      document.getElementById(`diary-block-${focusBlockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(t);
  }, [focusBlockId, sortedBlockIds]);

  const handleExport = () => {
    const headers = ['Date', 'Type', 'Status', 'Title/Product', 'Assignee', 'Amount (MM)', 'Duration (Mins)', 'Rate', 'NPK', 'Notes'];
    const rows = filteredEvents.map(e => {
      const npk = [
        e.nRate != null ? `N${e.nRate}` : '',
        e.pRate != null ? `P${e.pRate}` : '',
        e.kRate != null ? `K${e.kRate}` : '',
      ].filter(Boolean).join(' ');
      return [
        e.date,
        e.type,
        e.status || (e.type === 'work' ? 'planned' : 'done'),
        e.title || e.productName || e.agentName || (e.type === 'spray' ? e.sprayType : '') || '',
        e.assignedToName || '',
        e.irrigationAmount || '',
        e.durationMinutes || '',
        e.rate != null ? `${e.rate}${e.rateUnit ? ` ${e.rateUnit}` : ''}` : '',
        npk,
        e.notes || '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    link.setAttribute('download', `farm_log_export_${year}-${month}-${day}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Form states
  const todayDate = new Date();
  const todayYear = todayDate.getFullYear();
  const todayMonth = String(todayDate.getMonth() + 1).padStart(2, '0');
  const todayDay = String(todayDate.getDate()).padStart(2, '0');
  const [date, setDate] = useState(`${todayYear}-${todayMonth}-${todayDay}`);
  const [sprayType, setSprayType] = useState<SprayType>('chem');
  const [applicationMethod, setApplicationMethod] = useState<ApplicationMethod>('ground');
  const [agentName, setAgentName] = useState('');
  const [carrier, setCarrier] = useState('Water');
  const [adjuvant, setAdjuvant] = useState('None');
  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [workPriority, setWorkPriority] = useState<WorkPriority>('medium');

  // Prefill composer target when arriving from map / block picker
  useEffect(() => {
    if (focusBlockId) setSelectedBlockId(focusBlockId);
  }, [focusBlockId]);

  const createPlanFromIssue = (issue: FieldIssue, blockId: string | undefined) => {
    const title = issue.note?.trim()
      ? issue.note.trim().slice(0, 80)
      : `Fix ${issue.category}`;
    setPageMode('timeline');
    setActiveTab('plan');
    setComposerOpen(true);
    setShowSuccess(false);
    setLinkedIssueId(issue.id);
    setSelectedBlockId(blockId || '');
    setWorkTitle(title);
    setNotes(issue.note || '');
    setWorkPriority(issue.priority);
    // in-progress is set when the plan is saved — not when opening the composer
  };

  // Custom entry states
  const [showCustomAgent, setShowCustomAgent] = useState(false);
  const [customAgent, setCustomAgent] = useState('');
  const [showCustomCarrier, setShowCustomCarrier] = useState(false);
  const [customCarrier, setCustomCarrier] = useState('');
  const [showCustomAdjuvant, setShowCustomAdjuvant] = useState(false);
  const [customAdjuvant, setCustomAdjuvant] = useState('');

  const allChemicals = useMemo(() => {
    return [...DEFAULT_CHEMICALS, ...(settings.customChemicals || [])];
  }, [settings.customChemicals]);

  const allBiologicals = useMemo(() => {
    return [...DEFAULT_BIOLOGICALS, ...(settings.customBiologicals || [])];
  }, [settings.customBiologicals]);

  const availableProducts = useMemo(() => {
    return sprayType === 'chem' ? allChemicals : allBiologicals;
  }, [sprayType, allChemicals, allBiologicals]);

  const allCarriers = useMemo(() => {
    return [...DEFAULT_CARRIERS, ...(settings.customCarriers || [])];
  }, [settings.customCarriers]);

  const allAdjuvants = useMemo(() => {
    return [...DEFAULT_ADJUVANTS, ...(settings.customAdjuvants || [])];
  }, [settings.customAdjuvants]);

  // Clear agent name when switching spray type
  useEffect(() => {
    setAgentName('');
    setCustomAgent('');
    setShowCustomAgent(false);
  }, [sprayType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    
    if (activeTab === 'spray') {
      const finalAgent = showCustomAgent ? customAgent : agentName;
      const finalCarrier = showCustomCarrier ? customCarrier : carrier;
      const finalAdjuvant = showCustomAdjuvant ? customAdjuvant : adjuvant;

      // Save custom items to settings if they are new
      if (showCustomAgent && customAgent) {
        if (sprayType === 'chem' && !allChemicals.includes(customAgent)) {
          updateSettings({ customChemicals: [...(settings.customChemicals || []), customAgent] });
        } else if (sprayType === 'bio' && !allBiologicals.includes(customAgent)) {
          updateSettings({ customBiologicals: [...(settings.customBiologicals || []), customAgent] });
        }
      }
      if (showCustomCarrier && customCarrier && !allCarriers.includes(customCarrier)) {
        updateSettings({ customCarriers: [...(settings.customCarriers || []), customCarrier] });
      }
      if (showCustomAdjuvant && customAdjuvant && !allAdjuvants.includes(customAdjuvant)) {
        updateSettings({ customAdjuvants: [...(settings.customAdjuvants || []), customAdjuvant] });
      }

      addEvent({
        date,
        type: 'spray',
        status: 'done',
        blockId: selectedBlockId || undefined,
        sprayType,
        applicationMethod,
        agentName: finalAgent || undefined,
        carrier: finalCarrier || undefined,
        adjuvant: finalAdjuvant || undefined,
        notes: notes || undefined
      });
    } else if (activeTab === 'irrigation') {
      const numAmount = parseFloat(amount);
      const numDuration = parseFloat(duration);
      if (isNaN(numAmount)) return;
      addEvent({
        date,
        type: 'irrigation',
        status: 'done',
        blockId: selectedBlockId || undefined,
        irrigationAmount: numAmount,
        durationMinutes: isNaN(numDuration) ? undefined : numDuration,
        notes: notes || undefined
      });
    } else {
      if (!workTitle.trim()) return;
      const issueId = linkedIssueId || undefined;
      addEvent({
        date,
        type: 'work',
        status: 'planned',
        title: workTitle.trim(),
        blockId: selectedBlockId || undefined,
        assignedToName: assigneeName.trim() || undefined,
        priority: workPriority,
        notes: notes || undefined,
        linkedIssueId: issueId,
      });
      if (issueId) markIssueInProgress(issueId);
    }
    
    setAmount('');
    setAgentName('');
    setCustomAgent('');
    setShowCustomAgent(false);
    setCustomCarrier('');
    setShowCustomCarrier(false);
    setCustomAdjuvant('');
    setShowCustomAdjuvant(false);
    setSelectedBlockId('');
    setDuration('');
    setNotes('');
    setWorkTitle('');
    setAssigneeName('');
    setWorkPriority('medium');
    setLinkedIssueId(null);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setComposerOpen(false);
    }, 1200);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans">
      <header className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 text-white rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Farm diary</h1>
              <p className="text-xs text-slate-500">
                {pageMode === 'issues'
                  ? 'Triage field issues and turn them into plans'
                  : 'Plan ahead, then log what was done'}
              </p>
            </div>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPageMode('timeline')}
              className={cn(
                'px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg',
                pageMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setPageMode('issues')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg',
                pageMode === 'issues'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Issues
              {openIssueCount > 0 && (
                <span
                  className={cn(
                    'min-w-[1.25rem] px-1 py-0.5 rounded-md text-[10px] tabular-nums',
                    pageMode === 'issues' ? 'bg-amber-100 text-amber-800' : 'bg-amber-500 text-white'
                  )}
                >
                  {openIssueCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 space-y-6">
          {/* Block scope — all farm vs one block (no need to return to the map) */}
          {blocksSorted.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Blocks
                </p>
                {focusBlockId && (
                  <button
                    type="button"
                    onClick={() => setFocusBlock(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Show all blocks
                  </button>
                )}
              </div>
              {focusBlockId && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-950 truncate">
                      {focusBlock?.name || 'Selected block'}
                    </p>
                    <p className="text-[11px] text-emerald-800/80">
                      Viewing this block only
                      {focusBlock?.cultivar ? ` · ${focusBlock.cultivar}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFocusBlock(null)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    <X className="w-3.5 h-3.5" />
                    All farm
                  </button>
                </div>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setFocusBlock(null)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                    !focusBlockId
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  )}
                >
                  All farm
                </button>
                {blocksSorted.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setFocusBlock(b.id)}
                    className={cn(
                      'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors max-w-[10rem] truncate',
                      focusBlockId === b.id
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    )}
                    title={b.name}
                  >
                    {b.name || 'Unnamed'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pageMode === 'issues' ? (
            <DiaryIssuesPanel
              blocks={focusBlock ? [focusBlock] : blocks}
              issues={
                focusBlock ? issuesForBlock(focusBlock, fieldIssues) : fieldIssues
              }
              canEdit={canEdit}
              onCreatePlan={createPlanFromIssue}
              onResolve={(issue) => {
                if (!farmId) return;
                void updateFieldIssue(farmId, issue.id, {
                  status: 'resolved',
                  resolvedAt: new Date().toISOString(),
                });
              }}
            />
          ) : (
            <>
            {/* 1. Add entry — primary workflow step */}
            {canEdit && (
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen((v) => !v);
                    setShowSuccess(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-slate-900 text-white shrink-0">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900">Add to diary</div>
                      <div className="text-xs text-slate-500 truncate">
                        Plan work, or log a spray / irrigation
                      </div>
                    </div>
                  </div>
                  {composerOpen ? (
                    <ChevronDown className="w-5 h-5 text-slate-400 shrink-0 rotate-180 transition-transform" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {composerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="p-4 sm:p-5 space-y-5">
{/* Tab Switcher */}
<div className="grid grid-cols-3 p-1 bg-slate-100 rounded-xl">
  <button 
    onClick={() => setActiveTab('plan')}
    className={cn(
      "py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
      activeTab === 'plan' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
    )}
  >
    Plan
  </button>
  <button 
    onClick={() => setActiveTab('spray')}
    className={cn(
      "py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
      activeTab === 'spray' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
    )}
  >
    Spray
  </button>
  <button 
    onClick={() => setActiveTab('irrigation')}
    className={cn(
      "py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
      activeTab === 'irrigation' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
    )}
  >
    Water
  </button>
</div>

<form onSubmit={handleSubmit} className="space-y-5">
  <AnimatePresence mode="wait">
    {showSuccess ? (
      <motion.div 
        key="success"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -10 }}
        className="p-8 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col items-center justify-center gap-4 text-emerald-700 text-center"
      >
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
            <h4 className="font-bold text-lg">Saved</h4>
            <p className="text-sm opacity-80">Added to the diary.</p>
          </div>
      </motion.div>
    ) : (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-5"
      >
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">
            {activeTab === 'plan' ? 'Planned date' : 'Execution Date'}
          </label>
          <div className="relative">
            <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Target Block</label>
          <select 
            value={selectedBlockId}
            onChange={(e) => setSelectedBlockId(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
          >
            <option value="">All Blocks / General</option>
            {blocks.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.areaHa} Ha)</option>
            ))}
          </select>
        </div>

        {activeTab === 'plan' ? (
          <div className="space-y-5">
            {linkedIssueId && (
              <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Linked to a field issue — save plan to mark it in progress
                </p>
                <button
                  type="button"
                  onClick={() => setLinkedIssueId(null)}
                  className="text-[10px] font-bold uppercase text-amber-700 hover:underline shrink-0"
                >
                  Unlink
                </button>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Work title</label>
              <input
                type="text"
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
                placeholder="e.g. Fix drip line in Block 3"
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Assign to</label>
              <input
                type="text"
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Priority</label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setWorkPriority(p)}
                    className={cn(
                      'py-2 text-xs font-bold uppercase rounded-xl border capitalize',
                      workPriority === p
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-600'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What needs doing, tools, access notes…"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Plans show on the diary timeline. Starting work requires the farm safety checklist.
            </p>
          </div>
        ) : activeTab === 'spray' ? (
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Agent Classification</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSprayType('chem')}
                  className={cn(
                    "py-3 text-xs font-bold rounded-xl border transition-all",
                    sprayType === 'chem' 
                      ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  Chemical
                </button>
                <button
                  type="button"
                  onClick={() => setSprayType('bio')}
                  className={cn(
                    "py-3 text-xs font-bold rounded-xl border transition-all",
                    sprayType === 'bio' 
                      ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  Biological
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Application Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setApplicationMethod('ground')}
                  className={cn(
                    "py-2 text-xs font-bold rounded-xl border transition-all",
                    applicationMethod === 'ground' 
                      ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  Ground Sprayer
                </button>
                <button
                  type="button"
                  onClick={() => setApplicationMethod('drone')}
                  className={cn(
                    "py-2 text-xs font-bold rounded-xl border transition-all",
                    applicationMethod === 'drone' 
                      ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  Drone
                </button>
                <button
                  type="button"
                  onClick={() => setApplicationMethod('helicopter')}
                  className={cn(
                    "py-2 text-xs font-bold rounded-xl border transition-all",
                    applicationMethod === 'helicopter' 
                      ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  Helicopter
                </button>
                <button
                  type="button"
                  onClick={() => setApplicationMethod('aeroplane')}
                  className={cn(
                    "py-2 text-xs font-bold rounded-xl border transition-all",
                    applicationMethod === 'aeroplane' 
                      ? "bg-slate-900 border-slate-900 text-white shadow-md" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  Aeroplane
                </button>
              </div>
            </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Agent Name / Product</label>
                <div className="space-y-2">
                  <select 
                    value={showCustomAgent ? 'custom' : agentName}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setShowCustomAgent(true);
                      } else {
                        setShowCustomAgent(false);
                        setAgentName(e.target.value);
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                  >
                    <option value="">Select {sprayType === 'chem' ? 'Chemical' : 'Biological'}...</option>
                    {availableProducts.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="custom">+ Add New {sprayType === 'chem' ? 'Chemical' : 'Biological'}...</option>
                  </select>
                  
                  {showCustomAgent && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <input 
                        type="text"
                        placeholder={`Enter custom ${sprayType === 'chem' ? 'chemical' : 'biological'} name`}
                        value={customAgent}
                        onChange={(e) => setCustomAgent(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        autoFocus
                      />
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Carrier</label>
                  <div className="space-y-2">
                    <select 
                      value={showCustomCarrier ? 'custom' : carrier}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setShowCustomCarrier(true);
                        } else {
                          setShowCustomCarrier(false);
                          setCarrier(e.target.value);
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                    >
                      {allCarriers.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="custom">+ Add New Carrier...</option>
                    </select>
                    {showCustomCarrier && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <input 
                          type="text"
                          placeholder="Custom carrier"
                          value={customCarrier}
                          onChange={(e) => setCustomCarrier(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        />
                      </motion.div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Adjuvant / Additive</label>
                  <div className="space-y-2">
                    <select 
                      value={showCustomAdjuvant ? 'custom' : adjuvant}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setShowCustomAdjuvant(true);
                        } else {
                          setShowCustomAdjuvant(false);
                          setAdjuvant(e.target.value);
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                    >
                      {allAdjuvants.map(a => <option key={a} value={a}>{a}</option>)}
                      <option value="custom">+ Add New Adjuvant...</option>
                    </select>
                    {showCustomAdjuvant && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <input 
                          type="text"
                          placeholder="Custom adjuvant"
                          value={customAdjuvant}
                          onChange={(e) => setCustomAdjuvant(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        />
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Volume (MM)</label>
                <input 
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Duration (Mins)</label>
                <input 
                  type="number"
                  placeholder="0"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'plan' && (
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Field Notes</label>
            <textarea 
              placeholder="Add observations or specific details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all resize-none"
            />
          </div>
        )}

        <button 
          type="submit"
          className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {activeTab === 'plan' ? 'Save plan' : 'Save log'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    )}
  </AnimatePresence>
</form>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )}

            {/* 2. Browse timeline */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto overflow-x-auto scrollbar-hide">
                  {([
                    { id: 'all', label: 'All' },
                    { id: 'plans', label: 'Plans' },
                    { id: 'spray', label: 'Spray' },
                    { id: 'irrigation', label: 'Water' },
                    { id: 'nutrition', label: 'Nutrition' },
                    { id: 'work', label: 'Work' },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setFilter(t.id)}
                      className={cn(
                        "flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all whitespace-nowrap",
                        filter === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <input 
                      type="text"
                      placeholder="Search…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-400"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    {searchQuery && (
                      <button 
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full"
                      >
                        <X className="w-3 h-3 text-slate-400" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={filteredEvents.length === 0}
                    className="p-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 disabled:opacity-40"
                    title="Export diary CSV (filtered view)"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!farmId || !!exportBusy}
                    title="Export JSON (local) — all diary rows on device"
                    onClick={() => {
                      if (!farmId) return;
                      void (async () => {
                        setExportBusy('json');
                        try {
                          await downloadFarmExportJson(farmId, {
                            farmName: getLastFarm()?.farmName || settings.farmName,
                            includeIssues: false,
                            includeIssuesArchive: false,
                          });
                        } finally {
                          setExportBusy(null);
                        }
                      })();
                    }}
                    className="px-2 py-2 bg-white border border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-40"
                  >
                    {exportBusy === 'json' ? '…' : 'JSON'}
                  </button>
                  <button
                    type="button"
                    disabled={!farmId || !!exportBusy}
                    title="Export Excel (local) — all diary rows on device"
                    onClick={() => {
                      if (!farmId) return;
                      void (async () => {
                        setExportBusy('xlsx');
                        try {
                          await downloadFarmExportXlsx(farmId, {
                            farmName: getLastFarm()?.farmName || settings.farmName,
                            includeIssues: false,
                            includeIssuesArchive: false,
                          });
                        } finally {
                          setExportBusy(null);
                        }
                      })();
                    }}
                    className="px-2 py-2 bg-white border border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-40"
                  >
                    {exportBusy === 'xlsx' ? '…' : 'Excel'}
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              {/* Timeline Thread */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />

              <div className="space-y-16">
                {sortedBlockIds.length === 0 ? (
                  <div className="ml-16 py-20 text-center space-y-3">
                    <p className="text-sm text-slate-500">
                      {searchQuery || filter !== 'all'
                        ? 'No matching entries.'
                        : focusBlockId
                          ? 'No diary entries for this block yet. Add a plan or log above.'
                          : 'No diary entries yet. Add a plan or log above.'}
                    </p>
                    {focusBlockId && (
                      <button
                        type="button"
                        onClick={() => setFocusBlock(null)}
                        className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                      >
                        Show all farm blocks
                      </button>
                    )}
                  </div>
                ) : (
                  sortedBlockIds.map((blockId) => {
                    const block = blocks.find(b => b.id === blockId);
                    const blockEvents = [...(groupedByBlock[blockId] || [])].sort((a, b) => b.date.localeCompare(a.date));
                    
                    return (
                      <div key={blockId} id={`diary-block-${blockId}`} className="relative">
                        <div className="mb-6 flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200">
                          <div>
                            <h2 className="text-base font-bold text-slate-900 tracking-tight">
                              {block ? block.name : 'General / Unassigned'}
                            </h2>
                            <p className="text-xs text-slate-500">
                              {block
                                ? `${block.areaHa} ha · ${block.cultivar}`
                                : 'Farm-wide'}
                              {' · '}
                              {blockEvents.length} {blockEvents.length === 1 ? 'entry' : 'entries'}
                            </p>
                          </div>
                        </div>

                        <div className="relative ml-6 pl-10 border-l border-slate-200 space-y-8">
                          {blockEvents.map((event) => (
                            <div key={event.id} className="relative group">
                              {/* Date Indicator on the line */}
                              <div className="absolute -left-[45px] top-4 w-2 h-2 rounded-full bg-slate-300 border-2 border-white z-10 group-hover:bg-slate-900 group-hover:scale-125 transition-all" />
                              
                              <div className="mb-2">
                                <span className="font-serif italic text-xs text-slate-500">
                                  {new Date(event.date).toLocaleDateString('en-US', { 
                                    weekday: 'short', 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              </div>

                              {/* Content Card */}
                              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 group-hover:border-slate-300">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-1 rounded">
                                    {new Date(event.date + 'T12:00:00').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) === '12:00 PM' ? 'Daily Entry' : 'Timed Entry'}
                                  </span>
                                  
                                  <div className="flex items-center gap-1">
                                    <AnimatePresence mode="wait">
                                      {deleteConfirmId === event.id ? (
                                        <motion.div 
                                          initial={{ opacity: 0, x: 10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          exit={{ opacity: 0, x: 10 }}
                                          className="flex items-center gap-2"
                                        >
                                          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Confirm?</span>
                                          <button 
                                            onClick={() => {
                                              if (
                                                event.type === 'work' &&
                                                (event.status ?? 'planned') === 'planned' &&
                                                event.linkedIssueId
                                              ) {
                                                reopenLinkedIssue(event.linkedIssueId);
                                              }
                                              removeEvent(event.id);
                                              setDeleteConfirmId(null);
                                            }}
                                            className="p-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button 
                                            onClick={() => setDeleteConfirmId(null)}
                                            className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </motion.div>
                                      ) : (
                                        canEdit && (
                                          <button 
                                            onClick={() => setDeleteConfirmId(event.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        )
                                      )}
                                    </AnimatePresence>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-bold text-lg text-slate-900 tracking-tight">
                                    {event.type === 'spray'
                                      ? (event.agentName ? `Applied ${event.agentName}` : `${event.sprayType} application`)
                                      : event.type === 'irrigation'
                                        ? 'Irrigation Event'
                                        : event.type === 'nutrition'
                                          ? (event.productName ? `Applied ${event.productName}` : 'Nutrition application')
                                          : (event.title || 'Planned work')}
                                  </h3>
                                  {event.type === 'work' && (
                                    <span
                                      className={cn(
                                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                                        (event.status ?? 'planned') === 'planned'
                                          ? 'bg-amber-100 text-amber-800'
                                          : (event.status ?? 'done') === 'cancelled'
                                            ? 'bg-slate-100 text-slate-500'
                                            : 'bg-emerald-100 text-emerald-800'
                                      )}
                                    >
                                      {(event.status ?? 'planned') === 'planned' ? 'Plan' : event.status ?? 'done'}
                                    </span>
                                  )}
                                </div>

                                {event.type === 'work' && (
                                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                                      {event.assignedToName && (
                                        <span>
                                          Assigned: <strong className="text-slate-900">{event.assignedToName}</strong>
                                        </span>
                                      )}
                                      {event.priority && (
                                        <span className="capitalize">
                                          Priority: <strong className="text-slate-900">{event.priority}</strong>
                                        </span>
                                      )}
                                      {event.safetyChecklistAccepted && (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                          <ShieldCheck className="w-3.5 h-3.5" />
                                          Safety accepted
                                        </span>
                                      )}
                                      {event.linkedIssueId && (
                                        <Link
                                          to={`/map?issue=${encodeURIComponent(event.linkedIssueId)}`}
                                          className="inline-flex items-center gap-1 text-amber-700 font-medium hover:underline"
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          View on map
                                        </Link>
                                      )}
                                    </div>
                                    {event.notes && (
                                      <p className="text-sm text-slate-600">{event.notes}</p>
                                    )}
                                    {canEdit && (event.status ?? 'planned') === 'planned' && (
                                      <div className="flex flex-wrap gap-2">
                                        {!event.safetyChecklistAccepted ? (
                                          <button
                                            type="button"
                                            onClick={() => setSafetyForEventId(event.id)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-emerald-700"
                                          >
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            Accept & start
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              updateEvent(event.id, {
                                                status: 'done',
                                                completedAt: new Date().toISOString(),
                                              });
                                              if (event.linkedIssueId) {
                                                resolveLinkedIssue(event.linkedIssueId);
                                              }
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800"
                                          >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Mark done
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateEvent(event.id, { status: 'cancelled' });
                                            if (event.linkedIssueId) {
                                              reopenLinkedIssue(event.linkedIssueId);
                                            }
                                          }}
                                          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                                        >
                                          Cancel plan
                                        </button>
                                        {event.linkedIssueId && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const issueId = event.linkedIssueId!;
                                              updateEvent(event.id, { linkedIssueId: undefined });
                                              reopenLinkedIssue(issueId);
                                            }}
                                            className="px-3 py-2 rounded-xl border border-amber-200 text-xs font-bold uppercase tracking-wider text-amber-800 hover:bg-amber-50"
                                          >
                                            Unlink issue
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {event.type === 'irrigation' && (
                                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-baseline gap-4">
                                    <span className="font-mono text-3xl font-bold tracking-tighter text-blue-600">
                                      {event.irrigationAmount}
                                      <span className="text-[10px] ml-1.5 font-bold text-slate-400 uppercase tracking-widest">mm depth</span>
                                    </span>
                                    {event.durationMinutes && (
                                      <span className="text-xs font-medium text-slate-500">
                                        {event.durationMinutes} mins
                                      </span>
                                    )}
                                  </div>
                                )}

                                {event.type === 'nutrition' && (
                                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                                    <div className="flex flex-wrap items-baseline gap-3">
                                      {event.rate != null && (
                                        <span className="font-mono text-2xl font-bold tracking-tighter text-emerald-600">
                                          {event.rate}
                                          <span className="text-[10px] ml-1.5 font-bold text-slate-400 uppercase tracking-widest">
                                            {event.rateUnit || ''}
                                          </span>
                                        </span>
                                      )}
                                      {(event.nRate != null || event.pRate != null || event.kRate != null) && (
                                        <span className="text-xs font-medium text-slate-600">
                                          {[
                                            event.nRate != null ? `N ${event.nRate}` : null,
                                            event.pRate != null ? `P ${event.pRate}` : null,
                                            event.kRate != null ? `K ${event.kRate}` : null,
                                          ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                          <span className="text-slate-400 ml-1">kg/ha</span>
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {event.nutritionMethod && (
                                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-emerald-50 border-emerald-100 text-emerald-700">
                                          {event.nutritionMethod}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {event.type === 'spray' && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <span className={cn(
                                      "px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border",
                                      event.sprayType === 'chem' 
                                        ? "bg-orange-50 border-orange-100 text-orange-600" 
                                        : "bg-emerald-50 border-emerald-100 text-emerald-600"
                                    )}>
                                      {event.sprayType === 'chem' ? 'Synthetic Agent' : 'Biological Agent'}
                                    </span>
                                    {event.applicationMethod && (
                                      <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-slate-50 border-slate-200 text-slate-600">
                                        {event.applicationMethod === 'ground' ? 'Ground Sprayer' :
                                         event.applicationMethod === 'drone' ? 'Drone' :
                                         event.applicationMethod === 'helicopter' ? 'Helicopter' : 'Aeroplane'}
                                      </span>
                                    )}
                                    {event.carrier && (
                                      <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-blue-50 border-blue-100 text-blue-600">
                                        Carrier: {event.carrier}
                                      </span>
                                    )}
                                    {event.adjuvant && event.adjuvant !== 'None' && (
                                      <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-purple-50 border-purple-100 text-purple-600">
                                        Adjuvant: {event.adjuvant}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {event.notes && event.type !== 'work' && (
                                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                      {event.notes}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {hasMore && (
                <div className="ml-16 mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {isLoadingMore ? 'Loading...' : 'Load older events'}
                  </button>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </div>

      {farmId && safetyForEventId && (
        <SafetyAcceptModal
          farmId={farmId}
          title="Safety checklist"
          subtitle="Confirm required checks before starting this planned work."
          confirmLabel="Accept & start"
          onCancel={() => setSafetyForEventId(null)}
          onConfirm={() => {
            updateEvent(safetyForEventId, {
              safetyChecklistAccepted: true,
              acceptedAt: new Date().toISOString(),
            });
            setSafetyForEventId(null);
          }}
        />
      )}
    </div>
  );
}
