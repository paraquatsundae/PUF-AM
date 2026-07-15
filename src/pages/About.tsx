import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Book, Microscope, Map, Shield, Activity, Snowflake, Wind, Droplets, ChevronDown, ChevronUp, Settings, Zap, Database, Cpu, AlertTriangle, ClipboardCheck, Target, LineChart, TestTube, Users, ThermometerSun, ExternalLink, BookOpen, Tractor, Warehouse } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAppUrl, getShareUrl, hasPublishedAppUrl } from '../lib/appUrl';

function ModelComparisonBox() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="space-y-4">
      <div 
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="p-6 flex items-center justify-between text-slate-900">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-slate-600" />
            <h2 className="text-xl font-bold">Model Architecture: Ji et al. (2025) vs. SentiNut</h2>
          </div>
          {isOpen ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div className="p-6 pt-0 space-y-6 text-slate-700 border-t border-slate-100 mt-4">
                <p className="text-sm leading-relaxed">
                  Here is a detailed comparison between the mechanistic model proposed by Ji et al. (2025) and the SentiNut Enhanced Engine, specifically focusing on how our engine abstracts the compartmental S1 → S4 flow into a unified, actionable metric.
                </p>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">1. Architectural Shift: Compartmental vs. SEI (Susceptible-Exposed-Infectious) Engine</h3>
                  <p className="text-sm leading-relaxed"><strong>Ji et al. (Compartmental HLIR Model):</strong> The research paper uses a classic epidemiological state-transition model. It explicitly tracks the fraction of host tissue moving through four distinct, non-overlapping gates: Healthy (S1) → Infested (S2) → Latently Infected (S3) → Diseased/Infectious (S4).</p>
                  <p className="text-sm leading-relaxed"><strong>SentiNut Engine (Dynamic SEI Model):</strong> Instead of tracking abstract percentages of plant tissue, our engine utilizes a continuous <strong>SEI (Susceptible-Exposed-Infectious)</strong> architecture. We calculate a <strong>Daily Infection Rate</strong> based on microclimate data, which transitions healthy tissue into an "Exposed" state (Latent Threat). Rather than a simple rolling average, SentiNut actively manages these infections in a queue, tracking their development through thermal time (GDD) until they become "Infectious" and contribute to secondary spread.</p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">2. Dispersal (S1 → S2): Cumulative Rain vs. Kinetic Splash</h3>
                  <p className="text-sm leading-relaxed"><strong>Ji et al.:</strong> The paper models the mobilization of primary inoculum (S1 → S2) using a cumulative rainfall equation from budbreak. It assumes any rain event simply moves a mathematically predictable amount of bacteria based on the season's total rainfall so far.</p>
                  <p className="text-sm leading-relaxed"><strong>SentiNut Engine:</strong> We abstracted this into the <strong>Rain Splash Multiplier (M<sub>splash</sub>)</strong>. Instead of relying purely on cumulative seasonal rain, our engine looks at the <em>kinetic energy</em> of the immediate weather event (Maximum Hourly Rain). A 5mm downpour creates a much higher splash dispersal multiplier (up to 2.0x) than 5mm of gentle drizzle over 10 hours. Furthermore, we modify this splash effect based on the Canopy Density Factor (CDF), simulating the "pinball effect" of water bouncing through a dense canopy.</p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">3. Infection (S2 → S3): Ambient Weather vs. Microclimate</h3>
                  <p className="text-sm leading-relaxed"><strong>Ji et al.:</strong> The transition from infested to infected tissue (S2 → S3) relies heavily on the Beta equation for Temperature and the Gompertz equation for Wetness Duration (WD). Crucially, these equations use <em>ambient</em> weather station data.</p>
                  <p className="text-sm leading-relaxed"><strong>SentiNut Engine:</strong> We recognized that ambient weather does not reflect the reality inside a walnut tree. Before we even calculate the infection rate, we transform the ambient data into <strong>In-Canopy Microclimate Data</strong>. We use the <strong>Canopy Density Factor (CDF)</strong> to artificially increase Relative Humidity (RH) and prolong Wetness Duration (WD). We also introduce <strong>Irrigation Modifiers</strong>—if a block uses micro-sprinklers, the engine artificially spikes the local RH and WD, acknowledging that infection (S2 → S3) can occur even on days with zero rainfall.</p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">4. Incubation & Secondary Inoculum (S3 → S4): Fixed Delay vs. Thermal Latency Queue</h3>
                  <p className="text-sm leading-relaxed"><strong>Ji et al.:</strong> The paper assumes a strict 15 to 21-day incubation period. Tissue infected today (S3) will not show symptoms or produce secondary inoculum (S4) until 2 to 3 weeks later, governed by a delay distribution function.</p>
                  <p className="text-sm leading-relaxed"><strong>SentiNut Engine:</strong> We replaced the rigid time-based delay with a dynamic <strong>Thermal Latency Queue</strong>. Infections are tracked as discrete daily cohorts that incubate based on <strong>Growing Degree Days (GDD)</strong>. Once a cohort accumulates enough heat units to cross the <code>latencyGDDThreshold</code>, it "erupts" into visible lesions. This triggers an exponential <strong>Secondary Spread Multiplier</strong>, actively injecting massive amounts of new bacterial inoculum back into the active threat pool. This ensures the system accurately predicts explosive secondary outbreaks driven by temperature, rather than just the calendar.</p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">5. Top-Down Disease Dynamics & Application Methods</h3>
                  <p className="text-sm leading-relaxed"><strong>The Agronomic Reality:</strong> Bacterial blights (like <em>Xanthomonas</em>) typically overwinter in the outer/upper canopy buds and catkins. Primary infection starts at the top of the tree, and subsequent rainfall washes the bacteria downward, creating a cascading "cone of infection." Therefore, protecting the very top of the canopy is the most critical factor in breaking the disease cycle.</p>
                  <p className="text-sm leading-relaxed"><strong>SentiNut Engine:</strong> We model this reality by applying a <strong>Spray Penetration Penalty</strong> that varies based on the <strong>Application Method</strong> and the orchard's <strong>Canopy Density Factor (CDF)</strong>:</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li><strong>Ground Sprayers (Airblast):</strong> Suffer the highest penalty in dense canopies. They struggle to push product to the top 1/3 of mature trees, failing to protect the primary source of inoculum.</li>
                    <li><strong>Helicopters:</strong> Suffer the lowest penalty. Rotor downwash effectively coats the upper canopy where the disease originates, making density less of a barrier to effective threat reduction.</li>
                    <li><strong>Drones (UAVs):</strong> Suffer a low-moderate penalty. They apply from the top down but have less powerful downwash than manned helicopters.</li>
                    <li><strong>Aeroplanes (Fixed-Wing):</strong> Suffer a moderate penalty. Excellent top-canopy deposition but lacks the aggressive turbulent downwash of rotary aircraft.</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">6. Agronomic Integration: The Missing Variables</h3>
                  <p className="text-sm leading-relaxed">The Ji et al. model is a pure epidemiological simulation. It assumes a uniform orchard and does not account for human intervention or tree biology. Our engine bridges the gap between epidemiology and agronomy by injecting three critical modifiers into the combined S1 → S4 equation:</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li><strong>Phenological Weighting (F<sub>stage</sub>):</strong> Ji et al. treats all susceptible tissue equally. We scale the daily infection rate based on the growth stage (e.g., Bloom is highly susceptible at 2.0x, while Shell Hardening drops to 0.3x).</li>
                    <li><strong>Cultivar Sensitivity (M<sub>sens</sub>):</strong> We adjust the baseline risk depending on the genetic resistance of the specific walnut block (e.g., Chandler vs. Franquette).</li>
                    <li><strong>Dynamic Treatment Efficacy:</strong> The Ji et al. model does not simulate sprays. Our engine directly subtracts chemical and biological efficacy from the threat level, actively degrading those protections based on rain washoff coefficients and environmental degradation.</li>
                  </ul>
                </div>

                <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 mb-2">Summary</h4>
                  <p className="text-sm leading-relaxed">
                    While Ji et al. provides a rigorous, compartmentalized academic framework for how <em>Xanthomonas arboricola pv. juglandis</em> moves through plant tissue, the SentiNut engine translates that framework into a fluid, microclimate-aware SEI risk index. By tracking latent infections through a thermal GDD queue and simulating explosive secondary spread, our engine delivers highly actionable, block-specific agronomic intelligence that responds dynamically to both weather and tree phenology.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function ResearcherHelpBox() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="space-y-4">
      <div 
        className="bg-[#E4E3E0] border border-[#141414] rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="p-4 flex items-center justify-between bg-[#141414] text-[#E4E3E0]">
          <div className="flex items-center gap-3">
            <Microscope className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider">🔬 Researcher & Manager Guide</h3>
              <p className="text-[10px] opacity-70 font-mono">Model logic, access protocols, and impact analysis</p>
            </div>
          </div>
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div className="p-6 space-y-8 font-sans text-[#141414]">
                {/* Access Protocol */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414] pb-1">
                    <Settings className="w-4 h-4" />
                    <h4 className="font-mono text-xs font-bold uppercase">01. Access Protocol</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs leading-relaxed">
                    <div className="space-y-2">
                      <p className="font-bold underline italic">Permission Requirements:</p>
                      <p>Access to the <span className="font-mono bg-white px-1">Model Modifier Menu</span> is restricted to users with the <span className="font-bold">Admin</span> role.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-bold underline italic">Navigation Path:</p>
                      <p className="font-mono">Settings → Advanced (model parameters)</p>
                      <p className="text-[10px] text-slate-500">Farm infrastructure (dryers, water allocation, irrigation method) lives under <span className="font-mono">Farm setup</span>.</p>
                      <div className="flex items-start gap-2 bg-amber-100 p-2 border border-amber-300 rounded">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <p className="text-[10px] text-amber-800 italic">Caution: Model parameter changes alter blight risk curves for everyone on the farm.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Blight Model Logic */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[#141414] pb-1">
                    <Zap className="w-4 h-4" />
                    <h4 className="font-mono text-xs font-bold uppercase">02. Blight Model: Ji et al. vs. Our Engine</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 p-3 border border-[#141414] bg-white/50 rounded">
                      <h5 className="font-mono text-[11px] font-bold italic">Original Ji et al. Model</h5>
                      <p className="text-[11px] leading-relaxed opacity-80">
                        Uses a binary threshold of <span className="font-bold">Temperature</span> and <span className="font-bold">Leaf Wetness Duration (LWD)</span> to predict infection windows. 
                        Assumes a uniform environment and lacks micro-climatic variance adjustment.
                      </p>
                    </div>
                    <div className="space-y-2 p-3 border border-[#141414] bg-emerald-50 rounded">
                      <h5 className="font-mono text-[11px] font-bold italic text-emerald-900">SentiNut Enhanced Engine</h5>
                      <ul className="text-[11px] space-y-2 list-disc pl-4 opacity-90">
                        <li><span className="font-bold">Dynamic Weighting:</span> Adds a "Humidity Gradient" factor, weighting LWD more heavily when ambient humidity stays above 85% for &gt;4 hours.</li>
                        <li><span className="font-bold">Block-Specific Resistance:</span> Integrates "Cultivar" metadata. A 'Chandler' block triggers a "High Risk" alert 15% earlier than a 'Franquette' block.</li>
                        <li><span className="font-bold">Weather Integration:</span> Derives wetness probability from real-time DPIRD dew point and precipitation data instead of manual entry.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Other Models */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414] pb-1">
                    <Database className="w-4 h-4" />
                    <h4 className="font-mono text-xs font-bold uppercase">03. Secondary Integrated Models</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3 border border-[#141414]/20 rounded">
                      <h5 className="font-mono text-[10px] font-bold uppercase mb-1">Irrigation</h5>
                      <p className="text-[10px] leading-tight opacity-70 italic">Modified Penman-Monteith. Calculates daily ET by combining solar radiation with local irrigation system efficiency.</p>
                    </div>
                    <div className="p-3 border border-[#141414]/20 rounded">
                      <h5 className="font-mono text-[10px] font-bold uppercase mb-1">Phenology</h5>
                      <p className="text-[10px] leading-tight opacity-70 italic">GDD Model (Base 10°C). Tracks Growing Degree Days to predict harvest windows and Bud Break stages on the timeline.</p>
                    </div>
                    <div className="p-3 border border-[#141414]/20 rounded">
                      <h5 className="font-mono text-[10px] font-bold uppercase mb-1">Infrastructure</h5>
                      <p className="text-[10px] leading-tight opacity-70 italic">Uptime/Latency Logic. Monitors soil sensor pins and flags "Offline" status if data packets are missed for &gt;12 hours.</p>
                    </div>
                  </div>
                </div>

                {/* Impact Analysis */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#141414] pb-1">
                    <Cpu className="w-4 h-4" />
                    <h4 className="font-mono text-xs font-bold uppercase">04. Impact Analysis (Cause & Effect)</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] font-mono border-collapse">
                      <thead>
                        <tr className="bg-[#141414] text-[#E4E3E0]">
                          <th className="p-2 text-left border border-[#141414]">PARAMETER</th>
                          <th className="p-2 text-left border border-[#141414]">IMPACT ON SYSTEM</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2 border border-[#141414] font-bold italic">Blight Sensitivity Threshold</td>
                          <td className="p-2 border border-[#141414]">Shifts the "Spray Recommended" alerts in the Farm Diary.</td>
                        </tr>
                        <tr>
                          <td className="p-2 border border-[#141414] font-bold italic">Crop Coefficient (Kc)</td>
                          <td className="p-2 border border-[#141414]">Increases/decreases the calculated "Water Deficit" on the Map view.</td>
                        </tr>
                        <tr>
                          <td className="p-2 border border-[#141414] font-bold italic">GDD Base Temp</td>
                          <td className="p-2 border border-[#141414]">Accelerates or delays the predicted "Harvest Ready" date.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function ResearcherValidationGuide() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="space-y-4">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="p-4 flex items-center justify-between text-slate-100">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider">📋 Researcher Validation Guide</h3>
              <p className="text-[10px] opacity-70 font-mono text-slate-300">Protocols for validating and improving model parameters</p>
            </div>
          </div>
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div className="p-6 space-y-8 font-sans bg-white text-slate-800 border-t border-slate-200">
                
                {/* 1. Objectives */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Target className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-slate-900">Objectives</h4>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                    <li>Confirm accuracy, precision, and reliability of all raw inputs and modifiers.</li>
                    <li>Validate time-dependent "protection armor" curves (chemical decay/wash-off and biological establishment/decline).</li>
                    <li>Quantify how inputs drive Natural Threat Level and how interventions reduce it.</li>
                    <li>Assess overall model performance against observed disease incidence/severity (target: high concordance with field data).</li>
                    <li>Identify sensitivities and uncertainties for refinement.</li>
                  </ul>
                </div>

                {/* 2. Data Requirements */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Database className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-slate-900">Data Requirements and Collection Protocols</h4>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">Collect high-resolution, orchard-specific data alongside model runs. Use the same weather station setup for consistency.</p>
                  <div className="space-y-3 text-sm text-slate-600">
                    <p><strong className="text-slate-800">Meteorological:</strong> On-site automated stations (e.g., Campbell Scientific or equivalent) logging hourly Temperature (°C), Relative Humidity (%), Rainfall (mm), and Leaf Wetness Duration (hours) via dielectric leaf wetness sensors placed in canopy. Calibrate sensors annually against standards; cross-validate WD against manual observations or reference stations.</p>
                    <p><strong className="text-slate-800">Orchard Architecture & Phenology:</strong> Measure Tree Density (trees/ha) via GPS mapping; Canopy Closure (%) via hemispherical photography, LiDAR, or smartphone apps (e.g., Canopeo). Track Growth Stage weekly through visual scouting (Dormant → Bud Break/Catkin → Pistillate Bloom/Feather → Post-Bloom/Nut Enlargement → Shell Hardening/Mature). Record primary inoculum via dormant bud sampling (plate on selective media for Xaj CFU).</p>
                    <p><strong className="text-slate-800">Primary Inoculum & Latency:</strong> Collect dormant bud samples (50-100 per block) before bud break to quantify overwintering bacterial load (CFU/g tissue). During the season, tag specific nuts during known infection events (e.g., major rainstorms) and record the exact number of days and accumulated Growing Degree Days (GDD) until visible lesions appear to calibrate the Latency GDD Threshold.</p>
                    <p><strong className="text-slate-800">Interventions:</strong> Detailed spray logs (date/time, type, rate, volume). For efficacy validation, subsample leaves/fruits post-application for chemical residue (HPLC analysis) and biological colonization (CFU plating or qPCR) to measure both establishment and ongoing efficacy.</p>
                    <p><strong className="text-slate-800">Ground-Truth Disease Incidence:</strong> Weekly visual assessments (incidence % trees affected; severity index 0–4 or % lesion area on 50–100 leaves/fruits per plot). Use standardized scoring (e.g., % blighted tissue). Include canker/lesion counts and yield loss.</p>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                      <p className="text-xs font-medium text-slate-700 italic">Collect multi-year (minimum 2–3 seasons) and multi-orchard data (≥3 sites with varying density/canopy) plus historical archives for baseline.</p>
                    </div>
                  </div>
                </div>

                {/* 3. Phase 1 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <TestTube className="w-5 h-5 text-rose-600" />
                    <h4 className="font-bold text-slate-900">Phase 1: Input Data Quality Validation (Accuracy & Precision)</h4>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">Test raw inputs independently before model integration.</p>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                    <li><strong className="text-slate-800">Environmental/Meteorological:</strong> Deploy duplicate sensors; calculate bias, RMSE, and correlation vs. Bureau of Meteorology reference data. Specifically validate Leaf Wetness Duration (most critical for infection) by comparing sensor hours to visual wetness events.</li>
                    <li><strong className="text-slate-800">Orchard Architecture & Phenology:</strong> Ground-truth measurements with independent methods (e.g., drone imagery for canopy). Validate growth-stage timing against temperature-based degree-day models.</li>
                    <li><strong className="text-slate-800">Epidemiological Baselines:</strong> Validate the <em>Initial Overwintering Load</em> by comparing model baseline threat to actual dormant bud CFU counts. Validate the <em>Latency GDD Threshold</em> by comparing model-predicted symptom emergence dates to field observations of tagged nuts.</li>
                    <li><strong className="text-slate-800">Intervention Variables:</strong>
                      <ul className="list-circle pl-5 mt-1 space-y-1">
                        <li><em>Spray Timing:</em> GPS-logged applications; verify reset of protection curves.</li>
                        <li><em>Efficacy (%):</em> Lab bioassays (in vitro kill/colonization rates) + controlled greenhouse trials for baseline values. Field-test decay: sample residues/CFU at 0, 3, 7, 14, 21 days post-spray, with/without simulated or natural rainfall to quantify exponential decay and wash-off (chemical) or establishment/decline (biological).</li>
                      </ul>
                    </li>
                  </ul>
                  <p className="text-sm font-medium text-slate-700 mt-2">Metrics: Accuracy (±5–10% target), repeatability (CV &lt;15%).</p>
                </div>

                {/* 4. Phase 2 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Microscope className="w-5 h-5 text-amber-600" />
                    <h4 className="font-bold text-slate-900">Phase 2: Component-Wise Validation (Isolation via Controls)</h4>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">Use control-group approach to isolate effects.</p>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                    <li><strong className="text-slate-800">Environmental & Meteorological (Baseline Threat):</strong> Run model with Orchard Architecture and Interventions fixed at "null" (standard density/canopy = 0% modification; 0% efficacy, no sprays). Compare predicted Natural Threat Level curves to historical outbreaks in untreated orchards (or new no-intervention controls). Use artificial inoculation trials: Spray standardized Xaj suspension (10^8–5×10^8 CFU/mL) on potted trees, expose to natural weather for 24 h, assess severity after 10–15 days. Compare observed vs. predicted infection risk.</li>
                    <li><strong className="text-slate-800">Orchard Architecture & Phenology Modifiers:</strong> Test across orchards differing in density/canopy (low vs. high). Deploy internal canopy sensors to quantify microclimate amplification (extended WD/RH). For growth stage: Inoculate at each defined stage; quantify susceptibility multiplier (highest at Pistillate Bloom). Model as exponential decline with tissue age.</li>
                    <li><strong className="text-slate-800">Intervention Protection Curves:</strong>
                      <ul className="list-circle pl-5 mt-1 space-y-1">
                        <li><em>Chemical:</em> Apply single sprays; monitor residue decline + rain events; validate exponential decay function against measured protection.</li>
                        <li><em>Biological:</em> Track colonization peak and degradation via CFU counts; validate the two-step process: 1) establishment phase (colonization efficiency) and 2) ongoing antagonistic phase (biological efficacy) and environmental decay.</li>
                        <li><em>Tank Mix (Both):</em> Test additive/synergistic effects in split-plot trials.</li>
                        <li><em>Timing:</em> Factorial trials (early vs. optimal vs. late sprays) vs. predicted threat peaks.</li>
                      </ul>
                    </li>
                  </ul>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                    <p className="text-xs font-medium text-slate-700 italic">Control Groups: Untreated + standard-density plots for baseline; vary one factor at a time.</p>
                  </div>
                </div>

                {/* 5. Phase 3 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    <h4 className="font-bold text-slate-900">Phase 3: Full Model Validation (Integrated Outputs)</h4>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p><strong className="text-slate-800">Design:</strong> Factorial field trials (3–5 replicates/plot, 4–6 treatments: untreated control + chemical only + biological only + tank mix, at varying timings). Include natural epidemics and supplemental inoculation events. Run across ≥3 orchards and 2–3 seasons (covering weather variability).</p>
                    <p><strong className="text-slate-800">Outputs Tested:</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Daily Natural Threat Level vs. observed infection events.</li>
                      <li>Chemical + Biological Protection Levels vs. measured residue/CFU and disease suppression.</li>
                      <li>Final predicted risk-adjusted incidence/severity vs. actual scouting data.</li>
                    </ul>
                    <p><strong className="text-slate-800">Methods:</strong> Daily model runs with real inputs; compare predicted infection windows and severity progression curves to weekly field data (leaves + fruit).</p>
                  </div>
                </div>

                {/* 6. Phase 4 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Settings className="w-5 h-5 text-slate-600" />
                    <h4 className="font-bold text-slate-900">Phase 4: Sensitivity & Uncertainty Analysis</h4>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                    <li>One-at-a-time (OAT) and Monte Carlo simulations: Vary each input ±10–20% (or realistic error ranges) while holding others fixed.</li>
                    <li>Prioritize high-impact variables (Leaf Wetness Duration, Rainfall, Growth Stage, Efficacy decay rates).</li>
                    <li>Quantify output variance (Natural Threat Level, final incidence) using tornado plots or Sobol indices.</li>
                    <li>Scenario testing: Extreme weather years, high-density orchards, delayed sprays.</li>
                  </ul>
                </div>

                {/* 7. Statistical Evaluation */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <LineChart className="w-5 h-5 text-purple-600" />
                    <h4 className="font-bold text-slate-900">Statistical Evaluation & Performance Metrics</h4>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">Apply these across all phases (use R/Python: e.g., DescTools for CCC, Metrics package for RMSE).</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                    <li><strong className="text-slate-800">Input Accuracy:</strong> Bias, RMSE, Lin's Concordance Correlation Coefficient (CCC).</li>
                    <li><strong className="text-slate-800">Binary Infection Occurrence:</strong> Precision, Recall, F1-score (target &gt;0.80, as in validated models).</li>
                    <li><strong className="text-slate-800">Severity/Progression:</strong> Linear regression (observed vs. predicted, R² &gt;0.85), CCC (&gt;0.90 target), RMSE (&lt;0.10), Coefficient of Residual Mass (near 0).</li>
                    <li><strong className="text-slate-800">Overall:</strong> Cross-validation (split years or sites), ROC-AUC for risk thresholds.</li>
                  </ul>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                    <p className="text-xs font-medium text-slate-700 italic">Threshold for acceptance: Model explains ≥80–85% of observed variability; accurate spray-timing recommendations (reduced applications without increased disease).</p>
                  </div>
                </div>

                {/* 8. Implementation */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Users className="w-5 h-5 text-teal-600" />
                    <h4 className="font-bold text-slate-900">Implementation, Timeline & Resources</h4>
                  </div>
                  <div className="space-y-3 text-sm text-slate-600">
                    <p><strong className="text-slate-800">Tools:</strong> Existing model code for simulations; weather stations (~AUD 2–5k/orchard); lab support for CFU/residue; statistical software (free: R).</p>
                    <div>
                      <strong className="text-slate-800">Timeline (assuming one growing season = Sep–May in WA):</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>Months 1–3: Sensor installation, input calibration, baseline data collection.</li>
                        <li>Months 4–12: Phase 1–2 trials + first-season full validation.</li>
                        <li>Year 2: Multi-site expansion + sensitivity.</li>
                        <li>Year 3: Independent validation + refinement.</li>
                      </ul>
                    </div>
                    <p><strong className="text-slate-800">Team:</strong> Pathologist (disease scoring), agronomist (phenology/orchard measures), modeller (runs), statistician.</p>
                    <div>
                      <strong className="text-slate-800">Challenges & Mitigations:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>WD sensor variability → Multiple sensors + calibration.</li>
                        <li>Bio-efficacy inconsistency → Standardize application conditions; monitor microclimate.</li>
                        <li>Natural variability → Multi-year data + inoculation supplements.</li>
                        <li>Cost → Start with 1–2 pilot orchards; leverage existing grower spray records.</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

export function About() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-12 pb-20 bg-slate-50">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 flex flex-col items-center"
      >
        <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-md mb-2">
          <img src="/logo.png" alt="SentiNut Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">About & Methodology</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          SentiNut is a paddock-first platform for Australian walnut growers — map what you see, plan and log work in the diary,
          track blight protection vs threat, and keep seasonal records by block.
        </p>
      </motion.div>

      {/* Paddock workflow */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-emerald-600" />
          How the farm workflow fits together
        </h2>
        <p className="text-sm text-slate-600 max-w-3xl">
          Day-to-day use is built around blocks on the map and a shared Farm Diary. Specialist pages are thin logging or decision screens on top of that — not separate “control systems.”
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(
            [
              {
                to: '/farm-setup',
                icon: Warehouse,
                title: '1. Farm setup',
                blurb: 'Once: dryers, water allocation (ML), irrigation method. Blocks come from the map.',
              },
              {
                to: '/map',
                icon: Map,
                title: '2. Orchard map',
                blurb: 'Draw blocks, drop issue pins, offline basemap when packed. Issues feed the diary.',
              },
              {
                to: '/diary',
                icon: BookOpen,
                title: '3. Farm diary',
                blurb: 'Plans, sprays, water, nutrition applications, and work — the system of record.',
              },
              {
                to: '/blight',
                icon: Activity,
                title: '4. Blight risk',
                blurb: 'Protection vs threat chart from weather + diary sprays. Forecast, historical, sandbox.',
              },
              {
                to: '/water',
                icon: Droplets,
                title: '5. Water & nutrition',
                blurb: 'Log irrigation and fertiliser applications to the diary. Budget uses Farm setup allocation.',
              },
              {
                to: '/harvest',
                icon: Tractor,
                title: '6. Harvest & drying',
                blurb: 'Yield by block folder; drying sessions pick configured dryers and source block.',
              },
            ] as const
          ).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2">
                <item.icon className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.blurb}</p>
            </Link>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Home shows open issues, plans, and a blight snapshot. Financials and farm management stay under Records / System when you need them.
          Soil lab XLSX import is deferred — Nutrition is an application diary for now.
        </p>
      </section>

      {/* Core Models */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Book className="w-6 h-6 text-indigo-600" />
          Scientific Foundation
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Walnut Blight Forecast Model</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Based on the foundational research of <strong>Dr. Steven Lindow</strong> (UC Berkeley) and <strong>Ji et al.</strong>, 
              which identifies the critical relationship between temperature and leaf wetness duration for 
              <em>Xanthomonas arboricola pv. juglandis</em> infection.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <Snowflake className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Chill Portions (Dynamic Model)</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Implements the <strong>Dynamic Model</strong> developed by <strong>Fishman et al. (1987)</strong>. 
              Unlike simple chill hours, this model accounts for the "cancellation" effect of warm temperatures, 
              providing a more accurate measure of dormancy completion in Mediterranean climates.
            </p>
          </div>
        </div>
      </section>

      {/* Mechanistic Engine */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Microscope className="w-6 h-6 text-emerald-600" />
          Mechanistic Risk Engine
        </h2>
        <div className="bg-slate-900 rounded-3xl p-8 text-slate-300 space-y-8">
          <p className="text-lg font-medium text-white">
            SentiNut enhances standard models with mechanistic layers that simulate the physical environment of your orchard.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider text-xs">
                <Database className="w-4 h-4" />
                Primary Inoculum Dynamics
              </div>
              <p className="text-sm leading-relaxed">
                SentiNut calculates the initial bacterial load residing in dormant buds and catkins before bud break. This "starting line" is driven by the previous season's disease pressure, modified by a winter survival rate, ensuring early-season predictions are accurate for your specific orchard history.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-orange-400 font-bold uppercase tracking-wider text-xs">
                <ThermometerSun className="w-4 h-4" />
                Thermal Latency & Incubation
              </div>
              <p className="text-sm leading-relaxed">
                Infections don't erupt instantly. SentiNut tracks an "Invisible Threat" by placing new infections into a Latency Queue. Using Growing Degree Days (GDD), the model calculates the exact incubation period required before these latent infections erupt into visible, oozing lesions that spread secondary inoculum.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-purple-400 font-bold uppercase tracking-wider text-xs">
                <Zap className="w-4 h-4" />
                Secondary Spread (Exponential Growth)
              </div>
              <p className="text-sm leading-relaxed">
                When latent infections complete their incubation (GDD threshold reached), they erupt into visible lesions. SentiNut injects this new bacterial load back into the active threat pool, driving exponential secondary spread if environmental conditions (temperature, wetness, rain splash) remain favorable.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-xs">
                <Map className="w-4 h-4" />
                Canopy Density Factor (CDF)
              </div>
              <p className="text-sm leading-relaxed">
                The model calculates a CDF based on tree density and canopy closure. This acts as a <strong>Microclimate Modifier</strong>, 
                simulating how dense canopies trap humidity and extend leaf wetness. It also introduces a 
                <strong>Spray Penetration Penalty</strong> for shielded inner nuts.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold uppercase tracking-wider text-xs">
                <Wind className="w-4 h-4" />
                Rain Splash Mechanics
              </div>
              <p className="text-sm leading-relaxed">
                We've implemented a "Splash Multiplier" that simulates bacterial dispersal. The model differentiates 
                between drizzle and downpours, adjusting risk based on the kinetic energy of rain and the 
                "pinball effect" within the canopy.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider text-xs">
                <Droplets className="w-4 h-4" />
                Irrigation Microclimates
              </div>
              <p className="text-sm leading-relaxed">
                The model recognizes that irrigation affects the canopy environment. We account for the specific 
                humidity and wetness signatures of different systems (e.g., Micro-sprinklers vs. Surface Drip), 
                which can trigger infection even without rain.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-purple-400 font-bold uppercase tracking-wider text-xs">
                <Shield className="w-4 h-4" />
                Dynamic Treatment Efficacy
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Chemical Barriers</h4>
                  <p className="text-xs leading-relaxed opacity-80">
                    Chemical treatments are subject to <strong>Rain Washoff</strong> coefficients. The model simulates the physical degradation of the protective layer, where heavy rainfall events accelerate efficacy decay.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Biological Agents</h4>
                  <p className="text-xs leading-relaxed opacity-80">
                    Modeled as a two-step process: <strong>1. The Establishment Phase (Bio-Colonization Efficiency):</strong> The initial survival and colonization rate immediately following the spray event, sensitive to environmental conditions. <strong>2. The Antagonistic Phase (Biological Efficacy):</strong> Once established, how effectively the biological agent suppresses or outcompetes the blight.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Resistance Calibration</h4>
                  <p className="text-xs leading-relaxed opacity-80">
                    Pathogen populations can develop resistance to specific active ingredients. These factors are fully adjustable, allowing the system to degrade the "protection shield" more aggressively in regions where resistance has been scientifically quantified.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Continuous Calibration */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Activity className="w-6 h-6 text-amber-600" />
          Continuous Calibration & Research
        </h2>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
          <p className="text-slate-800 leading-relaxed">
            The mechanistic variables within SentiNut—including the Canopy Density Factor (CDF), Rain Splash Multipliers, and Treatment Decay Rates—are part of a <strong>Living Model</strong>.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Our developers and researchers maintain the capability to fine-tune these parameters as new quantified data emerges from ongoing orchard trials, hyper-local sensor feedback, and academic collaborations. This ensures that the platform's predictive accuracy evolves in lockstep with our deepening understanding of Australian walnut growing areas' unique microclimates and horticultural challenges.
          </p>
        </div>
      </section>

      {/* Local Adaptation */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Info className="w-6 h-6 text-slate-600" />
          Local Adaptation & Phenology
        </h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <h4 className="font-bold text-slate-900">Seasonal Windowing</h4>
              <p className="text-sm text-slate-600">
                Chill accumulation is calculated from <strong>March 1st – September 30th</strong> to align with the 
                Southern Hemisphere cycle and local cultivar requirements.
              </p>
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-bold text-slate-900">Phenological Weighting</h4>
              <p className="text-sm text-slate-600">
                Risk is dynamically adjusted based on the tree's growth stage, with maximum sensitivity 
                during <strong>Bud Break</strong> and <strong>Bloom</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Model Comparison (Expandable) */}
      <ModelComparisonBox />

      {/* Researcher Help Box */}
      <ResearcherHelpBox />

      {/* Researcher Validation Guide */}
      <ResearcherValidationGuide />

      {/* Footer Note */}
      <div className="pt-8 border-t border-slate-200 text-center space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {hasPublishedAppUrl() && (
            <a
              href={getAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Published app
            </a>
          )}
          <a
            href={getShareUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            AI Studio share link
          </a>
        </div>
        {!hasPublishedAppUrl() && (
          <p className="text-xs text-slate-400">
            Not published yet — run locally at{' '}
            <a href="http://localhost:3000" className="text-emerald-600 hover:underline">localhost:3000</a>
            {' '}or publish in AI Studio to get a Cloud Run URL.
          </p>
        )}
        <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
          SentiNut Precision Agriculture Framework • v1.0
        </p>
      </div>
    </div>
  );
}
