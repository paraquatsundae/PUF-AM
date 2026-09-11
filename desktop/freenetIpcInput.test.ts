/**
 * The `puf-freenet:put|get|slot-put|slot-get` handlers in `desktop/main.ts` trust
 * nothing from the renderer (Plans/reference/DESKTOP_FREENET_PLUGIN.md §7,
 * Plans/FREENET_NETWORK_PACK.md Phase 1 slice B). These are the shapes they
 * accept and the ones they refuse.
 */

import { describe, expect, it } from 'vitest';

import {
  FREENET_IPC_MAX_BLOB_BYTES,
  FREENET_IPC_MAX_SLOT_PARAMETERS_BYTES,
  FREENET_IPC_MAX_SLOT_STATE_BYTES,
  FreenetIpcInputError,
  ipcBytes,
  ipcFreenetUri,
  ipcMistKey,
  ipcPutArgs,
  ipcSlotInstanceId,
  ipcSlotPutArgs,
} from './freenetIpcInput.ts';

const INSTANCE_ID = 'A'.repeat(44);

describe('ipcBytes', () => {
  it('keeps a Uint8Array as-is', () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(ipcBytes(input, 'bytes', 16)).toBe(input);
  });

  it('wraps an ArrayBuffer', () => {
    const buffer = new Uint8Array([4, 5]).buffer;
    expect(ipcBytes(buffer, 'bytes', 16)).toEqual(new Uint8Array([4, 5]));
  });

  it('decodes base64 text', () => {
    expect(ipcBytes(Buffer.from('shed').toString('base64'), 'bytes', 16)).toEqual(
      new Uint8Array(Buffer.from('shed')),
    );
  });

  it('refuses non-base64 text, empty payloads and other types', () => {
    expect(() => ipcBytes('not base64!!', 'bytes', 16)).toThrow(FreenetIpcInputError);
    expect(() => ipcBytes(new Uint8Array(0), 'bytes', 16)).toThrow(/empty/);
    expect(() => ipcBytes('', 'bytes', 16)).toThrow(/empty/);
    expect(() => ipcBytes({ length: 3 }, 'bytes', 16)).toThrow(/expected bytes/);
    expect(() => ipcBytes(42, 'bytes', 16)).toThrow(FreenetIpcInputError);
  });

  it('enforces the byte cap', () => {
    expect(() => ipcBytes(new Uint8Array(17), 'bytes', 16)).toThrow(/exceeds the 16-byte cap/);
    expect(ipcBytes(new Uint8Array(16), 'bytes', 16)).toHaveLength(16);
  });

  it('carries the error code the renderer can key off', () => {
    try {
      ipcBytes(null, 'bytes', 16);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(FreenetIpcInputError);
      expect((error as FreenetIpcInputError).code).toBe('FREENET_IPC_INPUT');
    }
  });
});

describe('ipcMistKey', () => {
  it('is optional', () => {
    expect(ipcMistKey(undefined)).toBeUndefined();
    expect(ipcMistKey(null)).toBeUndefined();
    expect(ipcMistKey('')).toBeUndefined();
  });

  it('accepts a real mist key with a sane farm id', () => {
    expect(ipcMistKey('mist/v1/farm/farm-a/hot/current')).toBe('mist/v1/farm/farm-a/hot/current');
    expect(ipcMistKey('mist/v1/farm/farm_b/bones/2026-09/abc')).toBe('mist/v1/farm/farm_b/bones/2026-09/abc');
  });

  it('refuses keys that do not parse or carry an odd farm id', () => {
    expect(() => ipcMistKey('hot/current')).toThrow(FreenetIpcInputError);
    expect(() => ipcMistKey('mist/v1/farm/../hot/current')).toThrow(FreenetIpcInputError);
    expect(() => ipcMistKey('mist/v1/farm/farm a/hot/current')).toThrow(FreenetIpcInputError);
    expect(() => ipcMistKey(7)).toThrow(FreenetIpcInputError);
    expect(() => ipcMistKey('x'.repeat(600))).toThrow(FreenetIpcInputError);
  });
});

