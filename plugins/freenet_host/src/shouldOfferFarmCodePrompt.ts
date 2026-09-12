/**
 * When the post-sign-in hybrid prompt should show.
 * `Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.6.
 */

import type { FreenetHostCapability } from '../../../src/lib/freenetHostCapability.ts';

export const FARM_CODE_PROMPT_DISMISSED_KEY = 'pufam.freenetHost.farmCodePromptDismissed.v1';

export function shouldOfferFarmCodePrompt(input: {
  enabled: boolean;
  farmId: string;
  seedCloudFarmId: string | null;
  capability: FreenetHostCapability;
  dismissed: boolean;
  /** Capacitor APK — can take part through a hub even when :7509 is down. */
  nativeReader?: boolean;
}): boolean {
  const canTakePart =
    input.capability === 'electron' ||
    input.capability === 'android' ||
    input.nativeReader === true;
  return (
    input.enabled &&
    input.seedCloudFarmId !== input.farmId &&
    canTakePart &&
    !input.dismissed
  );
}

type DismissedMap = Record<string, string>;

function readDismissed(): DismissedMap {
  try {
    const raw = localStorage.getItem(FARM_CODE_PROMPT_DISMISSED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as DismissedMap)
      : {};
  } catch {
    return {};
  }
}

export function isFarmCodePromptDismissed(farmId: string): boolean {
  return Boolean(readDismissed()[farmId]);
}

export function dismissFarmCodePrompt(farmId: string): void {
  const next = { ...readDismissed(), [farmId]: new Date().toISOString() };
  try {
    localStorage.setItem(FARM_CODE_PROMPT_DISMISSED_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
