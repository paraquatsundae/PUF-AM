import React from 'react';
import { Settings2, X } from 'lucide-react';
import { defaultCalibration, type CalibrationParams } from './blightModel';

export function BlightDevCalibPanel({
  calib,
  setCalib,
  onClose,
}: {
  calib: CalibrationParams;
  setCalib: React.Dispatch<React.SetStateAction<CalibrationParams>>;
  onClose: () => void;
}) {
  const setShowDevPanel = (open: boolean) => {
    if (!open) onClose();
  };
  return (
        <div className="fixed bottom-4 right-4 w-96 bg-slate-900 text-slate-200 rounded-xl shadow-2xl border border-slate-700 p-5 z-50 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-emerald-400" />
              Algorithm Calibration
            </h2>
            <button onClick={() => setShowDevPanel(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-6">
            {/* CDF Tuning */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">1. Canopy Density Factor (CDF)</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">CDF Base Weighting</label>
                <input 
                  type="number" step="0.1"
                  value={calib.cdfBaseWeighting}
                  onChange={(e) => setCalib({...calib, cdfBaseWeighting: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Determines the baseline severity of canopy closure on the microclimate.</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">CDF Exponential Effect</label>
                <input 
                  type="number" step="0.1"
                  value={calib.cdfExponentialEffect}
                  onChange={(e) => setCalib({...calib, cdfExponentialEffect: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Determines if the risk scales linearly or exponentially as the canopy gets denser.</p>
              </div>
            </div>

            {/* Natural Threat */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">2. Natural Threat Multipliers</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Temp Optimum Curve Weight</label>
                <input 
                  type="number" step="0.1"
                  value={calib.tempOptimumWeight}
                  onChange={(e) => setCalib({...calib, tempOptimumWeight: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Adjusts how aggressively the model spikes the threat level when temperatures hit the pathogen's ideal range.</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">WD Compounding Rate</label>
                <input 
                  type="number" step="0.01"
                  value={calib.wdCompoundingRate}
                  onChange={(e) => setCalib({...calib, wdCompoundingRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">The multiplier applied to each consecutive hour of leaf wetness.</p>
              </div>
            </div>

            {/* Chemical Protection — sandbox what-if only */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">3. Chemical (sandbox what-if)</h3>
              <p className="text-[10px] text-amber-300/90 leading-tight">Affects Sandbox only — not Forecast / Historical threat.</p>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Base Decay Rate (Half-life)</label>
                <input 
                  type="number" step="0.01"
                  value={calib.chemBaseDecayRate}
                  onChange={(e) => setCalib({...calib, chemBaseDecayRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Daily drop in hypothetical chem cover (sandbox). Not a measured UV half-life.</p>
              </div>
            </div>

            {/* Biological Protection — sandbox what-if only */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">4. Biological (sandbox what-if)</h3>
              <p className="text-[10px] text-amber-300/90 leading-tight">Affects Sandbox only — placeholders for scenario comparison.</p>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Establishment Rate</label>
                <input 
                  type="number" step="0.05"
                  value={calib.bioColonizationEff}
                  onChange={(e) => setCalib({...calib, bioColonizationEff: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Hypothetical take-rate after a sandbox bio spray — not CFU / plaque data.</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Multiplication Rate</label>
                <input 
                  type="number" step="0.05"
                  value={calib.bioFavorableGrowthRate}
                  onChange={(e) => setCalib({...calib, bioFavorableGrowthRate: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Sandbox daily growth factor in favourable weather.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio-Survival Rate</label>
                <input 
                  type="number" step="0.01"
                  value={calib.bioEnvDegradationCoef}
                  onChange={(e) => setCalib({...calib, bioEnvDegradationCoef: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Sandbox daily survival when weather turns hostile.</p>
              </div>
            </div>
            
            {/* Epidemiological Modifiers */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">5. Epidemiological Modifiers</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Secondary Spread Multiplier</label>
                <input 
                  type="number" step="0.1"
                  value={calib.secondarySpreadMultiplier}
                  onChange={(e) => setCalib({...calib, secondarySpreadMultiplier: Number(e.target.value)})}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Multiplier for the amount of active inoculum injected back into the threat pool when latent infections erupt.</p>
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-700">
              <button 
                onClick={() => setCalib(defaultCalibration)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm font-medium transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
  );
}
