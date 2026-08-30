/**
 * Point-pin DivIcon + tooltip HTML for OrchardMap infrastructure markers.
 */
import L from './leaflet-setup';
import { getInfraType } from '../../shared/farm/infraTypes';
import type { InfrastructurePin } from './mapStore';
export { getPinTooltipHtml } from './mapPinTooltip';

const DEFAULT_PIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

export function getPinDivIcon(pin: InfrastructurePin): L.DivIcon {
  const def = getInfraType(pin.type);
  let svg = DEFAULT_PIN_SVG;
  let colorClass = 'text-slate-500 bg-slate-100 border-slate-300';

  if (pin.type === 'weather') {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
    colorClass = 'text-blue-600 bg-blue-50 border-blue-200';
  } else if (pin.type === 'soil') {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>`;
    colorClass = 'text-amber-600 bg-amber-50 border-amber-200';
  } else if (pin.type === 'irrigation' || pin.type === 'standpipe') {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7 2.9 7 2.9s-2.29 6.16-2.29 6.16c-1.14.93-1.71 2.03-1.71 3.19 0 2.22 1.8 4.05 4 4.05z"/></svg>`;
    colorClass = 'text-cyan-600 bg-cyan-50 border-cyan-200';
  } else if (pin.type === 'vehicle') {
    colorClass = 'text-indigo-600 bg-indigo-50 border-indigo-200';
  } else if (pin.type === 'fuel') {
    colorClass = 'text-amber-800 bg-amber-50 border-amber-300';
  } else if (pin.type === 'hazard') {
    colorClass = 'text-rose-600 bg-rose-50 border-rose-200';
  } else if (def) {
    colorClass = 'text-sky-700 bg-sky-50 border-sky-200';
  }

  return L.divIcon({
    html: `<div class="w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-md ${colorClass}">${svg}</div>
             ${pin.status === 'active' ? `<div class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>` :
               pin.status === 'warning' ? `<div class="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-white rounded-full"></div>` :
               `<div class="absolute -top-1 -right-1 w-3 h-3 bg-slate-400 border-2 border-white rounded-full"></div>`}`,
    className: 'custom-pin-icon bg-transparent border-0 relative',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}
