/**
 * One question — *how should this farm move right now* — answered in one place.
 *
 * Settings grew a card per pipe, which is right for teaching an operator what
 * the pipes are and wrong for the job they actually have: get today's diary onto
 * the other device. That meant knowing that Wi‑Fi is push-then-pull, that
 * Freenet is send-then-read-a-ticket, and which of the two is currently up. This
 * module holds the ladder that decides instead, and nothing else: it takes a
 * description of the conditions and returns a plan. Probing lives in
 * `components/sync/useAutoSync.ts`, so the ladder itself stays a pure function
 * with a test per rung.
 *
 * The ladder, in order:
 *
 * 1. **A PUF-AM peer on this Wi‑Fi.** Seconds, no internet, and the merge is
 *    last-writer-wins on both sides, so it is safe to run unattended. Preferred
 *    whenever a peer answers — including when Freenet is also up, because a
 *    Freenet round trip is minutes and needs a laptop.
 * 1b. **The same hub at the farm's gateway address.** Same routes, same merge,
 *    same rung — just reached from outside the shed, which is what lets a tablet
 *    sync and join with no Freenet node and no laptop on its Wi‑Fi. Below LAN
 *    because it is the long way round to the same machine. See
 *    `src/lib/farmGateway.ts`.
 * 2. **Freenet.** The farm moves between devices that cannot see each other.
 *    One press, never a timer: publishing goes through `fdev` on a laptop, and
 *    a Freenet pull *replaces* local records rather than merging them
 *    (`rehydrateLocalFarmFromHot`), which is not something to do to a device
 *    while nobody is looking.
 * 3. **Neither.** Say so, and say which of the two would fix it.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */

import type { FarmPipe } from './farmPipes.ts';

/** What this device found when it looked for another PUF-AM on the network. */
export type SyncPeerState =
  /** A hub answered `/api/health` and this device may use it. */
  | 'reachable'
  /**
   * The same, reached at the farm's remembered **gateway** address rather than on
   * this Wi‑Fi (`farmGateway.ts`). Identical routes and identical merge, so it is
   * the same rung — it is a separate state only because the operator is owed a
   * different sentence, and because the bytes may be leaving the farm.
   */
  | 'reachable-remote'
  /** A hub answered, but it is a packaged desktop that wants a pairing code first. */
  | 'needs-pairing'
  | 'none';

/** What this device can do with Freenet, which is not the same as whether it has it. */
export type FreenetNodeState =
  /** A node this device can publish through — desktop shell, or a paired hub with `fdev`. */
  | 'publish'
  /** A node app on this device: lookups and downloads work, PUT does not. */
  | 'read-only'
  | 'none';

export type SyncConditions = {
  pipe: FarmPipe;
  /** `navigator.onLine` — false means no network at all, not merely no internet. */
  online: boolean;
  /** A Freenet farm is open *and* unlocked here, so the FarmSeed is in memory. */
  farmUnlocked: boolean;
  /** A Firebase user exists, which is what the `.pufom` shelf authenticates with. */
  cloudSignedIn: boolean;
  peer: SyncPeerState;
  freenet: FreenetNodeState;
};

export type SyncRoute =
  /** Sealed `.pufom` bundle on a peer's shelf — the Freenet farm's Wi‑Fi pipe. */
  | 'lan-sealed'
  /** The original `.pufom` shelf, Firebase-authenticated — a cloud farm's Wi‑Fi pipe. */
  | 'lan-pufom'
  /** Publish Hot + bones and refresh the join ticket. */
  | 'freenet-publish'
  /** Fetch Hot + bones from the addresses this device already holds. */
  | 'freenet-pull'
  | 'blocked';

export type SyncVia = 'wifi' | 'gateway' | 'freenet' | 'none';

export type SyncPlan = {
  route: SyncRoute;
  via: SyncVia;
  /**
   * Safe to run on a timer with nobody watching.
   *
   * True only for the two LAN routes. Both merge; both are seconds long; both
   * are idempotent when nothing changed. Neither Freenet route is any of those.
   */
  auto: boolean;
  /** The one line the Sync card shows for what would happen next. */
  label: string;
  /** What an operator can do about it, when there is something to do. */
  detail?: string;
};

