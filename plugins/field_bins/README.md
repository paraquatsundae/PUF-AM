# Field bins pack

Field-menu pack. Place a field-bin pin on the Farm Map. Capacity, crop label, chasers, trucks, and movements live here.

`settings/field_bins` holds vehicles and per-pin capacity. Each trip is `field_bin_movements/{id}`. Delete wipes both. The pin stays.

Tonnes and moisture arithmetic is `shared/farm/fieldBinStock.ts` so the map card can show fill without core importing this folder. v1 does not keep a balance on the truck or chaser. See `Plans/FIELD_BINS_PLUGIN.md`.
