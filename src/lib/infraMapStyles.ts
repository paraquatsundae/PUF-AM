/**
 * Leaflet path styling for infrastructure area fills (water / hatch / gravel).
 * Patterns are SVG defs injected once into the document; CSS classes reference them.
 */
import type { Path } from 'leaflet';
import {
  getInfraType,
  infraFillPattern,
  type InfraFillPattern,
} from '../../shared/farm/infraTypes';

const PATTERN_CLASS: Record<InfraFillPattern, string> = {
  water: 'pufam-fill-water',
  hatch: 'pufam-fill-hatch',
  gravel: 'pufam-fill-gravel',
};

const ALL_PATTERN_CLASSES = Object.values(PATTERN_CLASS);

/** Hidden SVG defs — fill:url(#…) resolves across the document for Leaflet paths. */
export const PUFAM_FILL_PATTERN_SVG = `
<svg id="pufam-fill-pattern-defs" width="0" height="0" aria-hidden="true" style="position:absolute;overflow:hidden;left:-9999px;top:-9999px">
  <defs>
    <pattern id="pufam-pattern-water" patternUnits="userSpaceOnUse" width="18" height="12">
      <rect width="18" height="12" fill="#0369a1" fill-opacity="0.55"/>
      <path d="M0 3 Q4.5 0 9 3 T18 3" fill="none" stroke="#7dd3fc" stroke-width="1.4" stroke-opacity="0.95"/>
      <path d="M0 9 Q4.5 6 9 9 T18 9" fill="none" stroke="#bae6fd" stroke-width="1.2" stroke-opacity="0.85"/>
    </pattern>
    <pattern id="pufam-pattern-hatch" patternUnits="userSpaceOnUse" width="10" height="10">
      <rect width="10" height="10" fill="#9a3412" fill-opacity="0.45"/>
      <path d="M0 10 L10 0 M-2 2 L2 -2 M8 12 L12 8" stroke="#fecaca" stroke-width="1.5" stroke-opacity="0.9"/>
    </pattern>
    <pattern id="pufam-pattern-gravel" patternUnits="userSpaceOnUse" width="12" height="12">
      <rect width="12" height="12" fill="#a8a29e" fill-opacity="0.5"/>
      <circle cx="2" cy="3" r="1.1" fill="#57534e" fill-opacity="0.75"/>
      <circle cx="7" cy="8" r="1.3" fill="#78716c" fill-opacity="0.7"/>
      <circle cx="10" cy="2" r="0.9" fill="#44403c" fill-opacity="0.65"/>
      <circle cx="4" cy="10" r="0.8" fill="#57534e" fill-opacity="0.7"/>
    </pattern>
  </defs>
</svg>
`.trim();

export const PUFAM_FILL_PATTERN_CSS = `
path.pufam-fill-water {
  fill: url(#pufam-pattern-water) !important;
  fill-opacity: 0.88 !important;
  stroke: #0369a1 !important;
  stroke-width: 2 !important;
}
path.pufam-fill-hatch {
  fill: url(#pufam-pattern-hatch) !important;
  fill-opacity: 0.85 !important;
  stroke: #9a3412 !important;
  stroke-width: 2 !important;
}
path.pufam-fill-gravel {
  fill: url(#pufam-pattern-gravel) !important;
  fill-opacity: 0.8 !important;
  stroke: #78716c !important;
  stroke-width: 2 !important;
  stroke-dasharray: 4 3 !important;
}
`;

export function infraPolygonPathStyle(type: string | undefined | null): {
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
  className?: string;
  dashArray?: string;
} {
  const def = getInfraType(type);
  const color = def?.color || '#0284c7';
  const pattern = infraFillPattern(type);
  if (pattern) {
    return {
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2,
      className: PATTERN_CLASS[pattern],
      dashArray: pattern === 'gravel' ? '4 3' : undefined,
    };
  }
  return {
    color,
    fillColor: color,
    fillOpacity: 0.35,
    weight: 2,
  };
}

/** Apply pattern class to an existing Leaflet path (className is init-only in Leaflet). */
export function applyInfraPolygonPattern(layer: Path, type: string | undefined | null): void {
  const style = infraPolygonPathStyle(type);
  layer.setStyle({
    color: style.color,
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity,
    weight: style.weight,
    dashArray: style.dashArray || '',
  });
  const el = layer.getElement?.() as SVGElement | undefined;
  if (!el) return;
  for (const c of ALL_PATTERN_CLASSES) el.classList.remove(c);
  if (style.className) el.classList.add(style.className);
}