const NO_PEER_DETAIL =
  'A PUF-AM peer is any laptop on this Wi‑Fi with PUF-AM open — the hub is on by default. ' +
  'If none is found, check both devices are on the same network, or type the laptop address ' +
  'under Wi‑Fi (LAN) below. To sync when there is no laptop on this Wi‑Fi at all, set the ' +
  'farm’s gateway address once under Farm gateway below.';

const PAIRING_DETAIL =
  'A PUF-AM laptop answered but wants its pairing code first. Read it off that laptop under ' +
  'Settings → Tablet hub and enter it under Wi‑Fi (LAN) below.';

/**
 * Decide the route. Pure: every input is an argument, so each rung has a test.
 */
export function planFarmSync(conditions: SyncConditions): SyncPlan {
  const { pipe, online, farmUnlocked, cloudSignedIn, peer, freenet } = conditions;

  if (!online) {
    return {
      route: 'blocked',
      via: 'none',
      auto: false,
      label: 'Offline — nothing to sync with',
      detail:
        'This device has no network at all. Work carries on locally; sync resumes on its own ' +
        'when Wi‑Fi comes back.',
    };
  }

  // A peer beats Freenet even when both are up: seconds against minutes, and the
  // shelf merges where a Freenet pull replaces. A gateway peer beats it for the
  // same reasons — it is the same shelf on the same hub, just further away.
  if (peer === 'reachable' || peer === 'reachable-remote') {
    const remote = peer === 'reachable-remote';
    const peerLabel = remote
      ? 'Farm gateway — reaching the farm’s hub from here'
      : 'Wi‑Fi — a PUF-AM peer is on this network';
    const remoteDetail = remote
      ? 'This is the farm’s own hub at its gateway address, so sync works away from the shed ' +
        'Wi‑Fi. It may use mobile data.'
      : undefined;

    if (pipe === 'freenet') {
      if (farmUnlocked) {
        return {
          route: 'lan-sealed',
          via: remote ? 'gateway' : 'wifi',
          auto: true,
          label: peerLabel,
          ...(remoteDetail ? { detail: remoteDetail } : {}),
        };
      }
      return {
        route: 'blocked',
        via: 'none',
        auto: false,
        label: 'Locked on this device',
        detail:
          `A hub is reachable ${remote ? 'at the farm gateway' : 'on this Wi‑Fi'}, but the farm ` +
          'is sealed with your device PIN and this device has not unlocked it yet. Unlock the ' +
          'farm and sync starts by itself.',
      };
    }

    if (cloudSignedIn) {
      return {
        route: 'lan-pufom',
        via: remote ? 'gateway' : 'wifi',
        auto: true,
        label: peerLabel,
        ...(remoteDetail ? { detail: remoteDetail } : {}),
      };
    }
    return {
      route: 'blocked',
      via: 'none',
      auto: false,
      label: 'Sign in to use the Wi‑Fi shelf',
      detail:
        'This is a cloud farm, and its Wi‑Fi shelf checks the signed-in account before it hands ' +
        'the farm over. Sign in on this device and sync resumes.',
    };
  }

  // Not `else` on the rung above: a tablet that has found a hub it has not paired
  // with may still have a Freenet node of its own, and telling it to go and pair
  // when it could already pull would be wrong.
  const peerDetail = peer === 'needs-pairing' ? PAIRING_DETAIL : NO_PEER_DETAIL;

  if (pipe === 'freenet' && farmUnlocked) {
    if (freenet === 'publish') {
      return {
        route: 'freenet-publish',
        via: 'freenet',
        auto: false,
        label: 'Freenet — no peer on this Wi‑Fi, send from here',
        detail:
          'No PUF-AM peer answered, so the farm has to go the long way. Sending to Freenet takes ' +
          'minutes and issues a fresh join ticket, so it waits for you to press it. ' +
          peerDetail,
      };
    }
    if (freenet === 'read-only') {
      return {
        route: 'freenet-pull',
        via: 'freenet',
        auto: false,
        label: 'Freenet — this device can fetch, not send',
        detail:
          'The Freenet node on this device answers lookups, so the latest published copy of the ' +
          'farm can be fetched here. It replaces what is on this device rather than merging, so ' +
          'it waits for you to press it. Sending still needs a PUF-AM laptop. ' +
          peerDetail,
      };
    }
  }

  if (pipe === 'freenet' && !farmUnlocked) {
    return {
      route: 'blocked',
      via: 'none',
      auto: false,
      label: 'Locked on this device',
      detail: 'Unlock this farm with your device PIN, then sync can run.',
    };
  }

  return {
    route: 'blocked',
    via: 'none',
    auto: false,
    label:
      pipe === 'freenet'
        ? 'Waiting for a Wi‑Fi peer or a Freenet node'
        : 'Waiting for a PUF-AM peer on this Wi‑Fi',
    detail: peerDetail,
  };
}

