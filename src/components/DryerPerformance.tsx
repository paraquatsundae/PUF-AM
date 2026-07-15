import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Maximize2, X, Save, TrendingDown, Clock, CheckCircle2, AlertCircle, Download, Thermometer } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Scatter, ResponsiveContainer, ReferenceLine } from 'recharts';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, setDoc, deleteDoc, doc, Timestamp, getDocs } from 'firebase/firestore';
import { useAuth, OperationType, handleFirestoreError } from '../contexts/AuthContext';
import { calculateDryingPrediction, DryingSession, MoistureReading } from '../lib/dryingModel';
import { FarmDryer, getFarmAssets } from '../lib/farmAssets';
import { apiUrl } from '../lib/apiBase';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface DryerPerformanceProps {
  blocks: { id: string; name: string; cultivar: string }[];
}

export function DryerPerformance({ blocks }: DryerPerformanceProps) {
  const { userData, user } = useAuth();
  const [sessions, setSessions] = useState<DryingSession[]>([]);
  const [dryers, setDryers] = useState<FarmDryer[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showAddSession, setShowAddSession] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DryingSession | null>(null);
  
  // Forms
  const [newSessionData, setNewSessionData] = useState({
    dryerId: '',
    blockId: '',
    targetMoisture: 4.0,
    initialMoisture: '',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm")
  });

  const [newReadingData, setNewReadingData] = useState({
    moisture: '',
    time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    note: ''
  });
  
  const [editingReadingIndex, setEditingReadingIndex] = useState<number | null>(null);
  const [editReadingData, setEditReadingData] = useState({ moisture: '', time: '', note: '' });

  useEffect(() => {
    if (!userData?.farmId) return;

    const sessionQuery = query(
      collection(db, 'farms', userData.farmId, 'drying_sessions'),
      orderBy('startTime', 'desc')
    );

    const unsubscribe = onSnapshot(sessionQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DryingSession[];
      setSessions(data);
      setLoading(false);
      
      // Update selected session if open
      if (selectedSession) {
        const updated = data.find(s => s.id === selectedSession.id);
        if (updated) setSelectedSession(updated);
      }
    }, (error) => {
      console.error("Error fetching drying sessions:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userData?.farmId, selectedSession?.id]);

  useEffect(() => {
    if (!userData?.farmId) return;
    let cancelled = false;
    getFarmAssets(userData.farmId).then((assets) => {
      if (!cancelled) {
        setDryers(assets.dryers);
        if (assets.dryers.length > 0) {
          setNewSessionData((prev) =>
            prev.dryerId ? prev : { ...prev, dryerId: assets.dryers[0].id }
          );
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userData?.farmId]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !user) return;

    const dryer = dryers.find((d) => d.id === newSessionData.dryerId);
    if (!dryer) {
      alert('Select a dryer. Add dryers under Farm setup if the list is empty.');
      return;
    }

    try {
      const sessionRef = doc(collection(db, 'farms', userData.farmId, 'drying_sessions'));
      const now = new Date(newSessionData.startTime).toISOString();
      const initialMoisture = parseFloat(newSessionData.initialMoisture);
      
      const newSession: Record<string, unknown> = {
        id: sessionRef.id,
        binNumber: dryer.name,
        dryerId: dryer.id,
        status: 'active',
        targetMoisture: Number(newSessionData.targetMoisture) || 4.0,
        startTime: now,
        readings: initialMoisture > 0 ? [{
          time: now,
          moisture: initialMoisture
        }] : []
      };
      if (newSessionData.blockId) {
        newSession.blockId = newSessionData.blockId;
      }

      await setDoc(sessionRef, newSession);
      setShowAddSession(false);
      setNewSessionData({
        dryerId: dryers[0]?.id || '',
        blockId: '',
        targetMoisture: 4.0,
        initialMoisture: '',
        startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `farms/${userData.farmId}/drying_sessions`);
    }
  };

  const handleAddReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !selectedSession) return;

    try {
      const moisture = parseFloat(newReadingData.moisture);
      if (isNaN(moisture) || moisture <= 0) return;

      const readingTime = new Date(newReadingData.time).toISOString();
      
      const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
      
      const updatedReadings = [...selectedSession.readings, { time: readingTime, moisture, note: newReadingData.note }];
      
      // Auto-complete if they enter a reading below target
      let status = selectedSession.status;
      if (moisture <= selectedSession.targetMoisture) {
        status = 'completed';
      }

      await setDoc(sessionRef, { 
        readings: updatedReadings,
        status
      }, { merge: true });

      setNewReadingData({ moisture: '', time: format(new Date(), "yyyy-MM-dd'T'HH:mm"), note: '' });
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `farms/${userData.farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleMarkComplete = async () => {
     if (!userData?.farmId || !selectedSession) return;
     try {
       const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
       await setDoc(sessionRef, { status: 'completed' }, { merge: true });
     } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `farms/${userData.farmId}/drying_sessions`);
     }
  };

  const handleUpdateReading = async (index: number) => {
    if (!userData?.farmId || !selectedSession) return;
    try {
      const moisture = parseFloat(editReadingData.moisture);
      if (isNaN(moisture) || moisture <= 0) return;

      const readingTime = new Date(editReadingData.time).toISOString();
      const updatedReadings = [...selectedSession.readings];
      
      // Update existing or sort to find correct? We'll update the specific one based on index from sorted list
      // Wait, index is on sorted list. So we find the original reading to update.
      const sortedReadings = [...selectedSession.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const originalReading = sortedReadings[index];
      const originalIndex = selectedSession.readings.findIndex(r => r.time === originalReading.time && r.moisture === originalReading.moisture);
      
      if (originalIndex !== -1) {
        updatedReadings[originalIndex] = { time: readingTime, moisture, note: editReadingData.note };
        
        let status = selectedSession.status;
        if (moisture <= selectedSession.targetMoisture && selectedSession.status === 'active') {
          status = 'completed';
        }

        const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
        await setDoc(sessionRef, { readings: updatedReadings, status }, { merge: true });
        setEditingReadingIndex(null);
      }
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `farms/${userData.farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleDeleteReading = async (index: number) => {
    if (!userData?.farmId || !selectedSession) return;
    if (!window.confirm("Delete this reading?")) return;
    try {
      const sortedReadings = [...selectedSession.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const originalReading = sortedReadings[index];
      const updatedReadings = selectedSession.readings.filter(r => !(r.time === originalReading.time && r.moisture === originalReading.moisture));
      
      const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
      await setDoc(sessionRef, { readings: updatedReadings }, { merge: true });
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `farms/${userData.farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleDeleteSession = async (id: string) => {
     if (!userData?.farmId || !window.confirm('Are you sure you want to delete this drying session?')) return;
     try {
       await deleteDoc(doc(db, 'farms', userData.farmId, 'drying_sessions', id));
       if (selectedSession?.id === id) setSelectedSession(null);
     } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `farms/${userData.farmId}/drying_sessions`);
     }
  };

  const [isExporting, setIsExporting] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'moisture' | 'temperature'>('moisture');
  const [ambientTemperatures, setAmbientTemperatures] = useState<{ time: string, temperature: number }[]>([]);
  const [fetchingAmbient, setFetchingAmbient] = useState(false);

  const [newTempReadingData, setNewTempReadingData] = useState({
    temperature: '',
    time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    note: ''
  });
  
  const [editingTempIndex, setEditingTempIndex] = useState<number | null>(null);
  const [editTempData, setEditTempData] = useState({ temperature: '', time: '', note: '' });

  useEffect(() => {
    if (!selectedSession || activeModalTab !== 'temperature' || !userData?.farmId) return;
    
    let isSubscribed = true;
    const fetchAmbientHourly = async () => {
      try {
        setFetchingAmbient(true);
        // Default to a known station in Manjimup if no default set, or we can fetch the user's setting.
        // For simplicity, we use Manjimup (stationCode: MA002) as fallback just like blight model.
        let stationCode = 'MA002'; // Manjimup
        
        // Let's get the start time (UTC) and end time (now or last reading)
        const start = new Date(selectedSession.startTime);
        let end = new Date();
        if (selectedSession.status === 'completed' && selectedSession.readings.length > 0) {
          const sorted = [...selectedSession.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());
          end = new Date(sorted[0].time);
        }

        const url = apiUrl(
          `/api/weather/dpird/stations/summaries/hourly?startDateTime=${start.toISOString().split('.')[0]}Z&endDateTime=${end.toISOString().split('.')[0]}Z&stationCode=${stationCode}`
        );

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch hourly weather");
        const json = await response.json();
        
        if (isSubscribed && json.collection && json.collection.length > 0) {
          const summaries = json.collection[0].summaries || [];
          const pts = summaries.map((s: any) => ({
            time: s.period.to,
            temperature: s.airTemperature?.avg ?? null
          })).filter((s: any) => s.temperature !== null);
          setAmbientTemperatures(pts);
        }
      } catch (err) {
        console.error("Error fetching ambient temp hourly:", err);
      } finally {
        if (isSubscribed) setFetchingAmbient(false);
      }
    };

    fetchAmbientHourly();

    return () => { isSubscribed = false; };
  }, [selectedSession?.id, activeModalTab, userData?.farmId]);

  const handleAddTempReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !selectedSession) return;

    try {
      const temperature = parseFloat(newTempReadingData.temperature);
      if (isNaN(temperature)) return;

      const readingTime = new Date(newTempReadingData.time).toISOString();
      const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
      const updatedTemps = [...(selectedSession.temperatureReadings || []), { time: readingTime, temperature, note: newTempReadingData.note }];
      
      await setDoc(sessionRef, { 
        temperatureReadings: updatedTemps
      }, { merge: true });

      setNewTempReadingData({ temperature: '', time: format(new Date(), "yyyy-MM-dd'T'HH:mm"), note: '' });
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `farms/${userData.farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleUpdateTempReading = async (index: number) => {
    if (!userData?.farmId || !selectedSession || !selectedSession.temperatureReadings) return;
    try {
      const temperature = parseFloat(editTempData.temperature);
      if (isNaN(temperature)) return;

      const readingTime = new Date(editTempData.time).toISOString();
      const updatedTemps = [...selectedSession.temperatureReadings];
      
      const sortedTemps = [...selectedSession.temperatureReadings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const originalReading = sortedTemps[index];
      const originalIndex = selectedSession.temperatureReadings.findIndex(r => r.time === originalReading.time && r.temperature === originalReading.temperature);
      
      if (originalIndex !== -1) {
        updatedTemps[originalIndex] = { time: readingTime, temperature, note: editTempData.note };
        
        const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
        await setDoc(sessionRef, { temperatureReadings: updatedTemps }, { merge: true });
        setEditingTempIndex(null);
      }
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `farms/${userData.farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleDeleteTempReading = async (index: number) => {
    if (!userData?.farmId || !selectedSession || !selectedSession.temperatureReadings) return;
    if (!window.confirm("Delete this temperature reading?")) return;
    try {
      const sortedTemps = [...selectedSession.temperatureReadings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const originalReading = sortedTemps[index];
      const updatedTemps = selectedSession.temperatureReadings.filter(r => !(r.time === originalReading.time && r.temperature === originalReading.temperature));
      
      const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
      await setDoc(sessionRef, { temperatureReadings: updatedTemps }, { merge: true });
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `farms/${userData.farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleExportPDF = async () => {
    if (!selectedSession) return;
    const element = document.getElementById('pdf-export-content');
    if (!element) return;
    
    try {
      setIsExporting(true);
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Bin-${selectedSession.binNumber}-Drying-Report.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
      alert("Failed to export PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-slate-100">
          <p className="text-xs text-slate-400 mb-1">{format(p.date, "MMM d, h:mm a")}</p>
          {p.measured !== null && <p className="font-bold text-blue-400">Measured: {p.measured}%</p>}
          {p.fitted !== null && <p className="font-medium text-amber-500">Projected: {p.fitted}%</p>}
          {p.isTarget && <p className="font-bold text-red-500 mt-1">Target Reached!</p>}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 animate-pulse">Loading dryer performance...</div>;
  }

  const activeSessions = sessions.filter(s => s.status === 'active');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Pick a configured dryer, source block, and log moisture over time.
          {dryers.length === 0 && (
            <>
              {' '}
              <Link to="/farm-setup" className="text-emerald-700 font-medium hover:underline">
                Add dryers in Farm setup
              </Link>
              .
            </>
          )}
        </p>
        <button
          onClick={() => setShowAddSession(true)}
          disabled={dryers.length === 0}
          className="flex items-center justify-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          Start drying
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <TrendingDown className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900 mb-1">No drying sessions</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {dryers.length === 0
              ? 'Configure dryers once under Farm setup, then start a session here.'
              : 'Start a session to log moisture readings and predict target time.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
           {/* Active Bins Bento Box */}
           {activeSessions.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Bins
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSessions.map(session => {
                  const prediction = calculateDryingPrediction(session.readings, session.targetMoisture);
                  const lastReading = session.readings.length > 0 
                    ? [...session.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]
                    : null;
                  
                  return (
                    <div 
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="text-2xl font-black text-slate-900">Bin {session.binNumber}</h4>
                          {session.blockId && (
                            <p className="text-sm font-medium text-emerald-600">
                              {blocks.find(b => b.id === session.blockId)?.name || 'Unknown Block'}
                            </p>
                          )}
                        </div>
                        <div className="bg-slate-50 px-3 py-1 rounded-full border border-slate-100 flex flex-col items-end">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</span>
                           <span className="text-sm font-black text-slate-700">{session.targetMoisture.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Moisture</p>
                            <p className="text-3xl font-black text-slate-900">
                              {lastReading ? `${lastReading.moisture.toFixed(1)}%` : '--'}
                            </p>
                          </div>
                          {prediction && (
                            <div className="flex-1 text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Drying Temp</p>
                              <div className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                <TrendingDown className="w-3.5 h-3.5" />
                                <span className="text-sm font-bold">Good</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                          {prediction ? (
                            <div className="flex items-start gap-3">
                              <Clock className={`w-5 h-5 shrink-0 mt-0.5 ${isPast(prediction.targetDate) ? 'text-rose-500' : 'text-amber-500'}`} />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Estimated Completion</p>
                                <p className="text-sm font-bold text-slate-900">
                                  {format(prediction.targetDate, "h:mm a, MMM d")}
                                </p>
                                <p className={`text-xs font-medium ${isPast(prediction.targetDate) ? 'text-rose-600' : 'text-amber-600'}`}>
                                  {isPast(prediction.targetDate) ? 'Overdue - Check Bin!' : `In ${formatDistanceToNow(prediction.targetDate)}`}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3 opacity-50">
                              <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Estimated Completion</p>
                                <p className="text-xs font-medium text-slate-500">Need at least 2 readings...</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
           )}

           {/* Completed History */}
           {completedSessions.length > 0 && (
             <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
                  Completed Sessions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {completedSessions.map(session => {
                    const lastReading = session.readings.length > 0 
                      ? [...session.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]
                      : null;
                    return (
                      <div 
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-slate-900">Bin {session.binNumber}</p>
                          <p className="text-xs text-slate-500">{format(new Date(session.startTime), 'MMM d, yyyy')}</p>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="font-black text-slate-700">{lastReading?.moisture.toFixed(1)}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
             </div>
           )}
        </div>
      )}

      {/* Start Session Modal */}
      <AnimatePresence>
        {showAddSession && (
          <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddSession(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
               <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <h2 className="text-lg font-bold text-slate-900">Start Drying Target</h2>
                  <button onClick={() => setShowAddSession(false)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
               </div>
               <form onSubmit={handleStartSession} className="p-5 space-y-4">
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Dryer</label>
                   <select
                     required
                     value={newSessionData.dryerId}
                     onChange={e => setNewSessionData({...newSessionData, dryerId: e.target.value})}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                   >
                      {dryers.length === 0 && <option value="">No dryers configured</option>}
                      {dryers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}{d.capacityKg ? ` (${d.capacityKg} kg)` : ''}
                        </option>
                      ))}
                   </select>
                   {dryers.length === 0 && (
                     <p className="text-[11px] text-slate-500">
                       <Link to="/farm-setup" className="text-emerald-700 font-medium hover:underline">Farm setup</Link>
                       {' '}→ add dryers first.
                     </p>
                   )}
                 </div>
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Start Time</label>
                   <input
                     type="datetime-local"
                     required
                     value={newSessionData.startTime}
                     onChange={e => setNewSessionData({...newSessionData, startTime: e.target.value})}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-500 uppercase">Source Block</label>
                   <select
                     value={newSessionData.blockId}
                     onChange={e => setNewSessionData({...newSessionData, blockId: e.target.value})}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                   >
                      <option value="">Select block…</option>
                      {blocks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.cultivar ? ` (${b.cultivar})` : ''}</option>
                      ))}
                   </select>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Target %</label>
                     <input
                       type="number"
                       step="0.1"
                       required
                       value={newSessionData.targetMoisture}
                       onChange={e => setNewSessionData({...newSessionData, targetMoisture: parseFloat(e.target.value)})}
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Initial %</label>
                     <input
                       type="number"
                       step="0.1"
                       placeholder="Optional"
                       value={newSessionData.initialMoisture}
                       onChange={e => setNewSessionData({...newSessionData, initialMoisture: e.target.value})}
                       className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                     />
                   </div>
                 </div>
                 <button
                   type="submit"
                   disabled={dryers.length === 0}
                   className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors mt-2 disabled:opacity-40"
                 >
                   Start drying
                 </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Chart Modal */}
      <AnimatePresence>
        {selectedSession && (
          <div className="fixed inset-0 z-[6000] flex justify-end p-0 sm:p-4">
             <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSession(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full sm:w-[600px] h-full bg-white sm:rounded-2xl shadow-2xl flex flex-col"
            >
              <div className="flex-none p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Bin {selectedSession.binNumber}</h2>
                  {selectedSession.blockId && (
                    <p className="text-sm font-medium text-slate-500">
                      {blocks.find(b => b.id === selectedSession.blockId)?.name || 'Unknown Block'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {isExporting ? 'Exporting...' : 'Export'}
                  </button>
                  {selectedSession.status === 'active' && (
                     <button
                     onClick={handleMarkComplete}
                     className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                   >
                     Mark Complete
                   </button>
                  )}
                  <button onClick={() => setSelectedSession(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="px-6 pt-4 border-b border-slate-100 flex space-x-4">
                <button
                  onClick={() => setActiveModalTab('moisture')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-all ${
                    activeModalTab === 'moisture'
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Moisture Tracking
                </button>
                <button
                  onClick={() => setActiveModalTab('temperature')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                    activeModalTab === 'temperature'
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Thermometer className="w-4 h-4" />
                  Temperature Profile
                </button>
              </div>

              <div id="pdf-export-content" className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                 {/* General Comments */}
                 <div className="mb-2">
                   <h3 className="text-sm font-bold text-slate-900 mb-2">General Comments</h3>
                   <textarea
                     value={selectedSession.generalComments || ''}
                     onChange={async (e) => {
                       const text = e.target.value;
                       setSelectedSession({ ...selectedSession, generalComments: text });
                       if (userData?.farmId) {
                         const sessionRef = doc(db, 'farms', userData.farmId, 'drying_sessions', selectedSession.id);
                         await setDoc(sessionRef, { generalComments: text }, { merge: true });
                       }
                     }}
                     placeholder="Add any general notes for this bin..."
                     disabled={selectedSession.status !== 'active'}
                     className="w-full text-sm p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none min-h-[80px]"
                   />
                 </div>

                 {activeModalTab === 'moisture' ? (
                   <>
                     {/* Chart */}
                     <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">Drying Curve - Target {selectedSession.targetMoisture}%</h3>
                        <div className="h-[300px] w-full border border-slate-100 rounded-xl p-2 bg-slate-50">
                      {(() => {
                         const prediction = calculateDryingPrediction(selectedSession.readings, selectedSession.targetMoisture);
                         
                         // If no prediction, just plot raw points
                         let data = prediction?.plotData || selectedSession.readings.map(r => ({
                           hours: (new Date(r.time).getTime() - new Date(selectedSession.startTime).getTime()) / (1000 * 60 * 60),
                           measured: r.moisture,
                           date: new Date(r.time)
                         }));

                         if (data.length === 0) {
                           return <div className="h-full flex items-center justify-center text-slate-400 text-sm">No readings yet.</div>;
                         }

                         return (
                           <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis 
                                  dataKey="hours" 
                                  type="number" 
                                  domain={['dataMin', 'dataMax']}
                                  tickFormatter={(v) => `${v.toFixed(0)}h`}
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                                  label={{ value: 'Time (hours from start)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12 }}
                                />
                                <YAxis 
                                  domain={['auto', 'auto']}
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(v) => `${v}%`}
                                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                                  label={{ value: 'Moisture (%)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <ReferenceLine y={selectedSession.targetMoisture} stroke="#10b981" strokeDasharray="3 3" />
                                
                                {prediction && (
                                  <Line 
                                    type="monotone" 
                                    dataKey="fitted" 
                                    stroke="#f59e0b" 
                                    strokeWidth={2} 
                                    dot={false} 
                                    isAnimationActive={false}
                                  />
                                )}
                                
                                <Scatter dataKey="measured" fill="#3b82f6" shape="circle" isAnimationActive={false} />
                                <Scatter dataKey="targetY" fill="#ef4444" shape="star" isAnimationActive={false} />
                              </ComposedChart>
                           </ResponsiveContainer>
                         );
                      })()}
                    </div>
                 </div>

                 {/* Readings Log & Form */}
                 <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
                      Reading Log
                      {selectedSession.status === 'active' && (
                        <span className="text-xs font-normal text-slate-500">Latest reading adjusts curve</span>
                      )}
                    </h3>

                     {selectedSession.status === 'active' && (
                      <form onSubmit={handleAddReading} className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 flex flex-col gap-3">
                         <div className="flex items-end gap-3">
                           <div className="flex-1">
                             <label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1 block">Time</label>
                             <input
                               type="datetime-local"
                               required
                               value={newReadingData.time}
                               onChange={e => setNewReadingData({...newReadingData, time: e.target.value})}
                               className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                             />
                           </div>
                           <div className="flex-1">
                             <label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1 block">Moisture %</label>
                             <input
                               type="number"
                               step="0.1"
                               required
                               placeholder="e.g. 11.2"
                               value={newReadingData.moisture}
                               onChange={e => setNewReadingData({...newReadingData, moisture: e.target.value})}
                               className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                             />
                           </div>
                         </div>
                         <div className="flex items-end gap-3">
                           <div className="flex-1">
                             <label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1 block">Operator Note (Optional)</label>
                             <input
                               type="text"
                               placeholder="e.g. Closed vent on bin 2..."
                               value={newReadingData.note}
                               onChange={e => setNewReadingData({...newReadingData, note: e.target.value})}
                               className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                             />
                           </div>
                           <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors h-[38px]">
                             Add
                           </button>
                         </div>
                      </form>
                    )}

                    <div className="space-y-2">
                       {[...selectedSession.readings].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((r, i) => (
                         <div key={i} className="flex flex-col sm:flex-row sm:items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 gap-2">
                           {editingReadingIndex === i ? (
                              <div className="flex-1 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="datetime-local" 
                                    className="flex-1 p-1.5 border border-slate-200 rounded text-sm w-full"
                                    value={editReadingData.time}
                                    onChange={e => setEditReadingData({...editReadingData, time: e.target.value})}
                                  />
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    className="w-20 p-1.5 border border-slate-200 rounded text-sm"
                                    value={editReadingData.moisture}
                                    onChange={e => setEditReadingData({...editReadingData, moisture: e.target.value})}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Note"
                                    className="flex-1 p-1.5 border border-slate-200 rounded text-sm"
                                    value={editReadingData.note}
                                    onChange={e => setEditReadingData({...editReadingData, note: e.target.value})}
                                  />
                                  <button onClick={() => handleUpdateReading(i)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Save className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingReadingIndex(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                                </div>
                              </div>
                           ) : (
                             <>
                               <div className="flex-1">
                                 <span className="text-sm text-slate-500 font-medium block">{format(new Date(r.time), "MMM d, yyyy - h:mm a")}</span>
                                 {r.note && <span className="text-sm text-slate-600 italic block mt-1">{r.note}</span>}
                               </div>
                               <div className="flex items-start sm:items-center gap-4 mt-2 sm:mt-0">
                                 <span className="font-bold text-slate-900 text-lg">{r.moisture}%</span>
                                 {selectedSession.status === 'active' && (
                                   <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                                     <button 
                                       onClick={() => {
                                         setEditReadingData({ time: format(new Date(r.time), "yyyy-MM-dd'T'HH:mm"), moisture: r.moisture.toString(), note: r.note || '' });
                                         setEditingReadingIndex(i);
                                       }} 
                                       className="text-xs text-blue-600 hover:underline"
                                     >Edit</button>
                                     <span className="text-slate-300">|</span>
                                     <button onClick={() => handleDeleteReading(i)} className="text-xs text-rose-600 hover:underline">Delete</button>
                                   </div>
                                 )}
                               </div>
                             </>
                           )}
                         </div>
                       ))}
                       {selectedSession.readings.length === 0 && (
                         <p className="text-sm text-slate-400 text-center py-4">No readings recorded yet.</p>
                       )}
                    </div>
                 </div>
                 </>
                 ) : (
                   <div className="space-y-8">
                     {/* Temperature Chart */}
                     <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">Temperature Profile (°C)</h3>
                        <div className="h-[300px] w-full border border-slate-100 rounded-xl p-2 bg-slate-50">
                          {(() => {
                            const dataMap = new Map();
                            
                            ambientTemperatures.forEach(t => {
                              dataMap.set(t.time, { time: new Date(t.time), ambient: t.temperature });
                            });
                            
                            (selectedSession.temperatureReadings || []).forEach(r => {
                              // Find closest hour or exact match, simplify by just putting it in the map
                              // We can just rely on the time as key if we round it, but let's just use raw ISO string for sort
                              const existing = dataMap.get(r.time) || { time: new Date(r.time) };
                              dataMap.set(r.time, { ...existing, bin: r.temperature });
                            });

                            const data = Array.from(dataMap.values())
                              .sort((a,b) => a.time.getTime() - b.time.getTime())
                              .map(d => ({
                                ...d,
                                hours: (d.time.getTime() - new Date(selectedSession.startTime).getTime()) / (1000 * 60 * 60)
                              }));

                            if (data.length === 0 && fetchingAmbient) {
                              return <div className="h-full flex items-center justify-center text-slate-400 text-sm">Fetching ambient temperatures...</div>;
                            } else if (data.length === 0) {
                              return <div className="h-full flex items-center justify-center text-slate-400 text-sm">No temperature data available.</div>;
                            }

                            return (
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                  <XAxis 
                                    dataKey="hours" 
                                    type="number" 
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={(v) => `${v.toFixed(0)}h`}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    label={{ value: 'Time (hours from start)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12 }}
                                  />
                                  <YAxis 
                                    domain={['auto', 'auto']}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => `${v}°`}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                                  />
                                  <Tooltip 
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const p = payload[0].payload;
                                        return (
                                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-slate-100">
                                            <p className="text-xs text-slate-400 mb-1">{format(p.time, "MMM d, h:mm a")}</p>
                                            {p.ambient !== undefined && <p className="font-medium text-slate-300">Ambient: {p.ambient}°C</p>}
                                            {p.bin !== undefined && <p className="font-bold text-orange-400">Bin Temp: {p.bin}°C</p>}
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Line type="monotone" dataKey="ambient" stroke="#94a3b8" strokeWidth={2} dot={false} name="Ambient Temp" isAnimationActive={false} />
                                  <Scatter dataKey="bin" fill="#f97316" shape="circle" name="Bin Temp" isAnimationActive={false} />
                                  <Line type="stepAfter" dataKey="bin" stroke="#f97316" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
                                </ComposedChart>
                              </ResponsiveContainer>
                            );
                          })()}
                        </div>
                     </div>

                     {/* Temperature Log & Form */}
                     <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">Bin Temperature Log</h3>
                        {selectedSession.status === 'active' && (
                          <form onSubmit={handleAddTempReading} className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-4 flex flex-col gap-3">
                             <div className="flex items-end gap-3">
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-orange-800 uppercase tracking-wider mb-1 block">Time</label>
                                 <input
                                   type="datetime-local"
                                   required
                                   value={newTempReadingData.time}
                                   onChange={e => setNewTempReadingData({...newTempReadingData, time: e.target.value})}
                                   className="w-full p-2 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                 />
                               </div>
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-orange-800 uppercase tracking-wider mb-1 block">Temperature (°C)</label>
                                 <input
                                   type="number"
                                   step="0.1"
                                   required
                                   placeholder="e.g. 38.5"
                                   value={newTempReadingData.temperature}
                                   onChange={e => setNewTempReadingData({...newTempReadingData, temperature: e.target.value})}
                                   className="w-full p-2 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none font-bold"
                                 />
                               </div>
                             </div>
                             <div className="flex items-end gap-3">
                               <div className="flex-1">
                                 <label className="text-[10px] font-bold text-orange-800 uppercase tracking-wider mb-1 block">Operator Note (Optional)</label>
                                 <input
                                   type="text"
                                   placeholder="e.g. Adjusted heating element..."
                                   value={newTempReadingData.note}
                                   onChange={e => setNewTempReadingData({...newTempReadingData, note: e.target.value})}
                                   className="w-full p-2 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                 />
                               </div>
                               <button type="submit" className="px-4 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition-colors h-[38px]">
                                 Add
                               </button>
                             </div>
                          </form>
                        )}

                        <div className="space-y-2">
                           {[...(selectedSession.temperatureReadings || [])].sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((r, i) => (
                             <div key={i} className="flex flex-col sm:flex-row sm:items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 gap-2">
                               {editingTempIndex === i ? (
                                  <div className="flex-1 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                      <input 
                                        type="datetime-local" 
                                        className="flex-1 p-1.5 border border-slate-200 rounded text-sm w-full"
                                        value={editTempData.time}
                                        onChange={e => setEditTempData({...editTempData, time: e.target.value})}
                                      />
                                      <input 
                                        type="number" 
                                        step="0.1" 
                                        className="w-20 p-1.5 border border-slate-200 rounded text-sm"
                                        value={editTempData.temperature}
                                        onChange={e => setEditTempData({...editTempData, temperature: e.target.value})}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        placeholder="Note"
                                        className="flex-1 p-1.5 border border-slate-200 rounded text-sm"
                                        value={editTempData.note}
                                        onChange={e => setEditTempData({...editTempData, note: e.target.value})}
                                      />
                                      <button onClick={() => handleUpdateTempReading(i)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Save className="w-4 h-4" /></button>
                                      <button onClick={() => setEditingTempIndex(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
                                    </div>
                                  </div>
                               ) : (
                                 <>
                                   <div className="flex-1">
                                     <span className="text-sm text-slate-500 font-medium block">{format(new Date(r.time), "MMM d, yyyy - h:mm a")}</span>
                                     {r.note && <span className="text-sm text-slate-600 italic block mt-1">{r.note}</span>}
                                   </div>
                                   <div className="flex items-start sm:items-center gap-4 mt-2 sm:mt-0">
                                     <span className="font-bold text-slate-900 text-lg">{r.temperature}°C</span>
                                     {selectedSession.status === 'active' && (
                                       <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                                         <button 
                                           onClick={() => {
                                             setEditTempData({ time: format(new Date(r.time), "yyyy-MM-dd'T'HH:mm"), temperature: r.temperature.toString(), note: r.note || '' });
                                             setEditingTempIndex(i);
                                           }} 
                                           className="text-xs text-blue-600 hover:underline"
                                         >Edit</button>
                                         <span className="text-slate-300">|</span>
                                         <button onClick={() => handleDeleteTempReading(i)} className="text-xs text-rose-600 hover:underline">Delete</button>
                                       </div>
                                     )}
                                   </div>
                                 </>
                               )}
                             </div>
                           ))}
                           {!(selectedSession.temperatureReadings?.length) && (
                             <p className="text-sm text-slate-400 text-center py-4">No bin temperatures recorded yet.</p>
                           )}
                        </div>
                     </div>
                   </div>
                 )}
                 
                 <div className="pt-8 border-t border-slate-100 flex justify-end">
                    <button 
                      onClick={() => handleDeleteSession(selectedSession.id)}
                      className="text-sm text-slate-400 hover:text-rose-600 font-medium transition-colors"
                    >
                      Delete Session
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
