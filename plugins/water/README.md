# Water pack

Irrigation diary + seasonal budget. Knobs (`waterAllocationMl`, `irrigationSystemType`) stay on `settings/farm` so blight and diary keep reading them. Delete does not wipe farm settings.

React UI: `src/` (`WaterMonitoring.tsx`, `WaterAllocationPanel.tsx`).

The irrigation fields in the diary composer are **not** part of this pack. `src/components/diary/DiaryComposerWaterFields.tsx` is core UI — the diary offers an irrigation entry type whether or not water is installed.
