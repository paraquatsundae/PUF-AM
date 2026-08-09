/**
 * The auto-sync decision ladder — `src/lib/autoSync.ts`.
 *
 * Kept pure precisely so this file can exist: every rung is reachable without a
 * network, a Freenet node, a browser or a farm.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */
import { describe, expect, it } from 'vitest';

import {
  AUTO_SYNC_INTERVAL_MS,
  AUTO_SYNC_MIN_GAP_MS,
  describeAgo,
  describeLastSync,
  planFarmSync,
  shouldAutoSyncNow,
  type SyncConditions,
} from '../src/lib/autoSync';

/** A Freenet farm, unlocked, with everything down. Each test turns one thing on. */
function conditions(patch: Partial<SyncConditions> = {}): SyncConditions {
  return {
    pipe: 'freenet',
    online: true,
    farmUnlocked: true,
    cloudSignedIn: false,
    peer: 'none',
    freenet: 'none',
    ...patch,
  };
}

describe('planFarmSync — the Wi‑Fi rung', () => {
  it('sends a Freenet farm over the sealed shelf when a peer answers', () => {
    const plan = planFarmSync(conditions({ peer: 'reachable' }));
    expect(plan.route).toBe('lan-sealed');
    expect(plan.via).toBe('wifi');
    expect(plan.auto).toBe(true);
  });

  it('sends a cloud farm over the `.pufom` shelf when a peer answers', () => {
    const plan = planFarmSync(conditions({ pipe: 'cloud', cloudSignedIn: true, peer: 'reachable' }));
    expect(plan.route).toBe('lan-pufom');
    expect(plan.auto).toBe(true);
  });

  it('prefers a peer over Freenet when both are up', () => {
    // Seconds against minutes, and the shelf merges where a Freenet pull
    // replaces. A node being available is never a reason to take the long way.
    const plan = planFarmSync(conditions({ peer: 'reachable', freenet: 'publish' }));
    expect(plan.route).toBe('lan-sealed');
  });

  it('will not use the cloud shelf without a signed-in account', () => {
    // The `.pufom` routes verify a Firebase ID token, so this would be a 401
    // dressed up as a sync failure.
    const plan = planFarmSync(conditions({ pipe: 'cloud', cloudSignedIn: false, peer: 'reachable' }));
    expect(plan.route).toBe('blocked');
    expect(plan.label).toMatch(/sign in/i);
  });

  it('says the farm is locked rather than syncing a device with no FarmSeed', () => {
    const plan = planFarmSync(conditions({ peer: 'reachable', farmUnlocked: false }));
    expect(plan.route).toBe('blocked');
    expect(plan.label).toMatch(/locked/i);
  });
});

describe('planFarmSync — the Freenet rung', () => {
  it('falls to a Freenet publish when no peer answers', () => {
    const plan = planFarmSync(conditions({ freenet: 'publish' }));
    expect(plan.route).toBe('freenet-publish');
    expect(plan.via).toBe('freenet');
  });

  it('never runs a Freenet route unattended', () => {
    // A publish is minutes through a laptop-only `fdev` and re-issues the join
    // ticket; a pull replaces local records rather than merging them.
    expect(planFarmSync(conditions({ freenet: 'publish' })).auto).toBe(false);
    expect(planFarmSync(conditions({ freenet: 'read-only' })).auto).toBe(false);
  });

  it('offers a read-only tablet a fetch, not a send', () => {
    const plan = planFarmSync(conditions({ freenet: 'read-only' }));
    expect(plan.route).toBe('freenet-pull');
    expect(plan.detail).toMatch(/laptop/i);
  });

  it('still offers a tablet its own node when it has found an unpaired hub', () => {
    // The fix for "found a hub, not paired" is a pairing code — but a tablet
    // with a node of its own does not have to wait for one.
    const plan = planFarmSync(conditions({ peer: 'needs-pairing', freenet: 'read-only' }));
    expect(plan.route).toBe('freenet-pull');
    expect(plan.detail).toMatch(/pairing code/i);
  });
});

