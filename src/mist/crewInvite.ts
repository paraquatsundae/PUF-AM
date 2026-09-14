/**
 * Crew invite resolve + persist — Hot/Bones only, never FarmSeed.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 * @see Plans/LOGIN_JOIN_SINGLE_BOX.md Decision — 2026-09-12
 */

import { hexToBytes } from '../../units/mist-freenet/src/farm-seed.ts';
import {
  CrewJoinError,
  unwrapCrewJoinEnvelope,
  type CrewJoinEnvelope,
} from '../../units/mist-freenet/src/crew-join.ts';
import { normalizeInviteToken } from '../../units/mist-freenet/src/invite-token.ts';
import { isJoinManifestExpired, parseJoinManifestV2 } from '../../shared/sync/joinTicket.ts';
import { readJoinGrant, type JoinGrant } from '../../shared/sync/joinGrant.ts';
import {
  apiFetch,
  apiHubMissing,
  getApiBaseUrl,
  mistLocalApiUrl,
  NO_API_HUB_MESSAGE,
} from '../lib/apiBase.ts';
import { JoinSlotMismatchError } from './joinSlotFreenet.ts';
import { resolveCrewInviteFromFreenetSlot } from './crewJoinSlot.ts';
import {
  JoinTicketMismatchError,
  JoinTicketUnavailableError,
  LAN_JOIN_UNAVAILABLE_MESSAGE,
  NO_JOIN_ROUTE_MESSAGE,
} from './joinTicketResolver.ts';
import {
  createMistCrewSessionRecord,
  markMistJoinTicketAccepted,
  saveMistDeviceSession,
} from './mistDeviceSession.ts';
import { rememberUnlockedReadKeys } from './mistReadKeys.ts';
import { setFarmStoreBackend } from './farmStoreBackend.ts';
import { createAppFarmStore } from './createFarmStore.ts';
import { fetchAndRehydrateFarmFromAddresses, refreshFarmUiAfterRecovery } from './mistDisasterRecovery.ts';
import { getDesktopBridge } from '../lib/desktopBridge.ts';

export type ResolvedCrewInvite = {
  envelope: CrewJoinEnvelope;
  resolvedBy: string;
};

export type JoinFarmWithCrewInviteResult = {
  envelope: CrewJoinEnvelope;
  grant: JoinGrant;
  resolvedBy: string;
  diary: number;
  blocks: number;
  outcome: { kind: 'member' } | { kind: 'mirror'; cloudFarmId: string };
};

