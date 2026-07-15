import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Package, Activity, Scale, Droplet } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface ProcessingLog {
  id: string;
  date: string;
  kilosDried: number;
  kilosCracked: number;
  kilosSorted: number;
  kilosOilKernel: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

interface PackingLog {
  id: string;
  date: string;
  productType: string;
  packetSize: string;
  quantity: number;
  totalKilos: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

const PACKET_SIZES = [
  { label: '250g Pouch', kilos: 0.25 },
  { label: '5kg Bag', kilos: 5 },
  { label: '10kg Carton', kilos: 10 },
  { label: '500ml Bottle', kilos: 0.5 } // Assuming 1L ~ 1kg for simplicity in total weight
];

const PRODUCT_TYPES = ['Shelled', 'Inshell', 'Oil'];

export function ProductionManager() {
  const { userData, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'processing' | 'packing'>('processing');
  
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [packingLogs, setPackingLogs] = useState<PackingLog[]>([]);
  
  const [isAddingProcessing, setIsAddingProcessing] = useState(false);
  const [isAddingPacking, setIsAddingPacking] = useState(false);

  // Processing Form State
  const [procDate, setProcDate] = useState(new Date().toISOString().split('T')[0]);
  const [kilosDried, setKilosDried] = useState('');
  const [kilosCracked, setKilosCracked] = useState('');
  const [kilosSorted, setKilosSorted] = useState('');
  const [kilosOilKernel, setKilosOilKernel] = useState('');
  const [procNotes, setProcNotes] = useState('');

  // Packing Form State
  const [packDate, setPackDate] = useState(new Date().toISOString().split('T')[0]);
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [packetSize, setPacketSize] = useState(PACKET_SIZES[0].label);
  const [quantity, setQuantity] = useState('');
  const [packNotes, setPackNotes] = useState('');

  useEffect(() => {
    if (!userData?.farmId) return;

    const procQuery = query(collection(db, `farms/${userData.farmId}/processing_logs`), orderBy('date', 'desc'));
    const unsubProc = onSnapshot(procQuery, (snapshot) => {
      setProcessingLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcessingLog)));
    });

    const packQuery = query(collection(db, `farms/${userData.farmId}/packing_logs`), orderBy('date', 'desc'));
    const unsubPack = onSnapshot(packQuery, (snapshot) => {
      setPackingLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PackingLog)));
    });

    return () => {
      unsubProc();
      unsubPack();
    };
  }, [userData?.farmId]);

  const handleSaveProcessing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !currentUser) return;

    const logId = uuidv4();
    const logData: ProcessingLog = {
      id: logId,
      date: procDate,
      kilosDried: parseFloat(kilosDried) || 0,
      kilosCracked: parseFloat(kilosCracked) || 0,
      kilosSorted: parseFloat(kilosSorted) || 0,
      kilosOilKernel: parseFloat(kilosOilKernel) || 0,
      notes: procNotes,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.uid
    };

    await setDoc(doc(db, `farms/${userData.farmId}/processing_logs`, logId), logData);
    
    setIsAddingProcessing(false);
    setKilosDried('');
    setKilosCracked('');
    setKilosSorted('');
    setKilosOilKernel('');
    setProcNotes('');
  };

  const handleSavePacking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !currentUser) return;

    const sizeObj = PACKET_SIZES.find(s => s.label === packetSize);
    const qty = parseInt(quantity) || 0;
    const totalKilos = sizeObj ? sizeObj.kilos * qty : 0;

    const logId = uuidv4();
    const logData: PackingLog = {
      id: logId,
      date: packDate,
      productType,
      packetSize,
      quantity: qty,
      totalKilos,
      notes: packNotes,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.uid
    };

    await setDoc(doc(db, `farms/${userData.farmId}/packing_logs`, logId), logData);
    
    setIsAddingPacking(false);
    setQuantity('');
    setPackNotes('');
  };

  const handleDeleteProcessing = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this log?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/processing_logs`, id));
    }
  };

  const handleDeletePacking = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this log?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/packing_logs`, id));
    }
  };

  // Calculate YTD Totals
  const currentYear = new Date().getFullYear().toString();
  
  const ytdProcessing = processingLogs.filter(l => l.date.startsWith(currentYear)).reduce((acc, curr) => ({
    dried: acc.dried + curr.kilosDried,
    cracked: acc.cracked + curr.kilosCracked,
    sorted: acc.sorted + curr.kilosSorted,
    oilKernel: acc.oilKernel + curr.kilosOilKernel
  }), { dried: 0, cracked: 0, sorted: 0, oilKernel: 0 });

  const ytdPacked = packingLogs.filter(l => l.date.startsWith(currentYear)).reduce((acc, curr) => acc + curr.totalKilos, 0);

  const processingYield = ytdProcessing.dried > 0 ? ((ytdProcessing.sorted / ytdProcessing.dried) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-500">YTD Processed (Dried)</h3>
            <Scale className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{ytdProcessing.dried.toLocaleString()} kg</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-500">YTD Premium Sorted</h3>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{ytdProcessing.sorted.toLocaleString()} kg</p>
          <p className="text-xs text-slate-500 mt-1">Yield: {processingYield}%</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-500">YTD Oil Kernel (Rejects)</h3>
            <Droplet className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{ytdProcessing.oilKernel.toLocaleString()} kg</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-500">YTD Total Packed</h3>
            <Package className="w-5 h-5 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{ytdPacked.toLocaleString()} kg</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('processing')}
            className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${
              activeTab === 'processing' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Processing Logs
          </button>
          <button
            onClick={() => setActiveTab('packing')}
            className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${
              activeTab === 'packing' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Packing Logs
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'processing' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900">Daily Processing Log</h2>
                <button 
                  onClick={() => setIsAddingProcessing(true)}
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Log
                </button>
              </div>

              {isAddingProcessing && (
                <form onSubmit={handleSaveProcessing} className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={procDate}
                        onChange={(e) => setProcDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kilos Dried</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={kilosDried}
                        onChange={(e) => setKilosDried(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kilos Cracked</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={kilosCracked}
                        onChange={(e) => setKilosCracked(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kilos Sorted (Premium)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={kilosSorted}
                        onChange={(e) => setKilosSorted(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Oil Kernel (Rejects)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={kilosOilKernel}
                        onChange={(e) => setKilosOilKernel(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      value={procNotes}
                      onChange={(e) => setProcNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="e.g., High moisture content in batch 4"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsAddingProcessing(false)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                    >
                      Save Log
                    </button>
                  </div>
                </form>
              )}

              {processingLogs.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-500">No processing logs found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-sm text-slate-500">
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium text-right">Dried (kg)</th>
                        <th className="pb-3 font-medium text-right">Cracked (kg)</th>
                        <th className="pb-3 font-medium text-right">Sorted (kg)</th>
                        <th className="pb-3 font-medium text-right">Oil Kernel (kg)</th>
                        <th className="pb-3 font-medium">Notes</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processingLogs.map((log) => (
                        <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-4 text-sm text-slate-900">{new Date(log.date).toLocaleDateString()}</td>
                          <td className="py-4 text-sm font-medium text-slate-700 text-right">{log.kilosDried.toLocaleString()}</td>
                          <td className="py-4 text-sm font-medium text-slate-700 text-right">{log.kilosCracked.toLocaleString()}</td>
                          <td className="py-4 text-sm font-medium text-emerald-600 text-right">{log.kilosSorted.toLocaleString()}</td>
                          <td className="py-4 text-sm font-medium text-blue-600 text-right">{log.kilosOilKernel.toLocaleString()}</td>
                          <td className="py-4 text-sm text-slate-500 truncate max-w-xs">{log.notes || '-'}</td>
                          <td className="py-4 text-right">
                            <button 
                              onClick={() => handleDeleteProcessing(log.id)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
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
            </div>
          )}

          {activeTab === 'packing' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900">Daily Packing Log</h2>
                <button 
                  onClick={() => setIsAddingPacking(true)}
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Log
                </button>
              </div>

              {isAddingPacking && (
                <form onSubmit={handleSavePacking} className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={packDate}
                        onChange={(e) => setPackDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Product Type</label>
                      <select
                        value={productType}
                        onChange={(e) => setProductType(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      >
                        {PRODUCT_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Packet Size</label>
                      <select
                        value={packetSize}
                        onChange={(e) => setPacketSize(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      >
                        {PACKET_SIZES.map(size => (
                          <option key={size.label} value={size.label}>{size.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Quantity (Packets)</label>
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      value={packNotes}
                      onChange={(e) => setPackNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsAddingPacking(false)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                    >
                      Save Log
                    </button>
                  </div>
                </form>
              )}

              {packingLogs.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-500">No packing logs found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-sm text-slate-500">
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium">Product</th>
                        <th className="pb-3 font-medium">Size</th>
                        <th className="pb-3 font-medium text-right">Quantity</th>
                        <th className="pb-3 font-medium text-right">Total (kg)</th>
                        <th className="pb-3 font-medium">Notes</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packingLogs.map((log) => (
                        <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-4 text-sm text-slate-900">{new Date(log.date).toLocaleDateString()}</td>
                          <td className="py-4 text-sm font-medium text-slate-700">{log.productType}</td>
                          <td className="py-4 text-sm text-slate-600">{log.packetSize}</td>
                          <td className="py-4 text-sm font-medium text-slate-900 text-right">{log.quantity.toLocaleString()}</td>
                          <td className="py-4 text-sm font-bold text-indigo-600 text-right">{log.totalKilos.toLocaleString()}</td>
                          <td className="py-4 text-sm text-slate-500 truncate max-w-xs">{log.notes || '-'}</td>
                          <td className="py-4 text-right">
                            <button 
                              onClick={() => handleDeletePacking(log.id)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
