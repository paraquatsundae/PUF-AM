import { describe, expect, it } from 'vitest';
import { encodeFreenet02Uri, isFreenet02Uri, parseFreenet02Uri } from './src/freenet02-uri.ts';
import {
  blake3Bytes,
  FREENET02_MAX_BLOB_BYTES,
  packParametersFromBlob,
} from './src/freenet02-pack.ts';
import {
  createFreenetTransport,
  describeFreenetTransportKind,
} from './src/create-freenet-transport.ts';
import { Freenet02WsTransport } from './src/freenet02-ws-transport.ts';

describe('freenet02-uri', () => {
  it('round-trips base58 instance ids', () => {
    const id = 'GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp';
    const uri = encodeFreenet02Uri(id);
    expect(uri.startsWith('FN02@')).toBe(true);
    expect(parseFreenet02Uri(uri)).toBe(id);
    expect(isFreenet02Uri(uri)).toBe(true);
    expect(isFreenet02Uri('CHK@abc')).toBe(false);
  });
});

describe('createFreenetTransport', () => {
  // Phase 2 of Plans/FREENET_NETWORK_PACK.md removed the Hyphanet FCP backend and
  // the FREENET_TRANSPORT selector: there is one wire, and nothing in the
  // environment can pick another.
  it('always builds the Freenet 0.2 WebSocket transport', async () => {
    const transport = createFreenetTransport();
    expect(transport).toBeInstanceOf(Freenet02WsTransport);
    expect((await transport.health()).transportId).toBe('ws02');
  });

  it('honours a ws02 endpoint option', async () => {
    const transport = createFreenetTransport({
      ws02: { wsUrl: 'ws://127.0.0.1:7609/v1/contract/command' },
    });
    const health = await transport.health();
    expect(health.port).toBe(7609);
    expect(health.endpoint).toBe('ws://127.0.0.1:7609/v1/contract/command');
  });

  it('labels the one backend it has', () => {
    expect(describeFreenetTransportKind()).toBe('Freenet 0.2 WebSocket');
  });
});

describe('packParametersFromBlob', () => {
  it('returns 32-byte BLAKE3 digest', () => {
    const data = new TextEncoder().encode('mist-workshop-ciphertext');
    const params = packParametersFromBlob(data);
    expect(params.byteLength).toBe(32);
    expect(blake3Bytes(data)).toEqual(params);
  });

  it('rejects blobs over workshop limit', () => {
    const big = new Uint8Array(FREENET02_MAX_BLOB_BYTES + 1);
    expect(() => packParametersFromBlob(big)).toThrow(/splitfiles not supported/);
  });
});

describe('normalizeMistFreenetUri', () => {
  it('accepts FN02@ prefix', async () => {
    const { normalizeMistFreenetUri } = await import('./src/freenet-uri-normalize.ts');
    const uri = 'FN02@GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp';
    expect(normalizeMistFreenetUri(uri)).toBe(uri);
  });

  it('wraps bare base58 contract id', async () => {
    const { normalizeMistFreenetUri } = await import('./src/freenet-uri-normalize.ts');
    const id = 'GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp';
    expect(normalizeMistFreenetUri(id)).toBe(`FN02@${id}`);
  });

  it('accepts legacy CHK@ URIs', async () => {
    const { normalizeMistFreenetUri } = await import('./src/freenet-uri-normalize.ts');
    const chk = 'CHK@abc,def,AAEC--8';
    expect(normalizeMistFreenetUri(chk)).toBe(chk);
  });

  it('rejects empty and garbage input', async () => {
    const { normalizeMistFreenetUri, InvalidFreenetUriError } = await import(
      './src/freenet-uri-normalize.ts'
    );
    expect(() => normalizeMistFreenetUri('')).toThrow(InvalidFreenetUriError);
    expect(() => normalizeMistFreenetUri('not-a-uri')).toThrow(/Invalid Freenet URI/);
  });
});
