import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface EnergyLog {
  id: string;
  type: string;
  month: string; // YYYY-MM
  volume: number;
  unitCost: number;
  updatedAt: string;
}

const ENERGY_TYPES = ["Electricity", "Gas", "Diesel", "Petrol"];

export function EnergyManager() {
  const { userData } = useAuth();
  const [logs, setLogs] = useState<EnergyLog[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedType, setSelectedType] = useState(ENERGY_TYPES[0]);
  
  const [type, setType] = useState(ENERGY_TYPES[0]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [volume, setVolume] = useState('');
  const [unitCost, setUnitCost] = useState('');

  useEffect(() => {
    if (!userData?.farmId) return;
    const q = query(collection(db, `farms/${userData.farmId}/energy_logs`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EnergyLog)));
    });
    return () => unsubscribe();
  }, [userData?.farmId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId) return;
    const newLog: EnergyLog = {
      id: uuidv4(),
      type,
      month,
      volume: parseFloat(volume),
      unitCost: parseFloat(unitCost),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, `farms/${userData.farmId}/energy_logs`, newLog.id), newLog);
    setIsAdding(false);
    setVolume('');
    setUnitCost('');
  };

  const handleDelete = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this log?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/energy_logs`, id));
    }
  };

  const filteredLogs = logs.filter(l => l.type === selectedType).sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Zap className="w-6 h-6 text-yellow-500" />
          Energy Usage
        </h2>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Log Usage
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {ENERGY_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setSelectedType(t)}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
              selectedType === t 
                ? 'bg-yellow-100 text-yellow-800' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <Zap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No {selectedType.toLowerCase()} logs added yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-500">
                <th className="pb-3 font-medium">Month</th>
                <th className="pb-3 font-medium text-right">Volume</th>
                <th className="pb-3 font-medium text-right">Unit Cost</th>
                <th className="pb-3 font-medium text-right">Total Cost</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-4 text-sm font-medium text-slate-900">{log.month}</td>
                  <td className="py-4 text-sm text-slate-600 text-right">{log.volume.toLocaleString()}</td>
                  <td className="py-4 text-sm text-slate-600 text-right">${log.unitCost.toFixed(2)}</td>
                  <td className="py-4 text-sm font-medium text-slate-900 text-right">${(log.volume * log.unitCost).toFixed(2)}</td>
                  <td className="py-4 text-right">
                    <button 
                      onClick={() => handleDelete(log.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Log Energy Usage</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                >
                  {ENERGY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
                <input
                  type="month"
                  required
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Volume</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  placeholder="e.g., 1500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cost per Unit ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  placeholder="e.g., 1.50"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
