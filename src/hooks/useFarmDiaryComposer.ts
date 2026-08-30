import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ADJUVANTS, DEFAULT_BIOLOGICALS, DEFAULT_CARRIERS, DEFAULT_CHEMICALS } from '../constants';
import type { ApplicationMethod, DiaryEvent, FarmSettings, SprayType, WorkPriority } from '../lib/farmDiary';
import type { FieldIssue } from '../lib/fieldStore';
import { type LogTab, todayInputDate } from '../lib/farmDiaryView';

type ComposerDeps = {
  settings: FarmSettings;
  addEvent: (event: Omit<DiaryEvent, 'id'>) => void;
  updateSettings: (patch: Partial<FarmSettings>) => void;
  focusBlockId: string | null;
  markIssueInProgress: (issueId: string) => void;
  onSwitchToTimeline: () => void;
};

export function useFarmDiaryComposer({
  settings,
  addEvent,
  updateSettings,
  focusBlockId,
  markIssueInProgress,
  onSwitchToTimeline,
}: ComposerDeps) {
  const [activeTab, setActiveTab] = useState<LogTab>('plan');
  const [composerOpen, setComposerOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [linkedIssueId, setLinkedIssueId] = useState<string | null>(null);
  const [date, setDate] = useState(() => todayInputDate(new Date()));
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
  const [showCustomAgent, setShowCustomAgent] = useState(false);
  const [customAgent, setCustomAgent] = useState('');
  const [showCustomCarrier, setShowCustomCarrier] = useState(false);
  const [customCarrier, setCustomCarrier] = useState('');
  const [showCustomAdjuvant, setShowCustomAdjuvant] = useState(false);
  const [customAdjuvant, setCustomAdjuvant] = useState('');

  useEffect(() => {
    if (focusBlockId) setSelectedBlockId(focusBlockId);
  }, [focusBlockId]);

  const allChemicals = useMemo(
    () => [...DEFAULT_CHEMICALS, ...(settings.customChemicals || [])],
    [settings.customChemicals]
  );
  const allBiologicals = useMemo(
    () => [...DEFAULT_BIOLOGICALS, ...(settings.customBiologicals || [])],
    [settings.customBiologicals]
  );
  const availableProducts = useMemo(
    () => (sprayType === 'chem' ? allChemicals : allBiologicals),
    [sprayType, allChemicals, allBiologicals]
  );
  const allCarriers = useMemo(
    () => [...DEFAULT_CARRIERS, ...(settings.customCarriers || [])],
    [settings.customCarriers]
  );
  const allAdjuvants = useMemo(
    () => [...DEFAULT_ADJUVANTS, ...(settings.customAdjuvants || [])],
    [settings.customAdjuvants]
  );

  useEffect(() => {
    setAgentName('');
    setCustomAgent('');
    setShowCustomAgent(false);
  }, [sprayType]);

  const createPlanFromIssue = (issue: FieldIssue, blockId: string | undefined) => {
    const title = issue.note?.trim() ? issue.note.trim().slice(0, 80) : `Fix ${issue.category}`;
    onSwitchToTimeline();
    setActiveTab('plan');
    setComposerOpen(true);
    setShowSuccess(false);
    setLinkedIssueId(issue.id);
    setSelectedBlockId(blockId || '');
    setWorkTitle(title);
    setNotes(issue.note || '');
    setWorkPriority(issue.priority);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;

    if (activeTab === 'spray') {
      const finalAgent = showCustomAgent ? customAgent : agentName;
      const finalCarrier = showCustomCarrier ? customCarrier : carrier;
      const finalAdjuvant = showCustomAdjuvant ? customAdjuvant : adjuvant;

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
        notes: notes || undefined,
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
        notes: notes || undefined,
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

  return {
    activeTab,
    setActiveTab,
    composerOpen,
    setComposerOpen,
    showSuccess,
    setShowSuccess,
    linkedIssueId,
    setLinkedIssueId,
    date,
    setDate,
    sprayType,
    setSprayType,
    applicationMethod,
    setApplicationMethod,
    agentName,
    setAgentName,
    carrier,
    setCarrier,
    adjuvant,
    setAdjuvant,
    selectedBlockId,
    setSelectedBlockId,
    amount,
    setAmount,
    duration,
    setDuration,
    notes,
    setNotes,
    workTitle,
    setWorkTitle,
    assigneeName,
    setAssigneeName,
    workPriority,
    setWorkPriority,
    showCustomAgent,
    setShowCustomAgent,
    customAgent,
    setCustomAgent,
    showCustomCarrier,
    setShowCustomCarrier,
    customCarrier,
    setCustomCarrier,
    showCustomAdjuvant,
    setShowCustomAdjuvant,
    customAdjuvant,
    setCustomAdjuvant,
    allCarriers,
    allAdjuvants,
    availableProducts,
    createPlanFromIssue,
    handleSubmit,
  };
}

export type FarmDiaryComposer = ReturnType<typeof useFarmDiaryComposer>;
