import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  Database,
  Info,
  Shield,
  ThermometerSun,
  Zap,
} from 'lucide-react';

export function ParameterGlossary() {
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
