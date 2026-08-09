/**
 * Ticket → manifest, behind one seam.
 *
 * `PUF-K7M2-9Q4X` has to become `{ hotUri, bonesUri, role }` somehow, and where
 * that lookup happens is the part most likely to change. Two places answer today:
 * the owner's hub over the LAN, and a **Freenet slot contract** addressed off the
 * ticket. Both are `JoinTicketResolver`s, tried in that order, and the rest of the
 * join flow never learns which one answered.
 *
 * LAN stays first because it is the fast, offline-capable path: a hub on the same
 * Wi‑Fi answers in milliseconds, while Opennet is a round trip through strangers.
 * Freenet is what makes a ticket work when the owner's laptop is shut, asleep, or
 * three paddocks away.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Short join ticket
 */

import {
  normalizeJoinTicket,
  parseJoinManifestV2,
  type JoinManifestV2,
  type JoinRole,
} from '../../shared/sync/joinTicket.ts';
import {
  apiFetch,
  apiHubMissing,
  getApiBaseUrl,
  mistLocalApiUrl,
  NO_API_HUB_MESSAGE,
} from '../lib/apiBase.ts';
import { JoinSlotMismatchError, resolveJoinTicketFromFreenetSlot } from './joinSlotFreenet.ts';

export type { JoinManifestV2, JoinRole };

export type ResolveJoinTicketOptions = {
  /**
   * `192.168.1.20:3000` typed by the joiner when mDNS finds nothing — the
   * Electron shell binds loopback only, so it never advertises itself.
   */
  ownerBase?: string;
  /**
   * Device PIN, when this device's mist session is PIN-locked.
   *
   * The LAN resolver has no use for it; the Freenet resolver cannot work without
   * it, because a slot address is derived from the FarmSeed the PIN unlocks.
   */
  devicePin?: string;
  signal?: AbortSignal;
};

export type ResolvedJoinTicket = {
  manifest: JoinManifestV2;
  /** Which resolver answered, plus how — `lan (192.168.1.20:3000)`. */
  resolvedBy: string;
};

export interface JoinTicketResolver {
  readonly id: string;
  readonly label: string;
  resolve(
    ticket: string,
    farmId: string,
    options?: ResolveJoinTicketOptions,
  ): Promise<ResolvedJoinTicket>;
}

/** Thrown when a resolver could not answer but a different one might. */
export class JoinTicketUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoinTicketUnavailableError';
  }
}

/** Thrown when the ticket resolved but points somewhere the joiner must not follow. */
export class JoinTicketMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoinTicketMismatchError';
  }
}

/**
 * What a hub says when its shelf has nothing for this ticket, and it has no better
 * reason to offer.
 *
 * It no longer promises Freenet "later": a ticket published to a slot resolves off
 * the LAN today, so the honest advice is that the *other* route needs a node here
 * and a moment for Opennet to catch up.
 */
export const LAN_JOIN_UNAVAILABLE_MESSAGE =
  'That hub has no join ticket by that name. Check the ticket, or join on the same Wi‑Fi as ' +
  'the farm owner while their PUF-AM is running.';

/** Every route failed. Says what each one was and what would make it work. */
export const NO_JOIN_ROUTE_MESSAGE =
  'Could not look that join ticket up. Either join on the same Wi‑Fi as the farm owner while ' +
  'their PUF-AM is running, or start the Freenet node on this device (Settings → Mist ' +
  'workshop) and try again in a few minutes — a freshly sent farm takes a while to spread.';

/**
 * The hub the ticket lookup runs on, as the operator set it — an unreachable hub
 * and a hub with an empty shelf are different jobs, and the address is the thing
 * that tells them apart.
 */
