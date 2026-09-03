/**
 * Chill pack science / honesty copy — Dynamic Model + calculator port.
 */
export function ChillEngineSciencePanel() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-3 text-sm text-slate-600 leading-relaxed">
      <h2 className="text-base font-bold text-slate-900">Dynamic Model (chill portions)</h2>
      <p>
        Farm totals use the Fishman / Erez Dynamic Model on <strong>observed DPIRD hourly</strong>{' '}
        temperatures for the Southern Hemisphere window (1 Mar – 30 Sep, Australia/Perth). Model
        constants and cultivar targets ship in the chill pack{' '}
        <code className="text-xs bg-slate-100 px-1 rounded">engine.json</code>.
      </p>
      <p>
        The <strong>daily calculator</strong> is the standalone Chill Portion Calculator: daily Tmax /
        Tmin, a solar day-length hourly curve, then the same Dynamic Model. That path does not need
        a DPIRD key — paste a CSV or type rows.
      </p>
      <p className="text-xs text-slate-500">
        Utah model and classic chill hours are not implemented. Cultivar CP targets are UCANR /
        Luedeling citations where published; unmarked rows are estimates.
      </p>
    </section>
  );
}
