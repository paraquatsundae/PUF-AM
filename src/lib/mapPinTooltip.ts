import { getInfraType } from '../../shared/farm/infraTypes';
import { escapeHtml } from './escapeHtml';
import type { InfrastructurePin } from './mapStore';

export function getPinTooltipHtml(pin: InfrastructurePin): string {
  const label = getInfraType(pin.type)?.label || pin.type || 'Unassigned';
  const name = pin.name ? escapeHtml(pin.name) : 'Unnamed asset';
  return `
      <div class="font-sans">
        <div class="font-bold text-sm">${name}</div>
        <div class="text-xs text-slate-500">${escapeHtml(label)} • ${escapeHtml(pin.status)}</div>
      </div>
    `;
}
