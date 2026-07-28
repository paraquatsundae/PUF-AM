import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Book, Microscope, Map, Activity, Snowflake, Droplets, ChevronDown, ChevronUp, AlertTriangle, BookOpen, Tractor, Warehouse, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAppUrl, getShareUrl, hasPublishedAppUrl } from '../lib/appUrl';
import { APP_BLURB, APP_FULL_NAME, APP_NAME, APP_WORKSHOP } from '../brand';
import { useWalnutPack } from '../hooks/useWalnutPack';

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
                    only the Settings defaults — set height, width, and spacing on the farm map (or override all
                    three in sandbox) to turn them on. Homemade index, not a validated spray TRV.
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900">What we do and do <em>not</em> take from Ji et al.</h3>
                  <p>
                    Forecast / Historical <strong>do</strong> run Ji's Beta temperature curve, Gompertz
                    leaf-wetness curve, and cumulative-rainfall primary inoculum with the published coefficients.
                    We <strong>do not</strong> run their full S1→S4 tissue compartments or the 15–21 day incubation
                    / secondary-inoculum stages yet — so we show daily infection risk, not symptom onset or lesion
                    severity. Our leaf wetness is also a rain/RH proxy, not a sensor or the mean wet-period
                    temperature the paper prefers.
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
  const hasWalnutPack = useWalnutPack();

  const workflowItems = (
    [
      {
        to: '/farm-setup',
        icon: Warehouse,
        title: '1. Farm setup',
        blurb: 'Once: dryers, water allocation (ML), irrigation method. Areas come from the map.',
        walnutOnly: false,
      },
      {
        to: '/map',
        icon: Map,
        title: '2. Farm map',
        blurb:
          'Draw areas, drop issue pins, offline basemap when packed. Crew can share live GPS on the map when online (Settings → Privacy). Issues feed the diary.',
        walnutOnly: false,
      },
      {
        to: '/diary',
        icon: BookOpen,
        title: '3. Farm diary',
        blurb: 'Plans, sprays, water, nutrition applications, and work — the system of record.',
        walnutOnly: false,
      },
      {
        to: '/blight',
        icon: Activity,
        title: '4. Blight risk',
        blurb: 'Walnut crop pack: weather-driven threat index; historical / forecast / sandbox.',
        walnutOnly: true,
      },
      {
        to: '/water',
        icon: Droplets,
        title: hasWalnutPack ? '5. Water & nutrition' : '4. Water & nutrition',
        blurb: 'Log irrigation and fertiliser applications to the diary. Budget uses Farm setup allocation.',
        walnutOnly: false,
      },
      {
        to: '/harvest',
        icon: Tractor,
        title: hasWalnutPack ? '6. Harvest & drying' : '5. Harvest & drying',
        blurb: 'Yield by area folder; drying sessions pick configured dryers and source area.',
        walnutOnly: false,
      },
    ] as const
  ).filter((item) => !item.walnutOnly || hasWalnutPack);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-12 pb-20 bg-slate-50">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 flex flex-col items-center"
      >
        <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-md mb-2">
          <img src="/logo.png" alt={APP_NAME} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">About & Methodology</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          {APP_FULL_NAME} — {APP_BLURB}{' '}
          {hasWalnutPack
            ? 'This farm has the walnut crop pack on (blight risk and chill).'
            : 'Orchard, broadacre, grazing, hort, and aquaculture share the same map → diary loop; crop packs unlock only when that enterprise is configured.'}{' '}
          Built and maintained by one grower-developer, not a research lab.
        </p>
      </motion.div>

      {/* Paddock workflow */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-emerald-600" />
          How the farm workflow fits together
        </h2>
        <p className="text-sm text-slate-600 max-w-3xl">
          Day-to-day use is built around areas on the map and a shared Farm Diary — the same loop whether you run
          tree crops, paddocks, water zones, or dams. Specialist pages (water, harvest, optional crop packs) are
          thin logging or decision screens on top of that, not separate control systems.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {workflowItems.map((item) => (
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
          {hasWalnutPack
            ? 'Home shows open issues, plans, and a blight snapshot. Financials and farm management stay under Records / System when you need them.'
            : 'Home shows open issues and plans. Financials and farm management stay under Records / System when you need them.'}{' '}
          Soil lab XLSX import is deferred — Nutrition is an application diary for now.
        </p>
      </section>

      {!hasWalnutPack && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Optional crop packs</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            The first deep pack is <strong>walnut</strong>: blight risk, winter chill targets, and Ji-model
            methodology on this page. It unlocks when Farm setup has orchard/tree + walnut, or a map area is
            marked walnut. Until then, invite PIN presets and Farm modules hide blight so workers never see
            walnut-only tools.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Turn it on in{' '}
            <Link to="/farm-setup" className="font-semibold text-emerald-700 hover:underline">
              Farm setup
            </Link>
            {' '}
            (enterprises / default species) or when naming a paddock as walnut on the map.
          </p>
        </section>
      )}

      {hasWalnutPack && (
      <>
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
            <h3 className="text-lg font-bold text-slate-900">Walnut blight (Ji et al. 2025 infection risk)</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Walnut blight is caused by <em>Xanthomonas arboricola</em> pv. <em>juglandis</em>. The{' '}
              <strong>Forecast and Historical</strong> charts now run the mechanistic model of{' '}
              <strong>Ji et al. 2025</strong> (<em>Plant Disease</em> 109:1130–1141): primary inoculum builds from
              cumulative rain after budbreak, and each day's infection rate is a Beta temperature curve × a Gompertz
              leaf-wetness curve. Published coefficients are frozen; only the orchard inoculum modifier{' '}
              <em>k</em> is farm-tunable.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Inputs:</strong> daily DPIRD summaries (temperature, RH, rainfall), a leaf-wetness{' '}
              <em>estimate</em> (rain + humidity proxy until we have hourly or on-orchard wetness sensors), and a
              Southern-Hemisphere budbreak date (1 Sep) that resets primary inoculum each season. Output is Ji's
              unitless daily infection risk — useful for spotting infection periods, not a CFU or lesion count.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ref: Ji et al. 2025, DOI 10.1094/PDIS-09-24-1850-RE (Adaskaveg 1998 Beta/Gompertz fits). Our
              <strong> wetness input is a proxy</strong>, so treat absolute values as relative until validated with
              WA scouting. The <em>Sandbox</em> tab is a separate legacy weather index (see below) for what-ifs,
              not the Ji model.
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
          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900">Forecast / Historical — Ji et al. 2025</h3>
            <p>
              These two charts run the mechanistic Ji model. Each day it computes an infection rate as{' '}
              <strong>f(T) × f(WD)</strong> — a Beta temperature response (zero below 10 °C or above 24 °C) times a
              Gompertz leaf-wetness response — and multiplies it by the primary inoculum available that day. Primary
              inoculum grows with cumulative rain after budbreak (1 Sep) and resets each season, so a wet spring loads
              more inoculum than a dry one. There is no artificial decay/smoothing and no spray armour on these charts.
            </p>
            <p>
              <strong>Weather source:</strong> past days use observed DPIRD station data; the Forecast tab extends up to
              ~9 days ahead with the <strong>MET Norway</strong> Locationforecast (the same forecast source DPIRD's own
              tooling uses — DPIRD's public API is observations-only). Forecast days are marked on the chart and run
              through the identical model as observed days. If the forecast is unavailable we fall back to short-range
              persistence (last observation carried forward), clearly labelled as such.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Temperature:</strong> fitted Beta curve (Adaskaveg 1998), peaking in the high-teens, zero
                outside 10–24 °C. Uses daily mean temperature (the paper prefers mean temperature during the wet
                period — a refinement we have not made yet).
              </li>
              <li>
                <strong>Leaf wetness:</strong> Gompertz curve over estimated wet hours. Wetness is a proxy from rain
                and humidity until hourly / on-orchard sensors land.
              </li>
              <li>
                <strong>Primary inoculum:</strong> <em>k</em>(1 − 0.916<sup>ΣR</sup>) from budbreak; <em>k</em> is the
                only farm-tunable term. Set it in <strong>Settings → Advanced → Orchard inoculum</strong> as
                Low / Medium / High (0.5× / 1.0× / 2.0×) from prior-season blight or bud CFU — Medium is the baseline.
                These multipliers are workshop defaults until bud-CFU calibration. Incubation (15–21 day symptom lag)
                is shown as a scouting overlay; Ji's secondary-inoculum stage is not modelled yet.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900">Sandbox — legacy weather index (what-if only)</h3>
            <p>
              The Sandbox tab keeps the older multiplicative weather index (legacy sandbox / pre–Ji path) for scenario play. It builds a daily
              infection pressure from the factors below and folds it into a running threat score with a short memory
              (~15% decay per day). This is <strong>not</strong> the Ji model and is not used on Forecast or Historical.
            </p>
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
                Nov–Jan post-bloom ×1, Feb–Apr shell hardening ×0.3). Optional <em>Scouted override</em> applies from
                today forward only; Sandbox can lock a stage for what-ifs. Not diary-persisted scouting yet.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900">Sandbox modifiers</h3>
            <p>
              Open-air stations under-read how wet and humid a dense canopy can stay. Irrigation can wet foliage
              with no rain. Sprays (in sandbox) lose effect over time. The modifiers below nudge the{' '}
              <strong>Sandbox</strong> index in those directions — they are <strong>tunable assumptions</strong>,
              not validated WA trials, and do not affect the Ji Forecast / Historical charts.
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
                <strong>Initial threat floor:</strong> Legacy <em>Sandbox</em> index only — threat starts from a small
                calibration number (default 0.02) and weather rebuilds the curve. The Ji Forecast/Historical charts
                do not use it; their primary inoculum comes from the Orchard inoculum (k) setting instead.
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
            <strong>Honest limit:</strong> Forecast / Historical reproduce Ji et al. 2025's infection-rate equations,
            but on a <strong>proxy wetness input</strong> and without their incubation / secondary-inoculum stages,
            and with no local scouting calibration yet. Treat the number as a relative decision aid for this farm's
            weather — not a lab assay, lesion forecast, or regulatory advice.
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
      </>
      )}

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
          {APP_NAME} · {APP_WORKSHOP} workshop · farm software, not a published scientific product
        </p>
      </div>
    </div>
  );
}