describe('ipcFreenetUri', () => {
  it('normalises the accepted Freenet 0.2 spellings', () => {
    expect(ipcFreenetUri(INSTANCE_ID)).toBe(`FN02@${INSTANCE_ID}`);
    expect(ipcFreenetUri(`FN02@${INSTANCE_ID}`)).toBe(`FN02@${INSTANCE_ID}`);
  });

  it('refuses non-strings, empties and anything over 256 chars', () => {
    expect(() => ipcFreenetUri(undefined)).toThrow(FreenetIpcInputError);
    expect(() => ipcFreenetUri('')).toThrow(FreenetIpcInputError);
    expect(() => ipcFreenetUri(`FN02@${'A'.repeat(300)}`)).toThrow(FreenetIpcInputError);
  });
});

describe('ipcSlotInstanceId', () => {
  it('accepts base58 of 32–64 chars', () => {
    expect(ipcSlotInstanceId(INSTANCE_ID)).toBe(INSTANCE_ID);
  });

  it('refuses ambiguous base58 characters, wrong lengths and non-strings', () => {
    expect(() => ipcSlotInstanceId('0'.repeat(44))).toThrow(FreenetIpcInputError);
    expect(() => ipcSlotInstanceId('A'.repeat(31))).toThrow(FreenetIpcInputError);
    expect(() => ipcSlotInstanceId('A'.repeat(65))).toThrow(FreenetIpcInputError);
    expect(() => ipcSlotInstanceId(null)).toThrow(FreenetIpcInputError);
  });
});

describe('ipcPutArgs', () => {
  it('returns bytes and the optional key', () => {
    const bytes = new Uint8Array([1]);
    expect(ipcPutArgs({ bytes })).toEqual({ bytes });
    expect(ipcPutArgs({ bytes, key: 'mist/v1/farm/farm-a/hot/current' })).toEqual({
      bytes,
      key: 'mist/v1/farm/farm-a/hot/current',
    });
  });

  it('refuses a missing envelope or a blob over the cap', () => {
    expect(() => ipcPutArgs(undefined)).toThrow(FreenetIpcInputError);
    expect(() => ipcPutArgs({})).toThrow(FreenetIpcInputError);
    expect(() => ipcPutArgs({ bytes: new Uint8Array(FREENET_IPC_MAX_BLOB_BYTES + 1) })).toThrow(
      /exceeds/,
    );
  });
});

describe('ipcSlotPutArgs', () => {
  it('returns the three slot fields', () => {
    const parameters = new Uint8Array(64);
    const state = new Uint8Array([1, 2]);
    expect(ipcSlotPutArgs({ parameters, state, instanceIdBase58: INSTANCE_ID })).toEqual({
      parameters,
      state,
      instanceIdBase58: INSTANCE_ID,
    });
  });

  it('caps parameters and state separately', () => {
    expect(() =>
      ipcSlotPutArgs({
        parameters: new Uint8Array(FREENET_IPC_MAX_SLOT_PARAMETERS_BYTES + 1),
        state: new Uint8Array([1]),
        instanceIdBase58: INSTANCE_ID,
      }),
    ).toThrow(/parameters/);
    expect(() =>
      ipcSlotPutArgs({
        parameters: new Uint8Array(64),
        state: new Uint8Array(FREENET_IPC_MAX_SLOT_STATE_BYTES + 1),
        instanceIdBase58: INSTANCE_ID,
      }),
    ).toThrow(/state/);
  });

  it('refuses a bad instance id', () => {
    expect(() =>
      ipcSlotPutArgs({ parameters: new Uint8Array(64), state: new Uint8Array([1]), instanceIdBase58: 'nope' }),
    ).toThrow(FreenetIpcInputError);
  });
});
