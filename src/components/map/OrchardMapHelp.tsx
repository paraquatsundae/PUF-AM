import { BarChart3, HardDrive, Info, RefreshCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';
import type { BasemapPack } from '../../lib/basemapPack';

export function OrchardMapHelp({
  open,
  onClose,
  basemapPack,
  basemapBusy,
  onUpdatePack,
  onClearPack,
}: {
  open: boolean;
  onClose: () => void;
  basemapPack: BasemapPack | null;
  basemapBusy: boolean;
  onUpdatePack: () => void;
  onClearPack: () => void;
}) {
  return (
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={onClose}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Info className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Orchard Twin Guide</h2>
                    <p className="text-indigo-100 text-xs">Master your digital orchard</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</div>
                    Switching Modes
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    In <strong>Edit paddocks</strong>, use the top bar to switch between <strong>Blocks</strong>, <strong>Tracks</strong>, <strong>Infrastructure</strong>, and <strong>Analytics</strong>. 
                  </p>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-500 italic">
                    Tip: On mobile, these are arranged in a grid for quick access.
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</div>
                    Managing Blocks
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Select the <strong>Blocks</strong> mode to draw new orchard sections. Use the polygon tool on the bottom-left of the map to trace your boundaries.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">3</div>
                    Drawing Tracks
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Open <strong>Tracks</strong>, then use the <strong>+</strong> button or the polyline tool to click along a pathway.
                    Finish the line to save it. Tap a track on the map or in the list to rename it and set primary / secondary / service.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">4</div>
                    Predictive Analytics
                  </h3>
                  <div className="flex gap-4 items-start">
                    <div className="flex-shrink-0 p-2 bg-amber-100 text-amber-600 rounded-xl">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      The <strong>Analytics</strong> tab shows today’s risk and yield heatmaps from weather data and your farm diary. Use the sidebar to switch between Risk and Yield views.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">5</div>
                    Search & edit
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Use the search field in the top bar to jump to a place. Tap <strong>Edit</strong> to draw or change paddocks, tracks, and infrastructure.
                  </p>
                </section>

                {basemapPack && (
                  <section className="space-y-3 border-t border-slate-100 pt-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-slate-500" />
                      Offline satellite map
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Your farm imagery is stored on this device. Only update or clear it when you need a fresher download.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={basemapBusy}
                        onClick={() => {
                          onClose();
                          onUpdatePack();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-3.5 h-3.5', basemapBusy && 'animate-spin')} />
                        Update map pack
                      </button>
                      <button
                        type="button"
                        disabled={basemapBusy}
                        onClick={() => {
                          onClose();
                          void onClearPack();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 text-rose-800 text-xs font-semibold hover:bg-rose-100 disabled:opacity-50"
                      >
                        Clear local pack
                      </button>
                    </div>
                  </section>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={onClose}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                >
                  Got it, let's go!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  );
}
