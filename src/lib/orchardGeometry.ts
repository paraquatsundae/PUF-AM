/**
 * Fallback tree geometry for a block nobody has measured yet.
 *
 * The map derives canopy coverage and tree row volume for its heat, moisture
 * and yield colours, so a block with blank geometry still needs numbers. These
 * are the farm-shaped ones — a mature orchard on standard rows.
 *
 * The walnut blight pack ships the same three figures in its `engine.json`
 * `modelDefaults`, and that is deliberate rather than a duplicate to fold
 * together: those are research-tunable inputs to a disease model, while these
 * are what core draws when a block is blank. A pack retuning its model must not
 * silently repaint the map.
 */
export const DEFAULT_ORCHARD_GEOMETRY = {
  /** Metres, canopy top. */
  treeHeight: 4.5,
  /** Metres, across the row. */
  canopyWidth: 4.0,
  /** Metres, row centre to row centre. */
  rowSpacing: 7.0,
} as const;
