/**
 * Hermetic native-PUT spike — addressing and request shape, no node.
 */

import { Builder } from 'flatbuffers';
import { describe, expect, it } from 'vitest';

import { encodeFreenet02Uri } from './src/freenet02-uri.ts';
import {
  decodeNativeHostResult,
  encodeNativeAuthenticate,
  encodeNativeClose,
  encodeNativePackPut,
  toNativeFreenetWsUrl,
} from './src/freenet02-native-bincode.ts';
import {
  FREENET02_MAX_BLOB_BYTES,
  PACK_CONTRACT_CODE_HASH_B58,
  packInstanceIdBase58,
  packParametersFromBlob,
  unpackContractWasm,
} from './src/freenet02-pack-id.ts';
import { buildPackPutRequest } from './src/freenet02-native-put.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';

const SAMPLE = new TextEncoder().encode('pufam-native-put-spike');

describe('packInstanceIdBase58', () => {
  it('is deterministic and matches the PutRequest URI', () => {
    const id = packInstanceIdBase58(SAMPLE);
    expect(id.length).toBeGreaterThan(20);
    expect(packInstanceIdBase58(SAMPLE)).toBe(id);

    const wasm = new Uint8Array([0, 1, 2, 3]);
    const built = buildPackPutRequest({ data: SAMPLE, wasm });
    expect(built.instanceIdBase58).toBe(id);
    expect(built.uri).toBe(encodeFreenet02Uri(id));
  });

  it('changes when the blob changes', () => {
    const other = new TextEncoder().encode('pufam-native-put-spike-other');
    expect(packInstanceIdBase58(other)).not.toBe(packInstanceIdBase58(SAMPLE));
  });

  it('rejects blobs over the workshop limit', () => {
    const big = new Uint8Array(FREENET02_MAX_BLOB_BYTES + 1);
    expect(() => packParametersFromBlob(big)).toThrow(/splitfiles not supported/);
  });
});

describe('buildPackPutRequest', () => {
  it('refuses empty WASM', () => {
    expect(() => buildPackPutRequest({ data: SAMPLE, wasm: new Uint8Array() })).toThrow(
      /pack-contract WASM/,
    );
  });

  it('builds a PutRequest with wrapped state matching the blob', () => {
    const wasm = new Uint8Array(16).fill(7);
    const built = buildPackPutRequest({ data: SAMPLE, wasm });
    expect(built.request.wrappedState).toEqual(Array.from(SAMPLE));
    expect(built.request.container).toBeTruthy();
    expect(built.request.relatedContracts).toBeTruthy();
  });

  it('packs without a FlatBuffers required-field error', () => {
    const wasm = new Uint8Array(16).fill(7);
    const built = buildPackPutRequest({ data: SAMPLE, wasm });
    const fbb = new Builder(1024);
    const offset = built.request.pack(fbb);
    expect(offset).toBeGreaterThan(0);
  });
});

/** Locked against freenet-stdlib 0.8.5 / fdev 0.3.287 `bincode::serialize`. */
const FDEV_PUT_HEX =
  '010000000000000000000000000000000c000000000000000061736d0100000074696e798f5d9ef09bb094b80203a92c1a4a62a1965b5c5aca38dc1236310ea75d385420200000000000000096054d8f03bef99dc9f68a23dfdeb0d4b9258246a0578a703bdd16f05c52cffce79bedb2d28982eaf8babd1942f61d1d9d33c48a490f521d50376ab9fda7e4ab8f5d9ef09bb094b80203a92c1a4a62a1965b5c5aca38dc1236310ea75d3854201600000000000000707566616d2d6e61746976652d7075742d7370696b6500000000000000000000';
const FDEV_OK_HEX =
  '000000000000000001000000e79bedb2d28982eaf8babd1942f61d1d9d33c48a490f521d50376ab9fda7e4ab8f5d9ef09bb094b80203a92c1a4a62a1965b5c5aca38dc1236310ea75d385420';
const FDEV_ERR_HEX = '01000000010000000900000000000000626164206672616d65';
const TINY_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x74, 0x69, 0x6e, 0x79]);

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

describe('encodeNativePackPut', () => {
  it('matches the fdev / stdlib 0.8.5 bincode fixture', () => {
    const frame = encodeNativePackPut({ data: SAMPLE, wasm: TINY_WASM });
    expect(Buffer.from(frame.bytes).toString('hex')).toBe(FDEV_PUT_HEX);
    expect(bs58.encode(frame.instanceId)).toBe('Gb75mLx6FC8vKqvUaRMWMrKQz9gQAiuycYF3FQERbzXk');
    expect(bs58.encode(frame.codeHash)).toBe('Aee6mrrKf9v5vYMkebCcubWMNFDZsM4iwMyc1Q4gdSz3');
  });

  it('strips an fdev package header before encoding', () => {
    const header = new Uint8Array(40);
    header.set(unpackContractWasm(TINY_WASM).codeHash, 8);
    const packaged = new Uint8Array(40 + TINY_WASM.byteLength);
    packaged.set(header);
    packaged.set(TINY_WASM, 40);

    const raw = encodeNativePackPut({ data: SAMPLE, wasm: TINY_WASM });
    const wrapped = encodeNativePackPut({ data: SAMPLE, wasm: packaged });
    expect(wrapped.bytes).toEqual(raw.bytes);
  });

  it('refuses empty WASM', () => {
    expect(() => encodeNativePackPut({ data: SAMPLE, wasm: new Uint8Array() })).toThrow(
      /pack-contract WASM/,
    );
  });
});

describe('decodeNativeHostResult', () => {
  it('reads a PutResponse ContractKey', () => {
    const decoded = decodeNativeHostResult(fromHex(FDEV_OK_HEX));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(bs58.encode(decoded.instanceId)).toBe('Gb75mLx6FC8vKqvUaRMWMrKQz9gQAiuycYF3FQERbzXk');
  });

  it('reads a DeserializationError cause', () => {
    const decoded = decodeNativeHostResult(fromHex(FDEV_ERR_HEX));
    expect(decoded).toEqual({ ok: false, message: 'bad frame' });
  });
});

describe('native control frames', () => {
  it('encodes Close and Authenticate the way fdev does', () => {
    expect(Buffer.from(encodeNativeClose()).toString('hex')).toBe('05000000');
    expect(Buffer.from(encodeNativeAuthenticate('tok')).toString('hex')).toBe(
      '030000000300000000000000746f6b',
    );
  });

  it('forces encodingProtocol=native on the WS URL', () => {
    expect(toNativeFreenetWsUrl('ws://127.0.0.1:7509/v1/contract/command')).toContain(
      'encodingProtocol=native',
    );
  });
});

describe('unpackContractWasm', () => {
  it('uses the raw WASM hash inside the bundled pack-contract package', () => {
    const bundled = new Uint8Array(
      readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets/pack-contract.wasm'),
      ),
    );
    const unpacked = unpackContractWasm(bundled);
    expect(bs58.encode(unpacked.codeHash)).toBe(PACK_CONTRACT_CODE_HASH_B58);
    expect([...unpacked.wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });
});
