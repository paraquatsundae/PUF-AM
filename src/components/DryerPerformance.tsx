import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDryingSessions } from '../hooks/useDryingSessions';
import { useDryerSessionActions } from '../hooks/useDryerSessionActions';
import { DryerSessionList } from './drying/DryerSessionList';
import { StartDryingSessionModal } from './drying/StartDryingSessionModal';
import { DryerSessionDetailModal } from './drying/DryerSessionDetailModal';

export type DryerPerformanceProps = {
  blocks: { id: string; name: string; cultivar: string }[];
};

export function DryerPerformance({ blocks }: DryerPerformanceProps) {
  const { userData, user } = useAuth();
  const { sessions, dryers, loading } = useDryingSessions(userData?.farmId);
  const actions = useDryerSessionActions(userData?.farmId, user, dryers, sessions);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 animate-pulse">Loading dryer performance...</div>;
  }

  return (
    <div className="space-y-6">
      <DryerSessionList
        sessions={sessions}
        dryers={dryers}
        blocks={blocks}
        onStart={() => actions.setShowAddSession(true)}
        onSelect={actions.setSelectedSession}
      />
      <StartDryingSessionModal
        open={actions.showAddSession}
        dryers={dryers}
        blocks={blocks}
        newSessionData={actions.newSessionData}
        setNewSessionData={actions.setNewSessionData}
        onClose={() => actions.setShowAddSession(false)}
        onSubmit={actions.handleStartSession}
      />
      <DryerSessionDetailModal
        session={actions.selectedSession}
        blocks={blocks}
        isExporting={actions.isExporting}
        activeModalTab={actions.activeModalTab}
        setActiveModalTab={actions.setActiveModalTab}
        ambientTemperatures={actions.ambientTemperatures}
        fetchingAmbient={actions.fetchingAmbient}
        newReadingData={actions.newReadingData}
        setNewReadingData={actions.setNewReadingData}
        editingReadingIndex={actions.editingReadingIndex}
        setEditingReadingIndex={actions.setEditingReadingIndex}
        editReadingData={actions.editReadingData}
        setEditReadingData={actions.setEditReadingData}
        newTempReadingData={actions.newTempReadingData}
        setNewTempReadingData={actions.setNewTempReadingData}
        editingTempIndex={actions.editingTempIndex}
        setEditingTempIndex={actions.setEditingTempIndex}
        editTempData={actions.editTempData}
        setEditTempData={actions.setEditTempData}
        onClose={() => actions.setSelectedSession(null)}
        onExportPDF={actions.handleExportPDF}
        onMarkComplete={actions.handleMarkComplete}
        onAddReading={actions.handleAddReading}
        onUpdateReading={actions.handleUpdateReading}
        onDeleteReading={actions.handleDeleteReading}
        onAddTempReading={actions.handleAddTempReading}
        onUpdateTempReading={actions.handleUpdateTempReading}
        onDeleteTempReading={actions.handleDeleteTempReading}
        onDeleteSession={actions.handleDeleteSession}
        onComments={actions.handleComments}
      />
    </div>
  );
}
