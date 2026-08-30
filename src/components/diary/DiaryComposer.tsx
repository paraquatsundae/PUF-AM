import { Calendar as CalendarIcon, CheckCircle2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { FarmDiaryComposer } from '../../hooks/useFarmDiaryComposer';
import type { OrchardBlock } from '../../lib/mapStore';
import { cn } from '../../lib/utils';
import { DiaryComposerPlanFields } from './DiaryComposerPlanFields';
import { DiaryComposerSprayFields } from './DiaryComposerSprayFields';
import { DiaryComposerWaterFields } from './DiaryComposerWaterFields';

type Props = {
  canEdit: boolean;
  blocks: OrchardBlock[];
  composer: FarmDiaryComposer;
};

export function DiaryComposer({ canEdit, blocks, composer }: Props) {
  if (!canEdit) return null;

  const {
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
    handleSubmit,
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
              <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('plan')}
                  className={cn(
                    'py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all',
                    activeTab === 'plan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  Plan
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('spray')}
                  className={cn(
                    'py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all',
                    activeTab === 'spray' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  Spray
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('irrigation')}
                  className={cn(
                    'py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all',
                    activeTab === 'irrigation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">
                          Target Block
                        </label>
                        <select
                          value={selectedBlockId}
                          onChange={(e) => setSelectedBlockId(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                        >
                          <option value="">All Blocks / General</option>
                          {blocks.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.areaHa} Ha)
                            </option>
                          ))}
                        </select>
                      </div>

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
  );
}
