/**
 * Walnut blight pack — model modifier UI.
 *
 * BE-01: extracted from Settings → Advanced, still mounted there (behaviour-identical).
 * BE-02+: Production inoculum / Research knobs move onto Blight Risk; see
 * Plans/BLIGHT_ENGINE_PLUGIN.md.
 */
import React, { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  Cpu,
  Info,
  Database,
  Zap,
  ThermometerSun,
  Lock,
  Unlock,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ModelParameters } from '../../lib/modelParameters';

export interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  description?: string;
  unit?: string;
  isLocked: boolean;
}

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  description,
  unit,
  isLocked,
}: SliderControlProps) {
  const handleIncrement = () => {
    if (isLocked) return;
    const newValue = Math.min(max, value + step);
    onChange(Number(newValue.toFixed(3)));
  };

  const handleDecrement = () => {
    if (isLocked) return;
    const newValue = Math.max(min, value - step);
    onChange(Number(newValue.toFixed(3)));
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <label className="text-[10px] font-mono font-bold uppercase text-slate-700">{label}</label>
        <span className="text-xs font-mono font-bold text-slate-900">
          {value}
          {unit}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDecrement}
          disabled={isLocked || value <= min}
          className="p-1.5 bg-white border border-[#141414] rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={isLocked}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-[#141414] disabled:opacity-50 disabled:cursor-not-allowed h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
        />
        <button
          onClick={handleIncrement}
          disabled={isLocked || value >= max}
          className="p-1.5 bg-white border border-[#141414] rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {description && <p className="text-[9px] italic opacity-60 leading-tight">{description}</p>}
    </div>
  );
}