describe('planFarmSync — nothing available', () => {
  it('names both ways out when a Freenet farm has neither', () => {
    const plan = planFarmSync(conditions());
    expect(plan.route).toBe('blocked');
    expect(plan.via).toBe('none');
    expect(plan.label).toMatch(/waiting for a wi‑fi peer or a freenet node/i);
  });

  it('asks for a pairing code when that is the only thing in the way', () => {
    const plan = planFarmSync(conditions({ peer: 'needs-pairing' }));
    expect(plan.route).toBe('blocked');
    expect(plan.detail).toMatch(/pairing code/i);
  });

  it('says offline before anything else', () => {
    const plan = planFarmSync(conditions({ online: false, peer: 'reachable', freenet: 'publish' }));
    expect(plan.route).toBe('blocked');
    expect(plan.label).toMatch(/offline/i);
  });

  it('tells a locked Freenet farm to unlock even with no peer', () => {
    const plan = planFarmSync(conditions({ farmUnlocked: false, freenet: 'publish' }));
    expect(plan.route).toBe('blocked');
    expect(plan.label).toMatch(/locked/i);
  });
});

describe('shouldAutoSyncNow', () => {
  const wifi = planFarmSync(conditions({ peer: 'reachable' }));
  const freenet = planFarmSync(conditions({ freenet: 'publish' }));

  it('runs the first time it is asked', () => {
    expect(
      shouldAutoSyncNow({ plan: wifi, enabled: true, busy: false, lastAttemptAt: null, trigger: 'timer' }),
    ).toBe(true);
  });

  it('never fires a Freenet rung from the timer', () => {
    expect(
      shouldAutoSyncNow({
        plan: freenet,
        enabled: true,
        busy: false,
        lastAttemptAt: null,
        trigger: 'timer',
      }),
    ).toBe(false);
  });

  it('holds off until the interval has passed', () => {
    const now = 10_000_000;
    expect(
      shouldAutoSyncNow({
        plan: wifi,
        enabled: true,
        busy: false,
        lastAttemptAt: now - AUTO_SYNC_INTERVAL_MS + 1,
        now,
        trigger: 'timer',
      }),
    ).toBe(false);
    expect(
      shouldAutoSyncNow({
        plan: wifi,
        enabled: true,
        busy: false,
        lastAttemptAt: now - AUTO_SYNC_INTERVAL_MS,
        now,
        trigger: 'timer',
      }),
    ).toBe(true);
  });

  it('lets a resume ask sooner, but not immediately', () => {
    // Waking the tablet, switching back to the app and rejoining the Wi‑Fi all
    // arrive together in the shed; the floor is what makes that one sync.
    const now = 10_000_000;
    expect(
      shouldAutoSyncNow({
        plan: wifi,
        enabled: true,
        busy: false,
        lastAttemptAt: now - AUTO_SYNC_MIN_GAP_MS + 1,
        now,
        trigger: 'resume',
      }),
    ).toBe(false);
    expect(
      shouldAutoSyncNow({
        plan: wifi,
        enabled: true,
        busy: false,
        lastAttemptAt: now - AUTO_SYNC_MIN_GAP_MS,
        now,
        trigger: 'resume',
      }),
    ).toBe(true);
  });

  it('does nothing while a sync is already running, or when switched off', () => {
    const base = { plan: wifi, lastAttemptAt: null, trigger: 'timer' as const };
    expect(shouldAutoSyncNow({ ...base, enabled: true, busy: true })).toBe(false);
    expect(shouldAutoSyncNow({ ...base, enabled: false, busy: false })).toBe(false);
  });
});

describe('the status line', () => {
  it('names the route the farm last moved over', () => {
    const at = new Date(Date.now() - 4 * 60_000).toISOString();
    expect(describeLastSync({ at, via: 'wifi', ok: true, summary: '3 diary · 2 blocks · 0 issues' }))
      .toBe('Last synced via Wi‑Fi 4 min ago — 3 diary · 2 blocks · 0 issues');
  });

  it('reports a failure as a failure', () => {
    const at = new Date().toISOString();
    const line = describeLastSync({ at, via: 'freenet', ok: false, summary: 'peer not connected' });
    expect(line).toMatch(/failed just now — peer not connected/);
  });

  it('says so when this device has never synced', () => {
    expect(describeLastSync(null)).toMatch(/not synced on this device yet/i);
  });

  it('rounds the way someone reading it would', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    expect(describeAgo('2026-08-09T11:59:30.000Z', now)).toBe('just now');
    expect(describeAgo('2026-08-09T11:45:00.000Z', now)).toBe('15 min ago');
    expect(describeAgo('2026-08-09T09:00:00.000Z', now)).toBe('3 h ago');
    expect(describeAgo('2026-08-07T12:00:00.000Z', now)).toBe('2 days ago');
  });
});
