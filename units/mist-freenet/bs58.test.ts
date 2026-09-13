import { describe, expect, it } from 'vitest';

import bs58 from './src/bs58.ts';
import { unwrapBs58 } from './src/bs58.ts';

const SAMPLE = new Uint8Array([0x74, 0x65, 0x73, 0x74]);

describe('bs58 interop helper', () => {
  it('yields encode and decode functions after import', () => {
    expect(typeof bs58.decode).toBe('function');
    expect(typeof bs58.encode).toBe('function');
    expect(bs58.decode(bs58.encode(SAMPLE))).toEqual(SAMPLE);
  });

  it('unwraps the esbuild __toESM(require("bs58"), 1) shape', () => {
    const codec = { encode: bs58.encode, decode: bs58.decode };
    const nodeCompatDefault = { default: codec, __esModule: true };
    const unwrapped = unwrapBs58(nodeCompatDefault);
    expect(typeof unwrapped.decode).toBe('function');
    expect(unwrapped.decode(unwrapped.encode(SAMPLE))).toEqual(SAMPLE);
  });

  it('unwraps a double-default CJS/ESM wrap', () => {
    const codec = { encode: bs58.encode, decode: bs58.decode };
    const unwrapped = unwrapBs58({ default: { default: codec } });
    expect(typeof unwrapped.decode).toBe('function');
    expect(unwrapped.encode(SAMPLE)).toBe(bs58.encode(SAMPLE));
  });
});