function ParameterGlossary() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-[#E4E3E0] border border-[#141414] rounded-2xl overflow-hidden mt-6">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#d6d5d2] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-[#141414]" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-[#141414]">
            Parameter Glossary & Measurement Guide
          </h3>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-[#141414]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#141414]" />
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-6 pt-0 border-t border-[#141414]/20 space-y-8 text-sm text-[#141414] mt-4 font-sans">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                    Blight Risk Parameters
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Sensitivity Threshold</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> A modifier that adjusts the baseline susceptibility of the
                      orchard to <em>Xanthomonas arboricola pv. juglandis</em>. It acts as a genetic or historical
                      risk weight.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is measured:</strong> Determined by the specific walnut cultivar planted in
                      the block (e.g., 'Chandler' vs. 'Franquette') and historical disease pressure. It is input as
                      a relative decimal: <code>1.0</code> represents average susceptibility, <code>&lt; 1.0</code>{' '}
                      indicates a highly resistant block, and <code>&gt; 1.0</code> indicates a highly susceptible
                      block with a history of severe blight.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Humidity Gradient Factor</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> An environmental multiplier that accounts for the discrepancy
                      between the relative humidity (RH) recorded by an open-air weather station and the actual RH
                      trapped deep inside the orchard canopy.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is measured:</strong> Calibrated by temporarily placing micro-sensors inside
                      the canopy and comparing their readings to the main farm weather station. A value of{' '}
                      <code>1.0</code> assumes the canopy matches the weather station; a value like{' '}
                      <code>1.2</code> simulates a microclimate that stays 20% more humid than the surrounding air.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Splash Multiplier</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> A kinetic energy variable that simulates how effectively heavy
                      rainfall physically disperses bacteria from infected tissues (like overwintering buds) to
                      healthy tissues.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is measured:</strong> Based on regional weather patterns and storm intensity.
                      If the orchard is in a region prone to sudden, violent downpours (high kinetic energy), this
                      should be increased (e.g., <code>1.2</code> to <code>1.5</code>). If the region typically
                      experiences light, misty rain, it should remain closer to <code>1.0</code>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <ThermometerSun className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                    Horticultural Parameters
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Crop Coefficient (Kc)</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> A rough canopy-coverage factor used in water budgeting UI — not
                      the blight TRV/CDF path.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is measured:</strong> Estimated from canopy width ÷ row spacing when those
                      values are available.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">GDD Base Temp (°C)</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> The minimum temperature threshold below which pathogen GDD (and
                      experimental latency) stalls — not the chill Dynamic Model base.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> Default <code>10.0°C</code> for Persian walnuts. Separate
                      from the SH <strong>calendar phenology</strong> table (May–Aug dormant → Oct bloom) used on
                      Forecast / Historical.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Calendar phenology (not a slider)</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Hard-coded Southern-Hemisphere month → stage schedule in the
                      blight engine. Susceptibility: dormant 0.1, bud break 1.5, bloom 2.0, post-bloom 1.0, shell
                      hardening 0.3.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>Override:</strong> Blight Risk → <em>Scouted override</em> (from today forward,
                      session-only). Sandbox locks a fixed stage. Diary-persisted scouting is later work.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">Threat start & latency</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Initial threat floor</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> The unitless threat value at the start of a blight model run.
                      Weather then rebuilds (or decays) the curve from there.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> A plain calibration knob — <strong>not</strong> loaded from
                      last season’s disease map, dormant sprays, or bud CFU. Default <code>0.02</code> is a small
                      floor so the chart is not stuck at absolute zero before the first wet days. Raise it only if
                      you want a higher baseline for what-ifs.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Latency GDD Threshold</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Sandbox-only (experimental). Heat units before queued infection
                      pressure “erupts” when Latency / secondary is on.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> Default <code>120 GDD</code> — not fitted to WA lesion
                      timing. Forecast and Historical ignore this.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Secondary Spread Multiplier</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Sandbox-only (experimental). Multiplier on erupting latent
                      pressure.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> Default <code>1.0</code> = no extra bump. Raise only for
                      what-ifs — not a field-validated secondary-inoculum model.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                    Sandbox protection (what-if)
                  </h3>
                </div>
                <p className="text-xs leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  These knobs only change the <strong>Blight → Sandbox</strong> chart (hypothetical chem/bio
                  armour). Forecast and Historical stay weather-driven. Diary sprays are markers, not proof of
                  field efficacy. Defaults are round numbers for exploration — not MIC assays or label
                  rainfastness.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Chemical Rain Washoff Rate</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Sandbox knob for how fast hypothetical chemical cover decays
                      after heavy rain days.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> Not manufacturer rainfastness. Higher = armour falls off
                      faster in the what-if chart.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Application Method Penetration Penalty</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Sandbox reduction of spray “hit” by method (ground / drone /
                      air) vs canopy size.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> Heuristic for comparing scenarios — not a deposition trial
                      or certified coverage model.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Bio-Establishment / Multiplication / Survival</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Sandbox knobs for how a hypothetical biological agent
                      establishes, grows in favourable weather, and decays when hostile.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> Simple daily factors for what-ifs — not CFU counts, plaque
                      assays, or strain-specific biology for your orchard.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Chemical / Biological Efficacy (%)</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Peak hypothetical suppression when a sandbox spray is applied
                      (chem) or after bio “establishes” (bio).
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is set:</strong> Defaults (~95% chem / ~30% bio) are placeholders for
                      scenario comparison. They are <strong>not</strong> lab MIC results, resistance surveys, or
                      a claim that diary sprays delivered that control in the field.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                    Orchard Architecture & Genetics
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Tree / canopy geometry (TRV → CDF)</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Tree height, canopy width, and row spacing from the Orchard Map
                      feed a rough TRV-style index used as CDF.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is used:</strong> Blight RH/wetness/splash microclimate modifiers stay{' '}
                      <strong>off</strong> until all three are set on a block (or all three are overridden in the
                      blight sandbox). Not a certified spray-volume TRV calculator.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Canopy Closure (%)</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> The percentage of the orchard floor shaded by the tree canopy
                      at solar noon. It directly impacts microclimate humidity and leaf wetness duration.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>How it is measured:</strong> Visually estimated or measured using aerial imagery/PAR
                      sensors. A closed canopy (80-100%) severely restricts airflow and sunlight penetration,
                      meaning morning dew or rain takes significantly longer to dry, drastically increasing the
                      infection window.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Cultivar sensitivity (vs “resistance profile”)</h4>
                    <p className="text-xs leading-relaxed">
                      <strong>What it is:</strong> Overall orchard sensitivity is mainly the{' '}
                      <em>Sensitivity Threshold</em> knob under blight parameters — a relative weight, not a
                      genotype × pathogen resistance matrix.
                    </p>
                    <p className="text-xs leading-relaxed">
                      <strong>Chem/bio efficacy %:</strong> Those live under <strong>Sandbox protection</strong>{' '}
                      above. They are what-if suppressors, not a measured resistance profile for your copper or bio
                      product.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type BlightEngineSettingsProps = {
  params: ModelParameters;
  onParamsChange: (next: ModelParameters) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  /** Save banner etc. — kept between header and parameter grid for layout parity. */
  afterHeader?: ReactNode;
  /** Market & Economics card — same grid as blight panels (BE-01 layout parity). */
  gridTrailing?: ReactNode;
};

/**
 * Research / sandbox knobs still under Settings → Advanced (BE-02).
 * Production orchard inoculum lives on Blight Risk; BE-03 moves these research panels there too.
 */
export function BlightEngineSettings({
  params,
  onParamsChange,
  isLocked,
  onToggleLock,
  afterHeader,
  gridTrailing,
}: BlightEngineSettingsProps) {
  const set = (patch: Partial<ModelParameters>) => onParamsChange({ ...params, ...patch });

  return (
    <>
      <div className="bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl border border-[#141414] shadow-xl space-y-4 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-emerald-400" />
            <h2 className="text-lg font-bold uppercase tracking-wider">Research modifiers (sandbox)</h2>
          </div>
          <button
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
          These knobs only change Blight → Sandbox what-ifs. They do <span className="text-emerald-300">not</span>{' '}
          change Forecast / Historical / Dashboard (Ji). Production orchard inoculum (Ji k) is set on{' '}
          <span className="text-emerald-300">Blight risk</span>. This research panel moves to Blight → Sandbox soon
          (BE-03).
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 leading-relaxed">
        <strong className="font-semibold">Orchard inoculum moved.</strong> Set Low / Medium / High on{' '}
        <Link to="/blight" className="font-semibold text-emerald-800 underline underline-offset-2">
          Blight risk
        </Link>
        . Research knobs below stay here temporarily.
      </div>

      {afterHeader}

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

        {gridTrailing}
      </div>

      <ParameterGlossary />
    </>
  );
}
