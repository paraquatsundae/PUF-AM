/** Counting rule, kept next to the scout so the numbers stay honest. */
export function WheatYieldScience() {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-2 text-sm text-slate-600 min-w-0">
      <h2 className="text-sm font-semibold text-slate-800">How the count works</h2>
      <p>Count one side of the head only. Grains per head = height × width × 2. Ten sockets by four grains is 80 grains.</p>
      <p>Several square-metre counts are averaged. Hectolitre weight, the deduction, area, and a weighed thousand-grain weight apply once to the paddock.</p>
      <p>WA milling floor default is 74 kg/hL, which estimates 40 g per thousand grains. A weighed thousand-grain weight above zero replaces that estimate. Half a litre of grain weighs hectolitre × 5 grams (74 kg/hL is 370 g).</p>
      <p>Tonnes per hectare = heads/m² × grains/head × milligrams per grain / 100,000, then take off the deduction. That deduction is the low ground you did not walk, not a measured loss.</p>
    </section>
  );
}
