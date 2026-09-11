/**
 * The host's wire (`server/freenetHostWire.ts`) is the one place ciphertext
 * crosses from PUF-AM into Freenet on Electron. Plans/FREENET_NETWORK_PACK.md
 * Phase 1 slice B: the guard runs on every path, and the slot ops the join
 * ticket needs ride the same wire the relay's routes use.
 */

import { describe, expect, it, vi } from 'vitest';

import { createMistFreenetWire } from '../server/freenetHostWire.ts';
import { isJoinSlotCallerError, isJoinSlotInstanceId, publishJoinSlot } from '../server/freenetSlotOps.ts';
import { encodeFreenet02Uri } from '../units/mist-freenet/src/freenet02-uri.ts';
import type { FreenetTransport } from '../units/mist-freenet/src/freenet-transport.ts';
import { hotKey } from '../units/mist-freenet/src/keys.ts';
import { createFreenetHost, FreenetWireUnavailableError } from '../units/puf-freenet-host/src/index.ts';

const INSTANCE_ID = '5'.repeat(44);
const HOT_KEY = hotKey('farm-a', 'current');

function aeadEnvelope(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ v: 1, alg: 'aes-256-gcm', iv: 'AAAAAAAAAAAAAAAA', ct: 'Y2lwaGVy' }),
  );
}

function plaintextHot(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ paddocks: [{ id: 'p1', name: 'Home' }], diary: [], seasons: [] }),
  );
}

function fakeTransport(blobs: Record<string, Uint8Array> = {}) {
  const puts: Array<{ bytes: Uint8Array; identifier?: string }> = [];
  const gets: string[] = [];
  const transport = {
    async putBlob(bytes: Uint8Array, options?: { identifier?: string }) {
      puts.push({ bytes, identifier: options?.identifier });
      return { uri: 'FN02@put', identifier: options?.identifier ?? 'anon' };
    },
    async getBlob(uri: string) {
      gets.push(uri);
      return blobs[uri] ?? null;
    },
  } as unknown as FreenetTransport;
  return { transport, puts, gets };
}

function hostDirs() {
  return { configDir: '/tmp/puf-host-test/config', dataDir: '/tmp/puf-host-test/data', logDir: '/tmp/puf-host-test/log' };
}

describe('createMistFreenetWire — ciphertext guard', () => {
  it('refuses plaintext farm JSON through the host path', async () => {
    const { transport, puts } = fakeTransport();
    const host = createFreenetHost({ ...hostDirs(), wire: createMistFreenetWire({ transport }) });

    await expect(host.putCiphertext(plaintextHot(), { identifier: HOT_KEY })).rejects.toThrow(
      /plaintext hot JSON rejected|must be AEAD envelope/,
    );
    expect(puts).toHaveLength(0);
  });

  it('refuses a non-envelope blob even when no key is given', async () => {
    const { transport, puts } = fakeTransport();
    const wire = createMistFreenetWire({ transport });

    await expect(wire.putCiphertext(new TextEncoder().encode('hello shed'))).rejects.toThrow(
      /must be AEAD-sealed/,
    );
    expect(puts).toHaveLength(0);
  });

  it('passes an AEAD envelope to the transport with the key as identifier', async () => {
    const { transport, puts } = fakeTransport();
    const host = createFreenetHost({ ...hostDirs(), wire: createMistFreenetWire({ transport }) });

    const result = await host.putCiphertext(aeadEnvelope(), { identifier: HOT_KEY });

    expect(result).toEqual({ uri: 'FN02@put', identifier: HOT_KEY });
    expect(puts).toHaveLength(1);
    expect(puts[0]?.identifier).toBe(HOT_KEY);
  });

  it('gets bytes by URI straight from the transport', async () => {
    const { transport, gets } = fakeTransport({ 'FN02@abc': new Uint8Array([7, 7]) });
    const wire = createMistFreenetWire({ transport });

    await expect(wire.getCiphertext('FN02@abc')).resolves.toEqual(new Uint8Array([7, 7]));
    expect(gets).toEqual(['FN02@abc']);
  });
});