function hubLabel(): string {
  const base = getApiBaseUrl();
  return base ? base.replace(/^https?:\/\//, '') : 'this device';
}

async function resolveCrewInviteOnLan(
  token: string,
  options?: { ownerBase?: string; signal?: AbortSignal },
): Promise<ResolvedCrewInvite> {
  if (apiHubMissing()) throw new JoinTicketUnavailableError(NO_API_HUB_MESSAGE);

  const query = new URLSearchParams();
  if (options?.ownerBase?.trim()) query.set('base', options.ownerBase.trim());
  const suffix = query.size ? `?${query.toString()}` : '';
  const url = mistLocalApiUrl(
    `/api/sync/join-ticket/${encodeURIComponent(token)}/resolve${suffix}`,
  );

  let res: Response;
  try {
    res = await apiFetch(url, {
      headers: { Accept: 'application/json' },
      timeoutMs: 12000,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    throw new JoinTicketUnavailableError(
      `Could not ask hub ${hubLabel()} about that invite.${reason ? ` ${reason}` : ''} ` +
        'Check the hub is still running and that Settings → Offline & sync shows its address.',
    );
  }

  const body = (await res.json().catch(() => ({}))) as {
    manifest?: unknown;
    sealedCrew?: unknown;
    resolvedFrom?: string;
    error?: string;
  };

  if (res.status === 409) {
    throw new JoinTicketMismatchError(body.error || 'That invite belongs to a different farm.');
  }
  if (!res.ok) {
    throw new JoinTicketUnavailableError(body.error || LAN_JOIN_UNAVAILABLE_MESSAGE);
  }

  const manifest = parseJoinManifestV2(body.manifest);
  if (manifest && isJoinManifestExpired(manifest)) {
    throw new JoinTicketMismatchError(
      'That crew invite has expired. Ask the farm owner to send the farm again for a fresh one.',
    );
  }

  const sealedHex = typeof body.sealedCrew === 'string' ? body.sealedCrew.trim() : '';
  if (!sealedHex) {
    throw new JoinTicketUnavailableError(
      'That hub has a ticket but no crew keys — ask the owner to Send this farm again.',
    );
  }

  try {
    const envelope = await unwrapCrewJoinEnvelope(hexToBytes(sealedHex), token);
    return {
      envelope,
      resolvedBy: body.resolvedFrom ? `lan (${body.resolvedFrom})` : 'lan',
    };
  } catch (error) {
    // A hub that answered with bytes we cannot open is a LAN miss — Freenet
    // may still have the crew envelope. A mismatch (wrong farm) stops the walk.
    throw new JoinTicketUnavailableError(
      error instanceof Error ? error.message : 'The hub crew invite could not be opened.',
    );
  }
}

/** LAN first, Freenet second. Neither path needs FarmSeed on the joiner. */
export async function resolveCrewInvite(
  invite: string,
  options?: { ownerBase?: string; signal?: AbortSignal },
): Promise<ResolvedCrewInvite> {
  const token = normalizeInviteToken(invite);
  if (!token) {
    throw new CrewJoinError(
      'That short ticket cannot open the farm. Ask the owner for a crew invite (PUF- and 26 letters).',
    );
  }

  const failures: { label: string; error: unknown }[] = [];

  try {
    return await resolveCrewInviteOnLan(token, options);
  } catch (error) {
    if (error instanceof JoinTicketMismatchError || error instanceof CrewJoinError) throw error;
    failures.push({ label: 'Same Wi‑Fi as the farm owner', error });
  }

  try {
    const { envelope, instanceIdBase58 } = await resolveCrewInviteFromFreenetSlot(token, {
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return {
      envelope,
      resolvedBy: `freenet-slot (${instanceIdBase58.slice(0, 8)}…)`,
    };
  } catch (error) {
    if (error instanceof JoinSlotMismatchError || error instanceof CrewJoinError) {
      throw new JoinTicketMismatchError(error.message);
    }
    failures.push({ label: 'Freenet, from anywhere', error });
  }

  const only = failures.length === 1 ? failures[0]!.error : null;
  if (only instanceof Error) throw only;

  const detail = failures
    .map(({ label, error }) => `${label}: ${error instanceof Error ? error.message : String(error)}`)
    .join('\n');
  throw new JoinTicketUnavailableError(`${NO_JOIN_ROUTE_MESSAGE}\n\n${detail}`);
}

async function rememberMistOnThisDesktop(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.mist) return;
  try {
    const pref = await bridge.mist.getPreference();
    if (pref.enabled) return;
    await bridge.mist.setPreference(true);
  } catch {
    /* The farm is saved regardless; the toggle is still in Settings. */
  }
}

/** Persist a crew session. Never writes FarmSeed. Does not navigate. */
export async function persistMistCrewSession(input: {
  envelope: CrewJoinEnvelope;
  farmName: string;
  displayName: string;
  skipPin: boolean;
  devicePin?: string;
}): Promise<void> {
  setFarmStoreBackend('mist');
  const session = createMistCrewSessionRecord({
    farmId: input.envelope.farmId,
    farmName: input.farmName.trim() || 'Joined farm',
    displayName: input.displayName.trim(),
    hotKey: hexToBytes(input.envelope.hotKeyHex),
    bonesKey: hexToBytes(input.envelope.bonesKeyHex),
    devicePin: input.skipPin ? undefined : input.devicePin,
    role: input.envelope.role,
    ...(input.envelope.cloudFarmId ? { cloudFarmId: input.envelope.cloudFarmId } : {}),
  });
  if (session.farmSeedHex) {
    throw new CrewJoinError('Crew session must not persist FarmSeed');
  }
  rememberUnlockedReadKeys({
    hotKey: hexToBytes(input.envelope.hotKeyHex),
    bonesKey: hexToBytes(input.envelope.bonesKeyHex),
  });
  await saveMistDeviceSession(session, input.skipPin ? undefined : input.devicePin, {
    joinTicketPending: false,
  });
  await createAppFarmStore(input.envelope.farmId);
  await rememberMistOnThisDesktop();
}

export async function joinFarmWithCrewInvite(input: {
  invite: string;
  farmName?: string;
  displayName: string;
  skipPin: boolean;
  devicePin?: string;
  ownerBase?: string;
  persistSession?: boolean;
}): Promise<JoinFarmWithCrewInviteResult> {
  const { envelope, resolvedBy } = await resolveCrewInvite(input.invite, {
    ...(input.ownerBase ? { ownerBase: input.ownerBase } : {}),
  });

  if (input.persistSession !== false) {
    await persistMistCrewSession({
      envelope,
      farmName: input.farmName || 'Joined farm',
      displayName: input.displayName,
      skipPin: input.skipPin,
      devicePin: input.devicePin,
    });
  }

  const pulled = await fetchAndRehydrateFarmFromAddresses(
    envelope.farmId,
    envelope,
    input.skipPin ? undefined : input.devicePin,
  );
  await refreshFarmUiAfterRecovery(envelope.farmId);

  const grant = readJoinGrant({
    role: envelope.role,
    ...(envelope.permissions ? { permissions: envelope.permissions } : {}),
  });
  markMistJoinTicketAccepted(
    grant,
    envelope.cloudFarmId ? { cloudFarmId: envelope.cloudFarmId } : undefined,
  );

  const cloudFarmId = envelope.cloudFarmId?.trim() || pulled.hot.cloudFarmId?.trim() || '';
  return {
    envelope,
    grant,
    resolvedBy,
    diary: pulled.hot.after.diary,
    blocks: pulled.geometry.after.blocks,
    outcome: cloudFarmId ? { kind: 'mirror', cloudFarmId } : { kind: 'member' },
  };
}
