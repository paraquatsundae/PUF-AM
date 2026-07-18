import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Book, Microscope, Map, Activity, Snowflake, Droplets, ChevronDown, ChevronUp, AlertTriangle, BookOpen, Tractor, Warehouse, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAppUrl, getShareUrl, hasPublishedAppUrl } from '../lib/appUrl';

function AssumptionsAndLimitsBox() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Assumptions, TRV/CDF, and admin knobs</h2>
              <p className="text-xs text-slate-500">Where the model can run ahead of the evidence</p>
            </div>
          </div>
          {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-6 space-y-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900">TRV → CDF</h3>
                  <p>
                    Code: <code className="text-xs bg-slate-100 px-1 rounded">TRV ≈ height × width × 10000 / rowSpacing</code>,
                    then compressed to 0–1 as CDF. Microclimate modifiers stay <strong>off</strong> when geometry is
                    only the Settings defaults — set height, width, and spacing on the orchard map (or override all
                    three in sandbox) to turn them on. Homemade index, not a validated spray TRV.
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900">What we do <em>not</em> claim vs Ji et al.</h3>
                  <p>
                    We do not run their S1→S4 tissue compartments, Beta/Gompertz infection curves, or cumulative
                    rainfall inoculum mobilisation. Older About copy that said we “translate” Ji into an SEI engine
                    overstated the link. Shared idea only: wetness + temperature matter for Xaj.
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900">Admin settings</h3>
                  <p>
                    <strong>Settings → Advanced</strong> (admin): change blight calibration. Farm dryers / water
                    allocation live under <strong>Farm setup</strong>. Changing model knobs changes curves for
                    everyone on the farm — treat as experiment, not science publication.
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900">Marketing leftovers removed</h3>
                  <p>
                    Claims about research teams, continuous academic recalibration, Penman–Monteith irrigation
                    engines, harvest GDD prediction, and cultivar alerts firing “15% earlier” were not accurate
                    descriptions of the shipped code and have been dropped from this page.
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
          <img src="/logo.png" alt="PUFOM" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">About & Methodology</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          PUFOM (Orchard Manager) is a paddock-first farm tool for Australian walnuts — map blocks, log work in the diary,
          and run simple weather-driven blight and chill views. Built and maintained by one grower-developer,
          not a research lab.
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
                blurb: 'Weather-driven threat index; historical / forecast / sandbox what-ifs.',
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
          Scientific foundation
        </h2>
        <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
          Two weather models sit behind Blight Risk and the map chill readout. They borrow ideas from published
          work; they are <strong>not</strong> peer-reviewed implementations of those papers, and several modifiers
          are engineering judgement for farm use.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Walnut blight (threat index)</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Walnut blight is caused by <em>Xanthomonas arboricola</em> pv. <em>juglandis</em>. Decades of work
              (especially UC programs associated with Lindow and colleagues) show infection risk rises when air
              temperature is in a favourable band <strong>and</strong> leaves stay wet long enough. That
              temperature × wetness idea is the core of what we compute each day.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Inputs:</strong> daily DPIRD summaries (temperature, RH, rainfall, a wetness estimate, max
              hourly rain), optional irrigation logs from the diary, and calendar phenology. The chart plots a
              unitless <em>threat</em> index — useful for comparing days and seasons on this farm, not a CFU or
              lesion count.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Refs (concepts, not a claim that we reproduce their equations): Lindow / UC walnut blight
              extension literature on T × leaf wetness; Ji et al. compartmental modelling of Xaj (recent academic
              HLIR-style work) — our engine is a simpler weather-driven index, not a full S1→S4 tissue model.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <Snowflake className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Winter chill (Dynamic Model)</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Chill portions use the <strong>Dynamic Model</strong> (Fishman / Erez): cool temperatures build an
              intermediate product that can be undone by heat; when enough intermediate accumulates it locks in as
              one chill portion. That needs <strong>hourly</strong> air temperature (°C), not daily averages.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Inputs:</strong> DPIRD hourly temps from the nearest regional anchor station (Manjimup,
              Pemberton, Balingup, Donnybrook — same shortlist blight uses by default). Season window{' '}
              <strong>1 Mar – 30 Sep</strong> Australia/Perth. Cultivar targets: UCANR Dynamic Model table where
              published (Chandler, Hartley, Payne); Franquette from Luedeling et al. (2009); other cultivars are
              labelled estimates.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Refs: Fishman, Erez & Couvillon (1987); UCANR Fruit &amp; Nut Chill Portions table; Luedeling et al.
              (2009) walnut phenology / chill estimates.
            </p>
          </div>
        </div>
      </section>

      {/* How blight works */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Microscope className="w-6 h-6 text-emerald-600" />
          How the blight engine works
        </h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 text-sm text-slate-600 leading-relaxed">
          <p>
            Each day the model builds a <strong>daily infection pressure</strong> from weather, then folds it into
            a running threat score with a short memory (threat decays ~15% per day, then adds new pressure). That is
            intentional smoothing so one wet day does not dominate the chart forever.
          </p>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900">Core weather factors (always on)</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Temperature:</strong> higher weight when daily mean is roughly 12–24 °C; half weight outside
                that band (simple step, not a fitted Beta curve).
              </li>
              <li>
                <strong>Wetness:</strong> only contributes once estimated leaf wetness duration exceeds 8 hours;
                then scales with how far above 8 h it goes.
              </li>
              <li>
                <strong>Humidity:</strong> slight bump when RH &gt; 85%.
              </li>
              <li>
                <strong>Rain intensity:</strong> max hourly rain scales a splash multiplier (gentle rain ≈ 1.1×,
                heavier bursts up to 2×) — a dispersal heuristic, not measured splash kinetics.
              </li>
              <li>
                <strong>Phenology:</strong> coarse SH calendar (May–Aug dormant ×0.1, Sep bud break ×1.5, Oct bloom ×2,
                Nov–Jan post-bloom ×1, Feb–Apr shell hardening ×0.3). Forecast / Historical use that schedule.
                Optional <em>Scouted override</em> on Blight Risk applies from today forward only; Sandbox can lock a
                stage for what-ifs. Not diary-persisted scouting yet.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900">Why we added modifiers</h3>
            <p>
              Open-air stations under-read how wet and humid a dense canopy can stay. Irrigation can wet foliage
              with no rain. Sprays (in sandbox) lose effect over time. The modifiers below are there to nudge the
              index in those directions — they are <strong>tunable assumptions</strong>, not validated WA trials.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>TRV → CDF (canopy size):</strong> Off unless the map block has explicit tree height,
                canopy width, <em>and</em> row spacing (or sandbox sets all three). Then we compute a rough TRV-style
                number and nudge RH / wetness / splash. Not a certified spray-volume calculator and not tied to
                in-canopy sensors.
              </li>
              <li>
                <strong>Irrigation type:</strong> On days with a diary irrigation event, micro-sprinklers add the
                most artificial RH/wetness; drip adds little; subsurface adds none. Meant to stop “dry station, wet
                foliage” days looking risk-free.
              </li>
              <li>
                <strong>GDD latency / secondary (experimental):</strong> Off on Forecast and Historical. In
                Sandbox you can optionally queue new infection pressure until enough growing degree-days
                accumulate, then add a secondary bump. Threshold and multiplier are defaults, not fitted to WA
                lesion data — treat as a what-if, not a field-validated latency model.
              </li>
              <li>
                <strong>Initial threat floor:</strong> Threat starts from a small calibration number (default 0.02).
                Weather rebuilds the curve from there. It is <em>not</em> last year’s disease map or bud CFU.
              </li>
              <li>
                <strong>Chemical / biological protection:</strong> Decay, rain washoff, application-method
                penalties, and efficacy % knobs exist only for the <strong>sandbox / what-if</strong> chart
                (Settings labels them as such). Forecast and Historical stay weather-driven. Diary sprays are
                timeline markers — not proof that copper or bio delivered the modelled % control in the field.
                Defaults are placeholders for scenario comparison, not MIC or rainfastness assays.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 text-xs leading-relaxed">
            <strong>Honest limit:</strong> The number on the chart is a decision aid for this orchard’s weather
            pattern. It is not a lab assay, not regulatory advice, and not a claim that we implemented Ji et al.
            or UC models equation-for-equation.
          </div>
        </div>
      </section>

      {/* Tuning */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Activity className="w-6 h-6 text-amber-600" />
          Tuning (not a research programme)
        </h2>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-3">
          <p className="text-sm text-slate-800 leading-relaxed">
            Admin users can change blight calibration knobs under <strong>Settings → Advanced</strong> (CDF
            weighting, splash, experimental latency multipliers, efficacy defaults, tree geometry for TRV, etc.).
            Those knobs exist so we can experiment on-farm.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            There is no separate research team, no continuous academic collaboration loop, and no automated
            re-fit against lesion surveys. If a parameter changes, it is because someone on this farm changed it
            on purpose.
          </p>
        </div>
      </section>

      {/* Local adaptation */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Info className="w-6 h-6 text-slate-600" />
          Local adaptation & phenology
        </h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">WA weather</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Blight uses DPIRD <strong>daily</strong> station summaries (cached). Chill uses DPIRD{' '}
                <strong>hourly</strong> temperatures for the same regional anchors. Station choice defaults to the
                nearest of Manjimup / Pemberton / Balingup / Donnybrook to the farm map centre — not an on-block
                sensor unless you later wire one.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">Chill season</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Chill portions accumulate only in <strong>1 Mar – 30 Sep</strong> (Perth). Outside that window the
                UI shows the completed season total. Cultivar requirements are a lookup table, not measured rest
                completion on your trees.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">Blight phenology</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Forecast / Historical use a fixed Southern-Hemisphere month table (not GDD phenology, not
                scouting): May–Aug dormant, Sep bud break, Oct bloom, Nov–Jan post-bloom, Feb–Apr shell
                hardening. On Blight Risk you can set a temporary <strong>Scouted override</strong> from today
                forward; past Historical days stay on the calendar. Persisting scouted stages in the diary is
                a later step. Sandbox still locks one stage for what-ifs.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">Block geometry</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Tree height, canopy width, and row spacing feed the TRV/CDF estimate. If those map fields are
                wrong or left at defaults, canopy modifiers are guesswork on top of station weather.
              </p>
            </div>
          </div>
        </div>
      </section>

      <AssumptionsAndLimitsBox />

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
        <p className="text-xs text-slate-400">
          PUFOM · PUF workshop · farm software, not a published scientific product
        </p>
      </div>
    </div>
  );
}
