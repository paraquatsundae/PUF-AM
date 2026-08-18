import React from 'react';
import { Link } from 'react-router-dom';
import { Map, Activity, BookOpen, Tractor, Warehouse, ExternalLink, Droplets } from 'lucide-react';
import { motion } from 'motion/react';
import { getAppUrl, hasPublishedAppUrl } from '../lib/appUrl';
import { APP_BLURB, APP_FULL_NAME, APP_LOGO_SRC, APP_NAME, APP_WORKSHOP } from '../brand';
import { useWalnutPack } from '../hooks/useWalnutPack';

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
          <img src={APP_LOGO_SRC} alt={APP_NAME} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
            methodology under Blight risk. It unlocks when Farm setup has orchard/tree + walnut, or a map area
            is marked walnut. Until then, invite PIN presets and Farm modules hide blight so workers never see
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
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Walnut pack science</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            How the blight engine and chill model work, what is farm-tunable, and where the numbers can run
            ahead of the evidence live with the pack on{' '}
            <Link to="/blight" className="font-semibold text-emerald-700 hover:underline">
              Blight risk → Engine science &amp; limits
            </Link>
            .
          </p>
        </section>
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
        </div>
        {!hasPublishedAppUrl() && (
          <p className="text-xs text-slate-400">
            Not published yet — run locally at{' '}
            <a href="http://localhost:3000" className="text-emerald-600 hover:underline">localhost:3000</a>.
          </p>
        )}
        <p className="text-xs text-slate-400">
          {APP_NAME} · {APP_WORKSHOP} workshop · farm software, not a published scientific product
        </p>
      </div>
    </div>
  );
}
