/**
 * Walnut blight pack — model modifier UI.
 *
 * BE-01: extracted from Settings → Advanced, still mounted there (behaviour-identical).
 * BE-02+: Production inoculum / Research knobs move onto Blight Risk; see
 * Plans/BLIGHT_ENGINE_PLUGIN.md.
 */
import type { ReactNode } from 'react';
import {
  Shield,
  Cpu,
  Database,
  Zap,
  ThermometerSun,
  Lock,
  Unlock,
  Save,
  RefreshCcw,
  AlertTriangle,
} from 'lucide-react';
import type { ModelParameters } from './modelParameters';
import { ParameterGlossary } from './BlightParameterGlossary';
import { SliderControl } from '../../../src/components/ui/SliderControl';

export type BlightEngineSettingsProps = {
  params: ModelParameters;
  onParamsChange: (next: ModelParameters) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  afterHeader?: ReactNode;
  /** Persist research knobs (merge-write). When set, Deploy / Reset actions render. */
  onDeploy?: () => void | Promise<void>;
  onResetDefaults?: () => void;
  saving?: boolean;
  message?: { type: 'success' | 'error'; text: string } | null;
};

/**
 * Research / sandbox knobs for the walnut blight pack (BE-03).
 * Mounted under Blight risk → Sandbox. Production orchard inoculum is separate
 * (`BlightOrchardInoculumPanel`). Does not change Ji Forecast / Historical.
 */