describe('createMistFreenetWire — slot ops', () => {
  it('publishes a slot through the injected put and reports the result', async () => {
    const slotPut = vi.fn(async (input: { instanceIdBase58: string }) => ({
      uri: encodeFreenet02Uri(input.instanceIdBase58),
      instanceIdBase58: input.instanceIdBase58,
      mode: 'put' as const,
    }));
    const { transport } = fakeTransport();
    const host = createFreenetHost({ ...hostDirs(), wire: createMistFreenetWire({ transport, slotPut }) });

    const result = await host.putSlotState!({
      parameters: new Uint8Array(64),
      state: new Uint8Array([1, 2, 3]),
      instanceIdBase58: INSTANCE_ID,
    });

    expect(result.mode).toBe('put');
    expect(result.instanceIdBase58).toBe(INSTANCE_ID);
    expect(slotPut).toHaveBeenCalledTimes(1);
  });

  it('refuses a malformed instance id before touching the network', async () => {
    const slotPut = vi.fn();
    const { transport } = fakeTransport();
    const wire = createMistFreenetWire({ transport, slotPut });

    await expect(
      wire.putSlotState!({ parameters: new Uint8Array(64), state: new Uint8Array([1]), instanceIdBase58: 'not-base58!' }),
    ).rejects.toThrow(/instanceIdBase58 must be/);
    expect(slotPut).not.toHaveBeenCalled();
  });

  it('reads slot state by the instance id encoded as a Freenet URI', async () => {
    const uri = encodeFreenet02Uri(INSTANCE_ID);
    const { transport, gets } = fakeTransport({ [uri]: new Uint8Array([9, 9, 9]) });
    const host = createFreenetHost({ ...hostDirs(), wire: createMistFreenetWire({ transport }) });

    await expect(host.getSlotState!(INSTANCE_ID)).resolves.toEqual(new Uint8Array([9, 9, 9]));
    expect(gets).toEqual([uri]);
  });

  it('returns null for a slot the node has not found', async () => {
    const { transport } = fakeTransport();
    const wire = createMistFreenetWire({ transport });

    await expect(wire.getSlotState!(INSTANCE_ID)).resolves.toBeNull();
  });

  it('throws FreenetWireUnavailableError when the wire has no slot ops', async () => {
    const host = createFreenetHost({
      ...hostDirs(),
      wire: {
        putCiphertext: async () => ({ uri: 'FN02@x' }),
        getCiphertext: async () => null,
      },
    });

    await expect(
      host.putSlotState!({ parameters: new Uint8Array(64), state: new Uint8Array([1]), instanceIdBase58: INSTANCE_ID }),
    ).rejects.toBeInstanceOf(FreenetWireUnavailableError);
    await expect(host.getSlotState!(INSTANCE_ID)).rejects.toBeInstanceOf(FreenetWireUnavailableError);
  });
});

describe('freenetSlotOps helpers shared with the relay routes', () => {
  it('accepts a base58 instance id of 32–64 chars and rejects the rest', () => {
    expect(isJoinSlotInstanceId(INSTANCE_ID)).toBe(true);
    expect(isJoinSlotInstanceId('0OIl' + '1'.repeat(40))).toBe(false);
    expect(isJoinSlotInstanceId('1'.repeat(31))).toBe(false);
    expect(isJoinSlotInstanceId(42)).toBe(false);
  });

  it('classifies structural refusals as caller errors', () => {
    expect(isJoinSlotCallerError('parameters must be 64 bytes')).toBe(true);
    expect(isJoinSlotCallerError('state does not start with PUFSLOT1')).toBe(true);
    expect(isJoinSlotCallerError('refusing to publish: hot URI missing')).toBe(true);
    expect(isJoinSlotCallerError('Freenet native slot PUT failed: operation timed out')).toBe(false);
  });

  it('publishJoinSlot forwards to the given put once the id is sane', async () => {
    const put = vi.fn(async () => ({ uri: 'FN02@s', instanceIdBase58: INSTANCE_ID, mode: 'update' as const }));
    const result = await publishJoinSlot(
      { parameters: new Uint8Array(64), state: new Uint8Array([1]), instanceIdBase58: INSTANCE_ID },
      put,
    );
    expect(result.mode).toBe('update');
    expect(put).toHaveBeenCalledTimes(1);
  });
});
