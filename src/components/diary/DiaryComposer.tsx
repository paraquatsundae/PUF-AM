import { Calendar as CalendarIcon, CheckCircle2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { FarmDiaryComposer } from '../../hooks/useFarmDiaryComposer';
import type { LogTab } from '../../lib/farmDiaryView';
import type { OrchardBlock } from '../../lib/mapStore';
import { cn } from '../../lib/utils';
import { DiaryBlockPicker } from './DiaryBlockPicker';
import { DiaryComposerPlanFields } from './DiaryComposerPlanFields';
import { DiaryComposerSprayFields } from './DiaryComposerSprayFields';
import { DiaryComposerWaterFields } from './DiaryComposerWaterFields';
import { IssuePhotoField } from '../map/IssuePhotoField';

const LOG_TABS: { id: LogTab; label: string; active: string; idle: string }[] = [
  {
    id: 'plan',
    label: 'Plan',
    active: 'bg-amber-500 border-amber-600 text-white shadow-sm',
    idle: 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100',
  },
  {
    id: 'spray',
    label: 'Spray',
    active: 'bg-orange-500 border-orange-600 text-white shadow-sm',
    idle: 'bg-orange-50 border-orange-200 text-orange-900 hover:bg-orange-100',
  },
  {
    id: 'irrigation',
    label: 'Water',
    active: 'bg-sky-500 border-sky-600 text-white shadow-sm',
    idle: 'bg-sky-50 border-sky-200 text-sky-900 hover:bg-sky-100',
  },
];

const SAVE_BUTTON_CLASS: Record<LogTab, string> = {
  plan: 'bg-amber-600 hover:bg-amber-700',
  spray: 'bg-orange-600 hover:bg-orange-700',
  irrigation: 'bg-sky-600 hover:bg-sky-700',
};

type Props = {
  canEdit: boolean;
  blocks: OrchardBlock[];
  composer: FarmDiaryComposer;
  farmId?: string;
};

export function DiaryComposer({ canEdit, blocks, composer, farmId }: Props) {
  if (!canEdit) return null;

  const {
    activeTab,
    setActiveTab,
    composerOpen,
    setComposerOpen,
    showSuccess,
    isSaving,
    saveError,
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
    selectedBlockIds,
    toggleSelectedBlock,
    clearSelectedBlocks,
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
    handleSubmit,
    pendingPhotos,
    addPendingPhoto,
    removePendingPhoto,
  } = composer;

  return (
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
        <ChevronDown
          className={cn(
            'w-5 h-5 text-slate-400 shrink-0 transition-transform',
            composerOpen && 'rotate-180'
          )}
        />
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
              <div className="grid grid-cols-3 gap-1">
                {LOG_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all',
                      activeTab === tab.id ? tab.active : tab.idle
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
                <fieldset disabled={isSaving} className="min-w-0">
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
                        <h4 className="font-bold text-lg">Saved on this device</h4>
                        <p className="text-sm opacity-80">Added to the diary. Cloud sync runs separately when enabled.</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
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

                      <DiaryBlockPicker
                        blocks={blocks}
                        selectedBlockIds={selectedBlockIds}
                        onToggleBlock={toggleSelectedBlock}
                        onClearBlocks={clearSelectedBlocks}
                        farmId={farmId}
                      />

                      {activeTab === 'plan' ? (
                        <DiaryComposerPlanFields
                          linkedIssueId={linkedIssueId}
                          onUnlinkIssue={() => setLinkedIssueId(null)}
                          workTitle={workTitle}
                          onWorkTitle={setWorkTitle}
                          assigneeName={assigneeName}
                          onAssigneeName={setAssigneeName}
                          workPriority={workPriority}
                          onWorkPriority={setWorkPriority}
                          notes={notes}
                          onNotes={setNotes}
                        />
                      ) : activeTab === 'spray' ? (
                        <DiaryComposerSprayFields
                          sprayType={sprayType}
                          onSprayType={setSprayType}
                          applicationMethod={applicationMethod}
                          onApplicationMethod={setApplicationMethod}
                          agentName={agentName}
                          onAgentName={setAgentName}
                          showCustomAgent={showCustomAgent}
                          onShowCustomAgent={setShowCustomAgent}
                          customAgent={customAgent}
                          onCustomAgent={setCustomAgent}
                          availableProducts={availableProducts}
                          carrier={carrier}
                          onCarrier={setCarrier}
                          showCustomCarrier={showCustomCarrier}
                          onShowCustomCarrier={setShowCustomCarrier}
                          customCarrier={customCarrier}
                          onCustomCarrier={setCustomCarrier}
                          allCarriers={allCarriers}
                          adjuvant={adjuvant}
                          onAdjuvant={setAdjuvant}
                          showCustomAdjuvant={showCustomAdjuvant}
                          onShowCustomAdjuvant={setShowCustomAdjuvant}
                          customAdjuvant={customAdjuvant}
                          onCustomAdjuvant={setCustomAdjuvant}
                          allAdjuvants={allAdjuvants}
                        />
                      ) : (
                        <DiaryComposerWaterFields
                          amount={amount}
                          onAmount={setAmount}
                          duration={duration}
                          onDuration={setDuration}
                        />
                      )}

                      <IssuePhotoField
                        photos={pendingPhotos.map((row) => ({ id: row.id, src: row.src }))}
                        onAdd={(blob) => addPendingPhoto(blob)}
                        onRemove={removePendingPhoto}
                        addLabel="Add photo"
                      />

                      {activeTab !== 'plan' && (
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">
                            Field Notes
                          </label>
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
                        className={cn(
                          'w-full py-4 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2',
                          SAVE_BUTTON_CLASS[activeTab]
                        )}
                      >
                        {isSaving ? 'Saving…' : activeTab === 'plan' ? 'Save plan' : 'Save log'}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                </fieldset>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