export function BlightEngineSettings({
  params,
  onParamsChange,
  isLocked,
  onToggleLock,
  afterHeader,
  onDeploy,
  onResetDefaults,
  saving = false,
  message = null,
}: BlightEngineSettingsProps) {
  const set = (patch: Partial<ModelParameters>) => onParamsChange({ ...params, ...patch });

  return (
    <div className="space-y-6">
      <div className="bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl border border-[#141414] shadow-xl space-y-4 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-emerald-400" />
            <h2 className="text-lg font-bold uppercase tracking-wider">Research modifiers (sandbox)</h2>
          </div>
          <button
            type="button"
            onClick={onToggleLock}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              isLocked
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {isLocked ? 'Controls Locked' : 'Controls Active'}
          </button>
        </div>
        <p className="text-xs opacity-70 leading-relaxed max-w-2xl">
          These knobs only change Sandbox what-ifs. They do <span className="text-emerald-300">not</span> change
          Forecast / Historical / Dashboard (Ji). Production orchard inoculum (Ji k) is the panel above the charts
          on Blight risk.
        </p>
      </div>

      {afterHeader}

      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            message.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}
        >
          {message.type === 'success' ? <Save className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
          <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
            <Zap className="w-4 h-4" />
            <h3 className="font-mono text-xs font-bold uppercase">Blight Risk Parameters</h3>
          </div>

          <div className="space-y-4">
            <SliderControl
              label="Sensitivity Threshold"
              value={params.blightSensitivity}
              min={0}
              max={1}
              step={0.01}
              isLocked={isLocked}
              onChange={(val) => set({ blightSensitivity: val })}
              description="Legacy Sandbox index only — not used by the Ji Forecast/Historical charts."
            />

            <SliderControl
              label="Humidity Gradient Factor"
              value={params.humidityGradientFactor}
              min={1}
              max={2}
              step={0.05}
              isLocked={isLocked}
              onChange={(val) => set({ humidityGradientFactor: val })}
              description="Weights LWD duration based on ambient RH levels."
            />

            <SliderControl
              label="Splash Multiplier"
              value={params.splashMultiplier || 1.0}
              min={1}
              max={3}
              step={0.1}
              isLocked={isLocked}
              onChange={(val) => set({ splashMultiplier: val })}
              description="Simulates bacterial dispersal from rain kinetic energy."
            />
          </div>
        </div>

        <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
          <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
            <ThermometerSun className="w-4 h-4" />
            <h3 className="font-mono text-xs font-bold uppercase">Horticultural Parameters</h3>
          </div>

          <div className="space-y-4">
            <SliderControl
              label="GDD Base Temp (°C)"
              value={params.gddBaseTemp}
              min={5}
              max={15}
              step={0.5}
              isLocked={isLocked}
              onChange={(val) => set({ gddBaseTemp: val })}
              description="Baseline temperature for blight growing degree-days (not Dynamic Model chill)."
            />
          </div>
        </div>

        <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
          <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
            <Database className="w-4 h-4" />
            <h3 className="font-mono text-xs font-bold uppercase">Threat start & latency</h3>
          </div>

          <div className="space-y-4">
            <SliderControl
              label="Initial threat floor"
              value={params.springStartingInoculum ?? 0.02}
              min={0}
              max={2}
              step={0.01}
              isLocked={isLocked}
              onChange={(val) => set({ springStartingInoculum: val })}
              description="Legacy Sandbox index only. Ji production inoculum uses ‘Orchard inoculum (k)’ above."
            />

            <p className="text-[11px] text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Latency / secondary knobs below are <strong>experimental</strong>. They only apply when Sandbox →
              “Latency / secondary” is on. Forecast and Historical ignore them.
            </p>

            <SliderControl
              label="Latency GDD Threshold"
              value={params.latencyGDDThreshold || 120}
              min={50}
              max={300}
              step={5}
              isLocked={isLocked}
              onChange={(val) => set({ latencyGDDThreshold: val })}
              description="Sandbox only: heat units before latent pressure erupts (experimental)."
            />

            <SliderControl
              label="Secondary Spread Mult."
              value={params.secondarySpreadMultiplier ?? 1.0}
              min={1.0}
              max={5.0}
              step={0.1}
              isLocked={isLocked}
              onChange={(val) => set({ secondarySpreadMultiplier: val })}
              description="Sandbox only: multiplier on erupting latent pressure (1.0 = no extra bump)."
            />
          </div>
        </div>

        <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
          <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
            <Shield className="w-4 h-4" />
            <h3 className="font-mono text-xs font-bold uppercase">Canopy Geometry & TRV Engine</h3>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-white border border-[#141414] rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-slate-700 uppercase font-mono">Calculated TRV</p>
                <span className="text-sm font-bold text-indigo-600 font-mono">
                  {Math.round(
                    (params.treeHeight * params.canopyWidth * 10000) / params.rowSpacing
                  ).toLocaleString()}{' '}
                  m³/ha
                </span>
              </div>
              <p className="text-[9px] text-slate-500 italic leading-relaxed">
                Homemade size index for optional microclimate nudges when map geometry is explicit — not a
                certified spray-volume TRV.
              </p>
            </div>

            <SliderControl
              label="Tree Height (m)"
              value={params.treeHeight}
              min={1}
              max={20}
              step={0.1}
              isLocked={isLocked}
              onChange={(val) => set({ treeHeight: val })}
              unit="m"
            />

            <SliderControl
              label="Canopy Width (m)"
              value={params.canopyWidth}
              min={1}
              max={10}
              step={0.1}
              isLocked={isLocked}
              onChange={(val) => set({ canopyWidth: val })}
              unit="m"
            />

            <SliderControl
              label="Row Spacing (m)"
              value={params.rowSpacing}
              min={3}
              max={15}
              step={0.5}
              isLocked={isLocked}
              onChange={(val) => set({ rowSpacing: val })}
              unit="m"
            />
          </div>
        </div>

        <div className="bg-[#E4E3E0] border border-indigo-300 p-6 rounded-2xl space-y-6 md:col-span-3 lg:col-span-1">
          <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            <h3 className="font-mono text-xs font-bold uppercase">Sandbox protection (what-if)</h3>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Used only on <strong>Blight → Sandbox</strong>. Forecast / Historical ignore these. Placeholders for
            scenario comparison — not lab MIC, rainfastness labels, or proof that diary sprays worked.
          </p>

          <div className="space-y-4">
            <SliderControl
              label="Chem Rain Washoff Rate"
              value={params.chemRainWashoffRate}
              min={0}
              max={0.2}
              step={0.01}
              isLocked={isLocked}
              onChange={(val) => set({ chemRainWashoffRate: val })}
              description="Sandbox only: how fast hypothetical chem cover drops after heavy rain."
            />

            <SliderControl
              label="Chemical Efficacy (%)"
              value={params.chemEfficacy || 95}
              min={0}
              max={100}
              step={1}
              isLocked={isLocked}
              onChange={(val) => set({ chemEfficacy: val })}
              unit="%"
              description="Sandbox only: peak hypothetical chem suppression — not orchard resistance testing."
            />

            <SliderControl
              label="Biological Efficacy (%)"
              value={params.bioEfficacy || 30}
              min={0}
              max={100}
              step={1}
              isLocked={isLocked}
              onChange={(val) => set({ bioEfficacy: val })}
              unit="%"
              description="Sandbox only: peak hypothetical bio suppression — not plaque assays."
            />

            <SliderControl
              label="Bio-Establishment Rate"
              value={params.bioColonizationEff}
              min={0}
              max={1}
              step={0.05}
              isLocked={isLocked}
              onChange={(val) => set({ bioColonizationEff: val })}
              description='Sandbox only: fraction of bio that “takes” after a what-if spray.'
            />

            <SliderControl
              label="Bio-Multiplication Rate"
              value={params.bioFavorableGrowthRate || 1.1}
              min={1.0}
              max={1.5}
              step={0.01}
              isLocked={isLocked}
              onChange={(val) => set({ bioFavorableGrowthRate: val })}
              description="Sandbox only: daily growth factor in favourable weather."
            />

            <SliderControl
              label="Bio-Survival Rate"
              value={params.bioEnvDegradationCoef || 0.75}
              min={0.5}
              max={1.0}
              step={0.01}
              isLocked={isLocked}
              onChange={(val) => set({ bioEnvDegradationCoef: val })}
              description="Sandbox only: daily survival under hostile weather."
            />
          </div>
        </div>

      </div>

      <ParameterGlossary />

      {onDeploy && (
        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <button
            type="button"
            onClick={() => void onDeploy()}
            disabled={saving}
            className="flex-1 bg-[#141414] text-[#E4E3E0] py-4 rounded-xl font-mono text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Processing...' : 'Deploy research knobs'}
          </button>
          {onResetDefaults && (
            <button
              type="button"
              onClick={onResetDefaults}
              className="px-6 py-4 border border-[#141414] text-[#141414] rounded-xl font-mono text-xs font-bold uppercase hover:bg-white transition-colors"
            >
              Reset research defaults
            </button>
          )}
        </div>
      )}
    </div>
  );
}