function hubLabel(): string {
  const base = getApiBaseUrl();
  return base ? base.replace(/^https?:\/\//, '') : 'this device';
}

/** Resolve over the local network via this device's own Express hub. */
export class LanJoinTicketResolver implements JoinTicketResolver {
  readonly id = 'lan';
  readonly label = 'Same Wi‑Fi as the farm owner';

  async resolve(
    ticket: string,
    farmId: string,
    options?: ResolveJoinTicketOptions,
  ): Promise<ResolvedJoinTicket> {
    const canonical = normalizeJoinTicket(ticket);
    if (!canonical) {
      throw new JoinTicketMismatchError('That join ticket should look like PUF-K7M2-9Q4X.');
    }

    // The lookup runs on a hub, not here. On a tablet that has not found one yet
    // the honest answer is "this device has no hub", not "try the same Wi‑Fi" —
    // the operator may well already be on it.
    if (apiHubMissing()) throw new JoinTicketUnavailableError(NO_API_HUB_MESSAGE);

    const query = new URLSearchParams({ farmId });
    if (options?.ownerBase?.trim()) query.set('base', options.ownerBase.trim());

    const url = mistLocalApiUrl(
      `/api/sync/join-ticket/${encodeURIComponent(canonical)}/resolve?${query.toString()}`,
    );

    let res: Response;
    try {
      res = await apiFetch(url, {
        headers: { Accept: 'application/json' },
        timeoutMs: 12000,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      // Nothing answered at all, so this is about the hub address rather than
      // the ticket. Saying "join on the same Wi‑Fi" here sent operators looking
      // at a router when the hub had simply stopped.
      const reason = error instanceof Error ? error.message : '';
      throw new JoinTicketUnavailableError(
        `Could not ask hub ${hubLabel()} about that ticket.${reason ? ` ${reason}` : ''} ` +
          'Check the hub is still running (npm run dev on the laptop) and that ' +
          'Settings → Offline & sync shows its address.',
      );
    }

    const body = (await res.json().catch(() => ({}))) as {
      manifest?: unknown;
      resolvedFrom?: string;
      error?: string;
    };

    if (res.status === 409) {
      throw new JoinTicketMismatchError(body.error || 'That ticket belongs to a different farm.');
    }
    if (!res.ok) {
      throw new JoinTicketUnavailableError(body.error || LAN_JOIN_UNAVAILABLE_MESSAGE);
    }

    const manifest = parseJoinManifestV2(body.manifest);
    if (!manifest) {
      throw new JoinTicketUnavailableError('The hub answered with a join manifest we cannot read.');
    }
    if (manifest.farmId !== farmId) {
      throw new JoinTicketMismatchError(
        'That join ticket belongs to a different farm than the FarmCode you recovered with.',
      );
    }

    return {
      manifest,
      resolvedBy: body.resolvedFrom ? `lan (${body.resolvedFrom})` : 'lan',
    };
  }
}

/**
 * Resolve over Freenet, from a slot the ticket addresses directly.
 *
 * `slot id = HKDF(FarmSeed, "freenet-join-slot:" + ticket)` goes in the contract's
 * `parameters`, so its address is a pure function of things the joiner already
 * holds — no owner's hub in the loop. The bundled **pack** contract cannot do this
 * because it sets `parameters = blake3(state)`, making its address a function of
 * the bytes a joiner is trying to fetch; the slot contract exists to break that
 * circle. See `units/mist-freenet/contracts/slot-contract`.
 *
 * This device still needs a Freenet node of its own — the bundled one in the
 * AppImage, or `freenet network` beside `npm run dev`. What it no longer needs is
 * the *owner's* node, awake, on the same Wi‑Fi.
 */
export class FreenetSlotJoinTicketResolver implements JoinTicketResolver {
  readonly id = 'freenet-slot';
  readonly label = 'Freenet, from anywhere';

  async resolve(
    ticket: string,
    farmId: string,
    options?: ResolveJoinTicketOptions,
  ): Promise<ResolvedJoinTicket> {
    try {
      const { manifest, instanceIdBase58 } = await resolveJoinTicketFromFreenetSlot(
        ticket,
        farmId,
        {
          ...(options?.devicePin ? { devicePin: options.devicePin } : {}),
          ...(options?.signal ? { signal: options.signal } : {}),
        },
      );
      return {
        manifest,
        resolvedBy: `freenet-slot (${instanceIdBase58.slice(0, 8)}…)`,
      };
    } catch (error) {
      // A slot that answered with the wrong thing is a mismatch the walk must stop
      // on, the same as a LAN hub naming another farm.
      if (error instanceof JoinSlotMismatchError) {
        throw new JoinTicketMismatchError(error.message);
      }
      throw new JoinTicketUnavailableError(
        error instanceof Error ? error.message : 'Could not read that ticket from Freenet.',
      );
    }
  }
}

/**
 * LAN first, Freenet second.
 *
 * Order is the whole design: a hub on the same Wi‑Fi answers immediately and works
 * with no internet at all, so it stays the fast path. Freenet is the fallback that
 * makes a ticket resolve when the owner's laptop is not reachable — which is the
 * case an operator hits in a paddock, not a rare one.
 */
export function defaultJoinTicketResolvers(): JoinTicketResolver[] {
  return [new LanJoinTicketResolver(), new FreenetSlotJoinTicketResolver()];
}

/**
 * Try each resolver in order. A mismatch stops the walk — the ticket was found
 * and it was the wrong farm, so asking somewhere else is not the answer.
 *
 * When they all decline, the operator gets every reason rather than only the last
 * one. With two routes, "could not reach the Freenet node" on its own reads as the
 * whole story and sends someone to the wrong place; "the hub had no such ticket,
 * and Freenet could not be reached" is the sentence that actually narrows it down.
 */
export async function resolveJoinTicket(
  ticket: string,
  farmId: string,
  options?: ResolveJoinTicketOptions & { resolvers?: JoinTicketResolver[] },
): Promise<ResolvedJoinTicket> {
  const resolvers = options?.resolvers ?? defaultJoinTicketResolvers();
  const failures: { label: string; error: unknown }[] = [];

  for (const resolver of resolvers) {
    try {
      return await resolver.resolve(ticket, farmId, options);
    } catch (error) {
      if (error instanceof JoinTicketMismatchError) throw error;
      failures.push({ label: resolver.label, error });
    }
  }

  if (!failures.length) throw new JoinTicketUnavailableError(NO_JOIN_ROUTE_MESSAGE);

  // One route means one reason, and its own wording is better than anything a
  // summary could add.
  const only = failures.length === 1 ? failures[0]!.error : null;
  if (only instanceof Error) throw only;

  const detail = failures
    .map(({ label, error }) => `${label}: ${error instanceof Error ? error.message : String(error)}`)
    .join('\n');
  throw new JoinTicketUnavailableError(`${NO_JOIN_ROUTE_MESSAGE}\n\n${detail}`);
}

export type RegisterJoinTicketInput = {
  ticket: string;
  farmId: string;
  hotUri: string;
  bonesUri: string;
  role: JoinRole;
  permissions?: Record<string, boolean | number | string>;
  expires?: string;
  hotContentHash?: string;
  bonesContentHash?: string;
  /**
   * Who the owner said this ticket was for — "Dave — spray ute".
   *
   * Rides beside the manifest rather than inside it: the hub keeps it on its own
   * shelf entry for the People list, and `parseJoinManifestV2` drops it, so a
   * joiner never receives the name the owner filed them under.
   */
  label?: string;
};

/** Owner side — publish the manifest on this device's hub so a ticket means something. */
export async function registerJoinTicketOnLan(
  input: RegisterJoinTicketInput,
): Promise<{ ticket: string; expires?: string }> {
  const canonical = normalizeJoinTicket(input.ticket);
  if (!canonical) throw new Error('Cannot register a malformed join ticket');

  const res = await apiFetch(mistLocalApiUrl('/api/sync/join-ticket'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, v: 2, ticket: canonical }),
    timeoutMs: 12000,
  });

  const body = (await res.json().catch(() => ({}))) as {
    ticket?: string;
    expires?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || `Could not register the join ticket (${res.status})`);
  }

  return { ticket: body.ticket || canonical, expires: body.expires };
}
