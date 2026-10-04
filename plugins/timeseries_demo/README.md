# Dendrometer demo

A learning pack that demonstrates the PUF-AM pack boundary with two years of
deterministic, synthetic readings for two dendrometers.

- No API, InfluxDB, Firebase settings document, or `engine.json`.
- The selected range is stored in the URL and remembered on this device.
- Each normalized series is expressed as millimetres above that sensor's
  minimum in the selected range.
- Replace `demoSeries.ts` with a telemetry client when moving to real data.

The values are demonstration data and must not be interpreted as farm records.

## Open the pack

After starting/rebuilding PUF-AM, a farm admin installs **Dendrometer demo** in
**Settings → Plugins → General**. Open **Crop → Dendrometer demo**, or
`/timeseries-demo`. Existing farmer/viewer accounts need the `timeseries_demo`
module granted under Farm management; installing does not widen their grants.

## What this example owns

- `demoSeries.ts`: fixed, deterministic daily fixture, 2024-09-01 to 2026-08-31
  inclusive (730 dates, two readings each). No current clock or random input.
- `dendrometerSeries.ts`: inclusive filtering, then independent per-sensor minimum
  subtraction. This is **value − minimum**, not division or min/max scaling.
- `TimeSeriesDemo.tsx`: shared date controls and presets, raw chart above normalized.
- `DendrometerChart.tsx`: Recharts rendering, synchronized tooltips, millimetre axes,
  different line styles, and a visible point for one-day selections.
- `useTimeRange.ts`: validated URL parameters and the device-only preference
  `pufam.timeseries_demo.range`. It survives pack removal; it is not farm data.
- `index.ts`: discovered route/navigation registration. Shared adapter, catalog
  entry and module id are the three explicit core registration points.

No telemetry database is read or written. Standard pack Install/Activate/Delete
still uses the platform's existing farm lifecycle. Deleting this pack has no
settings document or sensor history to delete. No `engine.json` is needed for this
simple fixed transformation, and no Firestore rules changes are required.

## Verification

`npm test -- plugins/timeseries_demo/src tests/packRegistry.test.ts`

Manual smoke: install → open → select a date window → verify both charts and zero
minima → refresh to restore the range → deactivate → reactivate → delete.
