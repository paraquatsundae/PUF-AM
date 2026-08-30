import { getInfraType } from '../../shared/farm/infraTypes';
import type { InfrastructurePin } from './mapStore';

export function getPinTooltipHtml(pin: InfrastructurePin): string {
  const label = getInfraType(pin.type)?.label || pin.type || 'Unassigned';
  return `
      <div class="font-sans">
        <div class="font-bold text-sm">${pin.name || 'Unnamed asset'}</div>
        <div class="text-xs text-slate-500">${label} • ${pin.status}</div>
      </div>
    `;
}
