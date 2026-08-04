/**
 * Ticket → manifest, behind one seam.
 *
 * `PUF-K7M2-9Q4X` has to become `{ hotUri, bonesUri, role }` somehow, and where
 * that lookup happens is the part most likely to change. Today the owner's hub
 * answers over the LAN. The end state is a **mutable Freenet slot contract**
 * keyed off the ticket, which drops the same-Wi‑Fi requirement entirely — so the
 * lookup lives behind `JoinTicketResolver` and the rest of the join flow never
 * learns which one answered.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Short join ticket
 */

import {
  normalizeJoinTicket,
  parseJoinManifestV2,
  type JoinManifestV2,
  type JoinRole,
} from '../../shared/sync/joinTicket.ts';
import { mistLocalApiUrl } from '../lib/apiBase.ts';

export type { JoinManifestV2, JoinRole };

export type ResolveJoinTicketOptions = {
  /**
   * `192.168.1.20:3000` typed by the joiner when mDNS finds nothing — the
   * Electron shell binds loopback only, so it never advertises itself.
   */
  ownerBase?: string;
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

export const LAN_JOIN_UNAVAILABLE_MESSAGE =
  'Join on the same Wi‑Fi as the farm owner for now; Freenet-only short tickets coming later.';

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

    const query = new URLSearchParams({ farmId });
    if (options?.ownerBase?.trim()) query.set('base', options.ownerBase.trim());

    const url = mistLocalApiUrl(
      `/api/sync/join-ticket/${encodeURIComponent(canonical)}/resolve?${query.toString()}`,
    );

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    } catch {
      throw new JoinTicketUnavailableError(LAN_JOIN_UNAVAILABLE_MESSAGE);
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
 * TODO(mist-freenet-slot): `FreenetSlotJoinTicketResolver`.
 *
 * Deferred with the mutable-contract work. When Freenet 0.2 gives us a slot we
 * can update in place, the owner writes the manifest to a slot addressed by
 * `HKDF(farmSeed, "freenet-join-slot" | ticket)` and this resolver GETs it —
 * which removes the same-Wi‑Fi requirement and makes a ticket work from a phone
 * anywhere. It slots in beside `LanJoinTicketResolver` in
 * `defaultJoinTicketResolvers()`; nothing else in the join flow should need to
 * change. Blocked on the same immutable pack-contract limitation that forces the
 * FN02 URI handoff today — see `units/mist-freenet/src/freenet-keys.ts` and
 * `Plans/MIST_TWO_FEDORA_FREENET.md` § Next.
 */

export function defaultJoinTicketResolvers(): JoinTicketResolver[] {
  return [new LanJoinTicketResolver()];
}

/**
 * Try each resolver in order. A mismatch stops the walk — the ticket was found
 * and it was the wrong farm, so asking somewhere else is not the answer.
 */
export async function resolveJoinTicket(
  ticket: string,
  farmId: string,
  options?: ResolveJoinTicketOptions & { resolvers?: JoinTicketResolver[] },
): Promise<ResolvedJoinTicket> {
  const resolvers = options?.resolvers ?? defaultJoinTicketResolvers();
  let lastError: unknown = null;

  for (const resolver of resolvers) {
    try {
      return await resolver.resolve(ticket, farmId, options);
    } catch (error) {
      if (error instanceof JoinTicketMismatchError) throw error;
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new JoinTicketUnavailableError(LAN_JOIN_UNAVAILABLE_MESSAGE);
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
};

/** Owner side — publish the manifest on this device's hub so a ticket means something. */
export async function registerJoinTicketOnLan(
  input: RegisterJoinTicketInput,
): Promise<{ ticket: string; expires?: string }> {
  const canonical = normalizeJoinTicket(input.ticket);
  if (!canonical) throw new Error('Cannot register a malformed join ticket');

  const res = await fetch(mistLocalApiUrl('/api/sync/join-ticket'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, v: 2, ticket: canonical }),
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
