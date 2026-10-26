# Field bins

**Product:** PUF-AM — Ag Manager
**Status:** v1 built — Clear empties a silo, truck, or chaser. A fuller vehicle balance screen is still later
**Date:** 2026-10-23
**Authoring:** [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md). Copy the drying pack’s shape (asset list + movements), not its moisture curve. Map pins follow the sensors pack: geometry stays in core, the pack owns the records.

Track grain in and out of field bins (silos standing in a paddock). Chasers and trucks both move loads either way. The page shows how full every bin is and the average moisture of what is in it.

**Decision — 2026-10-25:** Quantities are tonnes. The page stays on the Field menu. A chaser and a truck are the same kind of trip: either can tip grain into a field bin or take grain out, and the amount is a percent of a load. The operator chooses the base of that percent for each line — the field bin’s current tonnes, or that vehicle’s capacity.

**Decision — 2026-10-25 (later):** Chasers and trucks need a running tonne balance and moisture, same mixed rule as a field bin. Not in v1. Movements stay the record so that balance can be added without a second log.

**Decision — 2026-10-25 (page):** The Field bins page is the map. The operator picks the paddock they are working in, drops a field-bin pin with one tap, and taps that pin to tip grain in or take it out. Storage status is a button on the map, and the pin popup has its own bin-status button. One tap logs one bin. A blend across bins is several taps. The farm map still shows the same pins.

**Decision — 2026-10-25 (chaser screen):** A Map / Chaser toggle. Chaser is a separate view with no map. Field bins are large squares whose names the farmer can edit. The load is 1/4, 1/2, 3/4, or 4/4 of the chaser, shown on a fill bar, or a tonne figure when that chaser has scales. Moisture is a large keypad. The operator sets the load and the moisture, then taps the bin being filled. That tap writes one inward movement.

**Decision — 2026-10-26 (truck):** A truck has a name and one or more trailers, each with its own capacity in tonnes. The truck’s stored capacity is the sum of those trailers. A truck load is one outward movement. Each line is a percent of one trailer, drawn from a field bin. Percents on one trailer add up to at most 100. The same bin may feed more than one trailer, and the tonnes drawn from that bin are added together. The movement stores the tonne-weighted moisture of the whole truck. The Truck tab holds this structure; the screen layout comes later.

**Decision — 2026-10-26 (profiles):** A chaser profile stores its name and capacity. A truck profile stores its name, how many trailers it has, each trailer’s capacity, and a colour. Saving the profile writes that vehicle. On the truck page the load starts from a large button for each saved truck: the name, the colour, and a block for the cab and each trailer. The load does not retype the profile.

**Decision — 2026-10-26 (bins page):** A Bins tab sits with Map, Chaser, and Truck. Each bin is drawn as a cone-bottom field silo: the grain level is its share of capacity, and the colour tracks moisture. Selecting a silo shows that bin’s loads. Selecting a paddock shows the loads for the bins standing in it, with a daily in/out line. A load that also used another bin says so. Paddock is wherever the pin sits now. The figures come from the same movements.

**Decision — 2026-10-26 (mode order):** The switch runs Map, Bins, Chaser, Truck.

**Decision — 2026-10-26 (bin capacity):** On the Bins tab the capacity figure opens the keypad. Empty Enter keeps the previous capacity. A capacity below the grain already in the bin is refused. Capacity stays editable because one bin volume weighs differently for canola, wheat, barley, and oats.

**Decision — 2026-10-26 (fill level):** The tonnes filled, on the same tab, open the keypad and set that bin's level. Moisture already on the grain stays. Setting the level to zero clears the moisture. A level above the bin's capacity is refused. The same keypad has 100%, which sets the level to that bin's capacity. A full bin draws up to the 4/4 mark. The set is its own history row and is not counted as a load in or out.

**Decision — 2026-10-26 (bin moisture):** On the Bins tab the moisture figure opens the keypad and sets that bin's moisture. An empty bin is refused. The set replaces the average already on the grain, and later loads in still mix with it. It is its own history row and is not counted as a load in or out.

**Decision — 2026-10-26 (truck blend):** On the Truck tab, Recommended blend loads the selected truck the way a blend is pulled. Trailer 1 goes to the first bin that has grain and a moisture and takes that bin's share of the truck. The share is that bin's part of the grain on hand, which sets the mix moisture. The next bin finishes trailer 1 or, when trailer 1 is already full, starts the next trailer, and so on. A bin with grain and no moisture is left out. Use this blend copies those percents into the load, which can still be changed before it is recorded. This is not a saved recipe.

**Decision — 2026-10-26 (clear):** Each silo, truck, and chaser has a Clear button, and it asks before it empties anything. A silo clear is one outward movement that zeroes that bin; earlier loads stay in the history. A truck or chaser clear zeroes the tonnes replayed onto that vehicle and does not put grain back into a bin. A load still being entered on screen is cleared too.

## What v1 is

A crop pack, opt-in from Settings → Plugins.

| Piece | Value |
|-------|--------|
| Pack id | `field_bins` |
| Module | `field_bins` (in `WORK_MODULES`, so a field crew PIN can log loads) |
| Kind / category | `crop_pack` / `generic` |
| Menu | Field, `/field-bins` |
| Settings doc | `farms/{farmId}/settings/field_bins` |
| Movements | `farms/{farmId}/field_bin_movements/{id}` |

