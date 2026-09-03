import React, { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../../src/firebase';
import { handleFirestoreError, OperationType } from '../../../src/lib/firestoreErrors';
import { apiFetch, apiUrl } from '../../../src/lib/apiBase';
import type { DryingSession } from './dryingModel';
import type { FarmDryer } from '../../../src/lib/farmAssets';
import type { NewSessionForm } from './StartDryingSessionModal';

function nowLocal() {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

export function useDryerSessionActions(
  farmId: string | undefined,
  user: { uid: string } | null | undefined,
  dryers: FarmDryer[],
  sessions: DryingSession[]
) {
  const [showAddSession, setShowAddSession] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DryingSession | null>(null);
  const [newSessionData, setNewSessionData] = useState<NewSessionForm>({
    dryerId: '',
    blockId: '',
    targetMoisture: 4.0,
    initialMoisture: '',
    startTime: nowLocal(),
  });
  const [newReadingData, setNewReadingData] = useState({ moisture: '', time: nowLocal(), note: '' });
  const [editingReadingIndex, setEditingReadingIndex] = useState<number | null>(null);
  const [editReadingData, setEditReadingData] = useState({ moisture: '', time: '', note: '' });
  const [isExporting, setIsExporting] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'moisture' | 'temperature'>('moisture');
  const [ambientTemperatures, setAmbientTemperatures] = useState<{ time: string; temperature: number }[]>([]);
  const [fetchingAmbient, setFetchingAmbient] = useState(false);
  const [newTempReadingData, setNewTempReadingData] = useState({
    temperature: '',
    time: nowLocal(),
    note: '',
  });
  const [editingTempIndex, setEditingTempIndex] = useState<number | null>(null);
  const [editTempData, setEditTempData] = useState({ temperature: '', time: '', note: '' });

  useEffect(() => {
    if (!selectedSession) return;
    const updated = sessions.find((s) => s.id === selectedSession.id);
    if (updated) setSelectedSession(updated);
  }, [sessions, selectedSession?.id]);

  useEffect(() => {
    if (dryers.length === 0) return;
    setNewSessionData((prev) => (prev.dryerId ? prev : { ...prev, dryerId: dryers[0].id }));
  }, [dryers]);

  useEffect(() => {
    if (!selectedSession || activeModalTab !== 'temperature' || !farmId) return;
    let isSubscribed = true;
    const fetchAmbientHourly = async () => {
      try {
        setFetchingAmbient(true);
        const stationCode = 'MA002';
        const start = new Date(selectedSession.startTime);
        let end = new Date();
        if (selectedSession.status === 'completed' && selectedSession.readings.length > 0) {
          const sorted = [...selectedSession.readings].sort(
            (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
          );
          end = new Date(sorted[0].time);
        }
        const url = apiUrl(
          `/api/weather/dpird/stations/summaries/hourly?startDateTime=${start.toISOString().split('.')[0]}Z&endDateTime=${end.toISOString().split('.')[0]}Z&stationCode=${stationCode}`
        );
        const response = await apiFetch(url, { timeoutMs: 60000 });
        if (!response.ok) throw new Error('Failed to fetch hourly weather');
        const json = await response.json();
        if (isSubscribed && json.collection && json.collection.length > 0) {
          const summaries = json.collection[0].summaries || [];
          const pts = summaries
            .map((s: { period?: { to?: string }; airTemperature?: { avg?: number } }) => ({
              time: s.period?.to,
              temperature: s.airTemperature?.avg ?? null,
            }))
            .filter((s: { time?: string; temperature: number | null }) => s.time && s.temperature !== null);
          setAmbientTemperatures(pts);
        }
      } catch (err) {
        console.error('Error fetching ambient temp hourly:', err);
      } finally {
        if (isSubscribed) setFetchingAmbient(false);
      }
    };
    void fetchAmbientHourly();
    return () => {
      isSubscribed = false;
    };
  }, [selectedSession?.id, activeModalTab, farmId]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmId || !user) return;
    const dryer = dryers.find((d) => d.id === newSessionData.dryerId);
    if (!dryer) {
      alert('Select a dryer. Add dryers in the list above if it is empty.');
      return;
    }
    try {
      const sessionRef = doc(collection(db, 'farms', farmId, 'drying_sessions'));
      const now = new Date(newSessionData.startTime).toISOString();
      const initialMoisture = parseFloat(newSessionData.initialMoisture);
      const newSession: Record<string, unknown> = {
        id: sessionRef.id,
        binNumber: dryer.name,
        dryerId: dryer.id,
        status: 'active',
        targetMoisture: Number(newSessionData.targetMoisture) || 4.0,
        startTime: now,
        readings:
          initialMoisture > 0
            ? [{ time: now, moisture: initialMoisture }]
            : [],
      };
      if (newSessionData.blockId) newSession.blockId = newSessionData.blockId;
      await setDoc(sessionRef, newSession);
      setShowAddSession(false);
      setNewSessionData({
        dryerId: dryers[0]?.id || '',
        blockId: '',
        targetMoisture: 4.0,
        initialMoisture: '',
        startTime: nowLocal(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `farms/${farmId}/drying_sessions`);
    }
  };

  const handleAddReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmId || !selectedSession) return;
    try {
      const moisture = parseFloat(newReadingData.moisture);
      if (isNaN(moisture) || moisture <= 0) return;
      const readingTime = new Date(newReadingData.time).toISOString();
      const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
      const updatedReadings = [
        ...selectedSession.readings,
        { time: readingTime, moisture, note: newReadingData.note },
      ];
      let status = selectedSession.status;
      if (moisture <= selectedSession.targetMoisture) status = 'completed';
      await setDoc(sessionRef, { readings: updatedReadings, status }, { merge: true });
      setNewReadingData({ moisture: '', time: nowLocal(), note: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleMarkComplete = async () => {
    if (!farmId || !selectedSession) return;
    try {
      const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
      await setDoc(sessionRef, { status: 'completed' }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/drying_sessions`);
    }
  };

  const handleUpdateReading = async (index: number) => {
    if (!farmId || !selectedSession) return;
    try {
      const moisture = parseFloat(editReadingData.moisture);
      if (isNaN(moisture) || moisture <= 0) return;
      const readingTime = new Date(editReadingData.time).toISOString();
      const updatedReadings = [...selectedSession.readings];
      const sortedReadings = [...selectedSession.readings].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      const originalReading = sortedReadings[index];
      const originalIndex = selectedSession.readings.findIndex(
        (r) => r.time === originalReading.time && r.moisture === originalReading.moisture
      );
      if (originalIndex !== -1) {
        updatedReadings[originalIndex] = { time: readingTime, moisture, note: editReadingData.note };
        let status = selectedSession.status;
        if (moisture <= selectedSession.targetMoisture && selectedSession.status === 'active') {
          status = 'completed';
        }
        const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
        await setDoc(sessionRef, { readings: updatedReadings, status }, { merge: true });
        setEditingReadingIndex(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleDeleteReading = async (index: number) => {
    if (!farmId || !selectedSession) return;
    if (!window.confirm('Delete this reading?')) return;
    try {
      const sortedReadings = [...selectedSession.readings].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      const originalReading = sortedReadings[index];
      const originalIndex = selectedSession.readings.findIndex(
        (r) => r.time === originalReading.time && r.moisture === originalReading.moisture
      );
      if (originalIndex === -1) return;
      const updatedReadings = selectedSession.readings.filter((_, i) => i !== originalIndex);
      const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
      await setDoc(sessionRef, { readings: updatedReadings }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!farmId || !window.confirm('Are you sure you want to delete this drying session?')) return;
    try {
      await deleteDoc(doc(db, 'farms', farmId, 'drying_sessions', id));
      if (selectedSession?.id === id) setSelectedSession(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/drying_sessions`);
    }
  };

  const handleAddTempReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmId || !selectedSession) return;
    try {
      const temperature = parseFloat(newTempReadingData.temperature);
      if (isNaN(temperature)) return;
      const readingTime = new Date(newTempReadingData.time).toISOString();
      const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
      const updatedTemps = [
        ...(selectedSession.temperatureReadings || []),
        { time: readingTime, temperature, note: newTempReadingData.note },
      ];
      await setDoc(sessionRef, { temperatureReadings: updatedTemps }, { merge: true });
      setNewTempReadingData({ temperature: '', time: nowLocal(), note: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleUpdateTempReading = async (index: number) => {
    if (!farmId || !selectedSession || !selectedSession.temperatureReadings) return;
    try {
      const temperature = parseFloat(editTempData.temperature);
      if (isNaN(temperature)) return;
      const readingTime = new Date(editTempData.time).toISOString();
      const updatedTemps = [...selectedSession.temperatureReadings];
      const sortedTemps = [...selectedSession.temperatureReadings].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      const originalReading = sortedTemps[index];
      const originalIndex = selectedSession.temperatureReadings.findIndex(
        (r) => r.time === originalReading.time && r.temperature === originalReading.temperature
      );
      if (originalIndex !== -1) {
        updatedTemps[originalIndex] = { time: readingTime, temperature, note: editTempData.note };
        const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
        await setDoc(sessionRef, { temperatureReadings: updatedTemps }, { merge: true });
        setEditingTempIndex(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleDeleteTempReading = async (index: number) => {
    if (!farmId || !selectedSession || !selectedSession.temperatureReadings) return;
    if (!window.confirm('Delete this temperature reading?')) return;
    try {
      const sortedTemps = [...selectedSession.temperatureReadings].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      const originalReading = sortedTemps[index];
      const originalIndex = selectedSession.temperatureReadings.findIndex(
        (r) => r.time === originalReading.time && r.temperature === originalReading.temperature
      );
      if (originalIndex === -1) return;
      const updatedTemps = selectedSession.temperatureReadings.filter((_, i) => i !== originalIndex);
      const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
      await setDoc(sessionRef, { temperatureReadings: updatedTemps }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/drying_sessions/${selectedSession.id}`);
    }
  };

  const handleComments = async (text: string) => {
    if (!selectedSession) return;
    setSelectedSession({ ...selectedSession, generalComments: text });
    if (!farmId) return;
    const sessionRef = doc(db, 'farms', farmId, 'drying_sessions', selectedSession.id);
    await setDoc(sessionRef, { generalComments: text }, { merge: true });
  };

  const handleExportPDF = async () => {
    if (!selectedSession) return;
    const element = document.getElementById('pdf-export-content');
    if (!element) return;
    try {
      setIsExporting(true);
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Bin-${selectedSession.binNumber}-Drying-Report.pdf`);
    } catch (error) {
      console.error('Error generating PDF', error);
      alert('Failed to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return {
    showAddSession,
    setShowAddSession,
    selectedSession,
    setSelectedSession,
    newSessionData,
    setNewSessionData,
    newReadingData,
    setNewReadingData,
    editingReadingIndex,
    setEditingReadingIndex,
    editReadingData,
    setEditReadingData,
    isExporting,
    activeModalTab,
    setActiveModalTab,
    ambientTemperatures,
    fetchingAmbient,
    newTempReadingData,
    setNewTempReadingData,
    editingTempIndex,
    setEditingTempIndex,
    editTempData,
    setEditTempData,
    handleStartSession,
    handleAddReading,
    handleMarkComplete,
    handleUpdateReading,
    handleDeleteReading,
    handleDeleteSession,
    handleAddTempReading,
    handleUpdateTempReading,
    handleDeleteTempReading,
    handleComments,
    handleExportPDF,
  };
}