// ---------------------------------------------------------------------------
// What happened last time
// ---------------------------------------------------------------------------

export type LastSyncEntry = {
  at: string;
  via: SyncVia;
  ok: boolean;
  /** Operator words: "3 diary, 2 blocks", or the error. */
  summary: string;
  /** Which device answered, when the route knows. */
  peerLabel?: string;
};

const LAST_SYNC_PREFIX = 'pufam.autoSync.last.v1';
const AUTO_ENABLED_KEY = 'pufam.autoSync.enabled.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readLastSync(farmId: string): LastSyncEntry | null {
  const raw = storage()?.getItem(`${LAST_SYNC_PREFIX}.${farmId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LastSyncEntry;
  } catch {
    return null;
  }
}

export function writeLastSync(farmId: string, entry: LastSyncEntry): void {
  storage()?.setItem(`${LAST_SYNC_PREFIX}.${farmId}`, JSON.stringify(entry));
}

/** Automatic attempts are on unless this device turned them off. */
export function autoSyncEnabled(): boolean {
  return storage()?.getItem(AUTO_ENABLED_KEY) !== 'off';
}

export function setAutoSyncEnabled(enabled: boolean): void {
  storage()?.setItem(AUTO_ENABLED_KEY, enabled ? 'on' : 'off');
}

export function describeAgo(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'recently';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The one status line: what moved, over what, how long ago. */
const VIA_WORDS: Record<SyncVia, string> = {
  wifi: 'Wi‑Fi',
  gateway: 'the farm gateway',
  freenet: 'Freenet',
  none: 'this device',
};

export function describeLastSync(entry: LastSyncEntry | null, now = Date.now()): string {
  if (!entry) return 'Not synced on this device yet';
  const via = VIA_WORDS[entry.via] ?? VIA_WORDS.none;
  const when = describeAgo(entry.at, now);
  if (!entry.ok) return `Last try over ${via} failed ${when} — ${entry.summary}`;
  return `Last synced via ${via} ${when}${entry.summary ? ` — ${entry.summary}` : ''}`;
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/**
 * How often an unattended attempt is worth making.
 *
 * A LAN round trip on an unchanged farm is one `meta` request and no upload, so
 * this is cheap; the number is about how stale the other device's map is allowed
 * to be, not about load.
 */
export const AUTO_SYNC_INTERVAL_MS = 3 * 60_000;

/**
 * The floor under everything, including "the operator came back to the app".
 *
 * Switching tabs, waking the tablet and reconnecting to Wi‑Fi all fire together
 * in the shed; without this each of them would start its own sync.
 */
export const AUTO_SYNC_MIN_GAP_MS = 45_000;

export function shouldAutoSyncNow(input: {
  plan: SyncPlan;
  enabled: boolean;
  busy: boolean;
  lastAttemptAt: number | null;
  now?: number;
  /** A resume or a reconnect asks sooner than the timer would. */
  trigger: 'timer' | 'resume';
}): boolean {
  if (!input.enabled || input.busy || !input.plan.auto) return false;
  const now = input.now ?? Date.now();
  if (input.lastAttemptAt === null) return true;
  const since = now - input.lastAttemptAt;
  return since >= (input.trigger === 'resume' ? AUTO_SYNC_MIN_GAP_MS : AUTO_SYNC_INTERVAL_MS);
}
