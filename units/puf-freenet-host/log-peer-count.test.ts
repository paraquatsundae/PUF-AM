import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  FREENET_LOG_RING_LAST,
  lineHasFreenetLogPeerCount,
  mergeFreenetRingFromLog,
  parseFreenetLogPeerCount,
  parseFreenetLogPeerLine,
  readFreenetLogContractTraffic,
  readFreenetLogPeerCount,
} from './src/log-peer-count.ts';

const NOW = Date.parse('2026-09-14T10:30:45.000Z');

const RING_26 =
  '2026-09-14T10:30:45.621884Z  INFO network_event_listener{peer=4Wa4YoksReG9zvvvm}: freenet::node::network_bridge::p2p_protoc: Event loop stats iterations=48 slow_events=0 notification_channel_pending=0 notification_channel_capacity=2048 active_connections=26 ring_connections=26';

const CONN_0 =
  '2026-09-14T10:30:40.000000Z  INFO freenet::ring::connection_manager: add_connection: successfully added to ring addr=157.211.45.177:19114 peer_location=0.19879088778767487 connection_count=0';

const CONN_5 =
  '2026-09-14T10:30:58.234464Z  INFO client_event_handling:process_client_request: freenet::client_events: Returning locally cached contract state connection_count=5 phase="local_cache"';

describe('parseFreenetLogPeerLine', () => {
  it('reads ring_connections from the event-loop stats line', () => {
    expect(parseFreenetLogPeerLine(RING_26)).toEqual({
      peerCount: 26,
      key: 'ring_connections',
    });
  });

  it('prefers ring_connections when a line also has connection_count', () => {
    expect(
      parseFreenetLogPeerLine('active_connections=29 ring_connections=26 connection_count=30'),
    ).toEqual({ peerCount: 26, key: 'ring_connections' });
  });

  it('reads connection_count when that is the only key', () => {
    expect(parseFreenetLogPeerLine(CONN_0)).toEqual({ peerCount: 0, key: 'connection_count' });
  });

  it('does not scrape HTML or invent a count', () => {
    expect(parseFreenetLogPeerLine('<html>ring_connections=9</html>')).toBeNull();
    expect(parseFreenetLogPeerLine('own-loc 0.2 peers 12')).toBeNull();
    expect(lineHasFreenetLogPeerCount('no counts here')).toBe(false);
  });
});

describe('parseFreenetLogPeerCount', () => {
  it('returns the latest N (later connection_count wins over an earlier ring)', () => {
    const text = `${RING_26}\n${CONN_5}\n`;
    expect(parseFreenetLogPeerCount(text, { nowMs: NOW, freshMs: null })).toEqual({
      peerCount: 5,
      key: 'connection_count',
    });
  });

  it('returns 0 when the latest line says 0', () => {
    expect(parseFreenetLogPeerCount(`${RING_26}\n${CONN_0}\n`, { nowMs: NOW, freshMs: null })).toEqual(
      { peerCount: 0, key: 'connection_count' },
    );
  });

  it('returns null when there is no matching line', () => {
    expect(parseFreenetLogPeerCount('node starting\n', { nowMs: NOW, freshMs: null })).toBeNull();
  });

  it('ignores a leftover line outside the freshness window', () => {
    expect(
      parseFreenetLogPeerCount(RING_26, { nowMs: Date.parse('2026-09-14T13:30:45Z') }),
    ).toBeNull();
    expect(parseFreenetLogPeerCount(RING_26, { nowMs: NOW })).toEqual({
      peerCount: 26,
      key: 'ring_connections',
    });
  });
});

describe('mergeFreenetRingFromLog', () => {
  it('fills count-only N when JSON is unreported', () => {
    expect(
      mergeFreenetRingFromLog(
        { peers: [], peerCount: 0, peerSource: 'unreported', nodeVersion: '0.2.135' },
        { peerCount: 26, key: 'ring_connections' },
      ),
    ).toEqual({
      peers: [],
      peerCount: 26,
      peerSource: 'count',
      nodeVersion: '0.2.135',
    });
  });

  it('does not override a real JSON peer list', () => {
    const json = {
      peers: [{ id: 'a', location: 0.2 }],
      peerCount: 1,
      peerSource: 'locations' as const,
    };
    expect(mergeFreenetRingFromLog(json, { peerCount: 26, key: 'ring_connections' })).toEqual(json);
  });
});

describe('readFreenetLogPeerCount', () => {
  it('reads the newest hour log and skips error logs', () => {
    const dir = join(tmpdir(), `puf-freenet-log-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'freenet.error.2026-09-14-10.log'), 'ring_connections=99\n');
    writeFileSync(join(dir, 'freenet.2026-09-14-09.log'), 'ring_connections=3\n');
    writeFileSync(join(dir, 'freenet.2026-09-14-10.log'), `${RING_26}\n`);
    expect(readFreenetLogPeerCount(dir, { nowMs: NOW, freshMs: null })).toEqual({
      peerCount: 26,
      key: 'ring_connections',
    });
  });

  it('falls back to pufam-ring.last when hour files have no line', () => {
    const dir = join(tmpdir(), `puf-freenet-log-last-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, FREENET_LOG_RING_LAST), 'ring_connections=4\n');
    expect(readFreenetLogPeerCount(dir, { nowMs: NOW, freshMs: null })).toEqual({
      peerCount: 4,
      key: 'ring_connections',
    });
  });
});

describe('readFreenetLogContractTraffic', () => {
  it('parses a client GET from the newest hour log and skips HTML', () => {
    const dir = join(tmpdir(), `puf-freenet-traffic-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const get =
      '2026-09-14T10:30:45.000000Z  INFO client_event_handling:process_client_request: freenet::client_events: Returning locally cached contract state request_id=req-9 contract=AbcdefghContractKey01 connection_count=5';
    writeFileSync(join(dir, 'freenet.error.2026-09-14-10.log'), `${get}\n`);
    writeFileSync(join(dir, 'index.html'), `<html>${get}</html>\n`);
    writeFileSync(join(dir, 'freenet.2026-09-14-10.log'), `${get}\n`);
    const events = readFreenetLogContractTraffic(dir, { nowMs: NOW, freshMs: null });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ op: 'get', id: 'log-req-9', source: 'log' });
  });
});