Field, not Crop → Plan. A field bin is a place you drive up to, same as a sensor pin. Deactivate hides the page. Delete wipes the settings doc and the movements. The map pins stay.

No `engine.json`. The arithmetic is `shared/farm/fieldBinStock.ts` (tested), so the map card can show fill without core importing the pack.

## Three lists

**Field bin** — sits in a paddock. New map pin type `field_bin` (point). The pin keeps the name, the lat/lng, and the notes. The pack keeps the capacity in tonnes and the movements, keyed by that pin id. On the Field bins page, Drop bin then a tap places it. The same pin can still be drawn from Farm Map → Infrastructure. Capacity is asked for the first time the pin is tapped. The pin editor on the farm map still edits it too.

**Chaser** and **truck** — not map pins. Two short lists, same idea as the dryer list: name and capacity in tonnes, both editable. A chaser is one cart load. A truck is one delivery load. v1 does not keep a running balance on the vehicle. Grain arrives from the harvester outside this pack; the operator says what percent of that load was tipped. A later version will track what is sitting on each chaser and truck (tonnes and average moisture) from these same movements.

## Tonnes and moisture

Stored unit is tonnes. There is no cubic-metre conversion and no test weight.

A field bin is treated as mixed. Grain added updates the average. Grain taken out does not: what remains has the same average it had before the vehicle left.

- Filled = sum of tonnes in, minus sum of tonnes out. Never below 0. A transfer that would pass capacity, or take more than is in the bin, is refused.
- Average moisture (%) = tonne-weighted mean of the grain still in the bin. An empty bin shows no average.
- Shrinking capacity below the current fill is refused.
- Notes are the pin notes, shown again on the bin page.

Paddock name on a bin is whichever paddock polygon contains the pin. A pin in none of them shows no paddock. The page’s “Working in” control only frames the map. It does not assign a paddock by hand.

## A transfer

One movement names a vehicle (a chaser or a truck), a direction, and one or more field bins. The page records one bin per tap. The movement can still hold several lines if a later screen sends them.

- **In** — vehicle tips into the field bins.
- **Out** — field bins load the vehicle.

Each line is a percent from 0 to 100, and a base:

- **Percent of the bin** — percent of that field bin’s current tonnes. Lines are independent. 20% of bin 1 and 80% of bin 3 do not have to add to 100.
- **Percent of the load** — percent of that vehicle’s capacity. Lines on one movement share one load and must sum to at most 100%.
- **Percent of a trailer** — percent of that trailer’s capacity. Used on a truck load. Lines on one trailer sum to at most 100%. A bin can appear on more than one trailer.

Tonnes on a line are that percent times the chosen base. Confirming writes one movement line per bin.

Moisture is recorded on the way **in** to a field bin (one percent for the load, applied to each line of that trip). On the way **out**, the bin average is unchanged, and the vehicle’s mix for that trip is the tonne-weighted average of the bins it took from. That figure is shown on the movement. v1 does not store it as a balance on the vehicle.

Example, percent of the bin. Bin 1 holds 100 t at 14%. Bin 3 holds 50 t at 10%. Take 20% of bin 1 and 80% of bin 3 onto a truck. The truck gets 20 t + 40 t = 60 t at (20×14 + 40×10) / 60 = 11.3%. Bin 1 is left with 80 t at 14%. Bin 3 is left with 10 t at 10%.

Example, percent of the load. The same truck has a capacity of 40 t. 20% of the load from bin 1 and 80% from bin 3 is 8 t + 32 t. The truck is at (8×14 + 32×10) / 40 = 10.8%. A chaser uses the same two bases, in either direction.

Example, percent of a trailer. Trailer A is 30 t and trailer B is 20 t. Trailer A takes 50% from bin 1 and 50% from bin 3. Trailer B takes 100% from bin 1. The truck loads 15 t + 15 t + 20 t = 50 t at (15×14 + 15×10 + 20×14) / 50 = 12.8%. Bin 1 gives up 35 t. Bin 3 gives up 15 t.

## Summary

The Field bins page is a map with a Map / Chaser / Truck switch, the paddock being worked, Drop bin, and Storage. Storage opens every field bin:

- name, paddock, notes
- capacity (t), filled (t), fill %
- average moisture
- optional crop label (free text, one per bin, so wheat and canola are not the same row with no name)

Chasers and trucks are on that same storage sheet: name and capacity (t). No file export in v1.

Tapping a field bin opens the in/out popup for that bin only. It sits along the bottom so the pin stays visible, and it has a Bin status button for holding, fill, moisture, and notes. Operate mode on the farm map still shows fill, average moisture, and notes without covering the pin.

## Later

A running balance on each chaser and each truck: tonnes on board, fill against capacity, and average moisture, updated from the same movements. Loading the vehicle adds tonnes and shifts its average. Tipping into a field bin takes tonnes off the vehicle. An empty vehicle shows no average. v1 only records the trip.

## Not in v1

- The vehicle balance above
- Test weight, protein, temperature, or a drying curve
- Unmixed layers, or taking one historical load back out
- A saved blend recipe
- Harvest-record links, moisture probes, or live sensors
- A coverage circle
