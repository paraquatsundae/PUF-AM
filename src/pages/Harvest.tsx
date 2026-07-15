import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tractor, Plus, Trash2, X, ChevronDown, ChevronRight, Weight, Thermometer } from 'lucide-react';
import { useAuth, OperationType, handleFirestoreError } from '../contexts/AuthContext';
import { db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { useMapStore } from '../lib/mapStore';
import { DryerPerformance } from '../components/DryerPerformance';
import { cn } from '../lib/utils';

interface HarvestRecord {
  id: string;
  date: string;
  blockId: string;
  totalWeight: number;
  moistureContent: number;
  qualityGrade: string;
  notes: string;
  blightImpactScore?: number;
  createdAt: string;
  createdBy: string;
}

export function Harvest() {
  const { userData, user } = useAuth();
  const farmId = userData?.farmId;
  const { blocks, loadData, isLoaded } = useMapStore();
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'records' | 'dryer'>('records');
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [logForBlockId, setLogForBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    totalWeight: '',
    moistureContent: '',
    qualityGrade: '',
    notes: '',
  });

  useEffect(() => {
    if (farmId && !isLoaded) void loadData(farmId);
  }, [farmId, isLoaded, loadData]);

  useEffect(() => {
    if (!farmId) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'farms', farmId, 'harvests'), orderBy('date', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setRecords(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as HarvestRecord))
        );
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching harvests:', error);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [farmId]);

  useEffect(() => {
    if (expandedBlockId === null && blocks.length > 0) {
      setExpandedBlockId(blocks[0].id);
    }
  }, [blocks, expandedBlockId]);

  const recordsByBlock = useMemo(() => {
    const map: Record<string, HarvestRecord[]> = {};
    blocks.forEach((b) => {
      map[b.id] = [];
    });
    records.forEach((r) => {
      if (!map[r.blockId]) map[r.blockId] = [];
      map[r.blockId].push(r);
    });
    return map;
  }, [blocks, records]);

  const seasonTotalKg = useMemo(
    () => records.reduce((sum, r) => sum + (r.totalWeight || 0), 0),
    [records]
  );

  const openLog = (blockId: string) => {
    setLogForBlockId(blockId);
    setExpandedBlockId(blockId);
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      totalWeight: '',
      moistureContent: '',
      qualityGrade: '',
      notes: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmId || !user || !logForBlockId) return;

    setSaving(true);
    try {
      const harvestRef = doc(collection(db, 'farms', farmId, 'harvests'));
      const newRecord = {
        id: harvestRef.id,
        date: formData.date,
        blockId: logForBlockId,
        totalWeight: Number(formData.totalWeight),
        moistureContent: Number(formData.moistureContent) || 0,
        qualityGrade: formData.qualityGrade || '',
        notes: formData.notes || '',
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
      };
      await setDoc(harvestRef, newRecord);
      setLogForBlockId(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, `farms/${farmId}/harvests`);
      } catch {
        /* logged */
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!farmId || !window.confirm('Delete this harvest record?')) return;
    try {
      await deleteDoc(doc(db, 'farms', farmId, 'harvests', id));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/harvests/${id}`);
      } catch {
        /* logged */
      }
    }
  };

  const fieldClass =
    'w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400';

  const blockList = blocks.length > 0 ? blocks : [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 pb-24 lg:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Harvest & drying</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Log yield by block. Dryers are configured in{' '}
            <Link to="/farm-setup" className="text-emerald-700 font-medium hover:underline">
              Farm setup
            </Link>
            .
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Season total</p>
          <p className="text-lg font-black text-slate-900 tabular-nums">
            {seasonTotalKg.toLocaleString()} <span className="text-xs font-bold text-slate-400">kg</span>
          </p>
        </div>
      </div>

      <div className="inline-flex w-full sm:w-auto items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
        {(
          [
            { id: 'records' as const, icon: Tractor, title: 'Harvest' },
            { id: 'dryer' as const, icon: Thermometer, title: 'Drying' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <tab.icon className={cn('w-3.5 h-3.5', activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400')} />
            {tab.title}
          </button>
        ))}
      </div>

      {activeTab === 'records' ? (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs text-slate-400 py-8 text-center">Loading harvests…</p>
          ) : blockList.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center space-y-2">
              <p className="text-sm text-slate-600">No blocks yet.</p>
              <p className="text-xs text-slate-400">Draw blocks on the Orchard Map first — each block gets its own harvest folder here.</p>
              <Link
                to="/map"
                className="inline-flex text-xs font-semibold text-emerald-700 hover:underline"
              >
                Open map
              </Link>
            </div>
          ) : (
            blockList.map((block) => {
              const blockRecords = recordsByBlock[block.id] || [];
              const blockKg = blockRecords.reduce((s, r) => s + (r.totalWeight || 0), 0);
              const open = expandedBlockId === block.id;

              return (
                <div key={block.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedBlockId(open ? null : block.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    {open ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate">{block.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {block.cultivar || '—'}
                        {block.areaHa ? ` · ${block.areaHa.toFixed(1)} ha` : ''}
                        {' · '}
                        {blockRecords.length} record{blockRecords.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-slate-900 tabular-nums inline-flex items-center gap-1">
                        <Weight className="w-3 h-3 text-slate-400" />
                        {blockKg.toLocaleString()} kg
                      </p>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 px-3 py-3 space-y-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openLog(block.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Log harvest
                        </button>
                      </div>

                      {blockRecords.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">No harvests logged for this block.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                                <th className="py-1.5 pr-2">Date</th>
                                <th className="py-1.5 pr-2 text-right">kg</th>
                                <th className="py-1.5 pr-2 text-right">Moisture</th>
                                <th className="py-1.5 pr-2">Grade</th>
                                <th className="py-1.5 pr-2 hidden sm:table-cell">Notes</th>
                                <th className="py-1.5 w-8" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {blockRecords.map((r) => (
                                <tr key={r.id} className="text-slate-700">
                                  <td className="py-2 pr-2 font-medium whitespace-nowrap">
                                    {format(new Date(r.date + 'T12:00:00'), 'dd MMM yyyy')}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                                    {r.totalWeight.toLocaleString()}
                                  </td>
                                  <td className="py-2 pr-2 text-right text-slate-500">
                                    {r.moistureContent ? `${r.moistureContent}%` : '—'}
                                  </td>
                                  <td className="py-2 pr-2 truncate max-w-[80px]">{r.qualityGrade || '—'}</td>
                                  <td className="py-2 pr-2 text-slate-400 truncate max-w-[160px] hidden sm:table-cell">
                                    {r.notes || ''}
                                  </td>
                                  <td className="py-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleDelete(r.id)}
                                      className="p-1 text-slate-300 hover:text-rose-600"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Orphan records (block deleted) */}
          {Object.keys(recordsByBlock)
            .filter((id) => !blocks.some((b) => b.id === id) && (recordsByBlock[id]?.length || 0) > 0)
            .map((orphanId) => {
              const orphanRecords = recordsByBlock[orphanId] || [];
              return (
                <div key={orphanId} className="bg-amber-50 rounded-xl border border-amber-100 p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-900">Unknown block ({orphanId.slice(0, 6)}…)</p>
                  {orphanRecords.map((r) => (
                    <div key={r.id} className="flex justify-between text-xs text-amber-800">
                      <span>
                        {format(new Date(r.date + 'T12:00:00'), 'dd MMM')} · {r.totalWeight} kg
                      </span>
                      <button type="button" onClick={() => void handleDelete(r.id)} className="text-rose-600">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      ) : (
        <DryerPerformance
          blocks={blocks.map((b) => ({ id: b.id, name: b.name, cultivar: b.cultivar || '' }))}
        />
      )}

      {logForBlockId && (
        <div className="fixed inset-0 z-[6000] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close"
            onClick={() => setLogForBlockId(null)}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Log harvest</h2>
                <p className="text-[11px] text-slate-500">
                  {blocks.find((b) => b.id === logForBlockId)?.name || 'Block'}
                </p>
              </div>
              <button type="button" onClick={() => setLogForBlockId(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Date</span>
                  <input
                    type="date"
                    required
                    className={fieldClass}
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Weight kg</span>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.1"
                    className={fieldClass}
                    value={formData.totalWeight}
                    onChange={(e) => setFormData({ ...formData, totalWeight: e.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Moisture %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    className={fieldClass}
                    value={formData.moistureContent}
                    onChange={(e) => setFormData({ ...formData, moistureContent: e.target.value })}
                    placeholder="—"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Grade</span>
                  <input
                    type="text"
                    className={fieldClass}
                    value={formData.qualityGrade}
                    onChange={(e) => setFormData({ ...formData, qualityGrade: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Notes</span>
                <input
                  type="text"
                  className={fieldClass}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLogForBlockId(null)}
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
