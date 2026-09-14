import { describe, expect, it } from 'vitest';

import {
  looksLikeFreenet02Version,
  looksLikeFreenet02VersionText,
  looksLikeHtmlStatusBody,
  mergeNodeVersion,
  parseFreenetNodeStatusJson,
} from './src/node-status-json.ts';

describe('looksLikeHtmlStatusBody', () => {
  it('rejects the 0.2 dashboard and other HTML', () => {
    expect(looksLikeHtmlStatusBody('<!DOCTYPE html><html><body>peers</body></html>')).toBe(true);
    expect(looksLikeHtmlStatusBody('  <html lang="en">')).toBe(true);
  });

  it('accepts JSON text', () => {
    expect(looksLikeHtmlStatusBody('{"peerCount":0}')).toBe(false);
  });
});

describe('parseFreenetNodeStatusJson', () => {
  it('returns null for non-objects', () => {
    expect(parseFreenetNodeStatusJson(null)).toBeNull();
    expect(parseFreenetNodeStatusJson('nope')).toBeNull();
    expect(parseFreenetNodeStatusJson(['x'])).toBeNull();
  });

  it('treats an empty object as no peers', () => {
    expect(parseFreenetNodeStatusJson({})).toEqual({
      peers: [],
      peerCount: 0,
      peerSource: 'none',
    });
  });

  it('reads a peer count without inventing locations', () => {
    expect(parseFreenetNodeStatusJson({ peerCount: 4 })).toEqual({
      peers: [],
      peerCount: 4,
      peerSource: 'count',
    });
  });

  it('places peers that have 0–1 locations', () => {
    const parsed = parseFreenetNodeStatusJson({
      location: 0.25,
      peers: [
        { id: 'gw', location: 0.5 },
        { peerId: 'p2', loc: 0.1 },
      ],
    });
    expect(parsed).toMatchObject({
      location: 0.25,
      peerCount: 2,
      peerSource: 'locations',
      peers: [
        { id: 'gw', location: 0.5 },
        { id: 'p2', location: 0.1 },
      ],
    });
  });

  it('keeps peer ids without fabricating locations', () => {
    const parsed = parseFreenetNodeStatusJson({
      connectedPeers: ['alpha', 'beta'],
    });
    expect(parsed).toEqual({
      peers: [{ id: 'alpha' }, { id: 'beta' }],
      peerCount: 2,
      peerSource: 'ids',
    });
  });

  it('rejects locations outside 0–1', () => {
    expect(parseFreenetNodeStatusJson({ location: 1.2, peerCount: 0 })?.location).toBeUndefined();
    expect(parseFreenetNodeStatusJson({ location: -0.1 })?.location).toBeUndefined();
  });
});

describe('mergeNodeVersion', () => {
  it('adds /v1/version without inventing peers', () => {
    const merged = mergeNodeVersion(undefined, { version: '0.2.135' });
    expect(merged).toMatchObject({
      nodeVersion: '0.2.135',
      peerCount: 0,
      peerSource: 'unreported',
    });
  });
});

describe('looksLikeFreenet02Version', () => {
  it('accepts Freenet 0.2 JSON and refuses HTML or other versions', () => {
    expect(looksLikeFreenet02Version({ version: '0.2.135' })).toBe(true);
    expect(looksLikeFreenet02Version({ version: '0.2.123' })).toBe(true);
    expect(looksLikeFreenet02Version({ version: 'Freenet 0.2.135 (ea1ff5f)' })).toBe(true);
    expect(looksLikeFreenet02Version({ version: '1.0.2' })).toBe(false);
    expect(looksLikeFreenet02Version({ version: 'hello' })).toBe(false);
    expect(looksLikeFreenet02Version({})).toBe(false);
    expect(looksLikeFreenet02VersionText('{"version":"0.2.135"}')).toBe(true);
    expect(looksLikeFreenet02VersionText('<!DOCTYPE html><html><title>Dashboard</title>')).toBe(
      false,
    );
  });
});
