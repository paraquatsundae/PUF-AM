import { describe, expect, it } from 'vitest';

import {
  createFreenetContractTrafficEvent,
  freenetContractTrafficLabel,
  mergeFreenetContractTraffic,
  parseFreenetLogContractLine,
  parseFreenetLogContractTraffic,
  slotKindFromStorageKey,
  visibleFreenetContractTraffic,
} from './src/contract-traffic.ts';

const NOW = Date.parse('2026-09-14T11:00:16.012Z');

const CLIENT_GET =
  '2026-09-14T11:00:16.012796Z  INFO client_event_handling:process_client_request: freenet::client_events: Returning locally cached contract state client_id=2000002 request_id=req-11000003 peer=65.181.23.138:41419 contract=FRYxGUjEW1nSkwvSbaLpRTcEWt7i7FeDbK6UMWicTw9m is_subscribed=true has_local_interest=true connection_count=22 phase="local_cache"';

const CLIENT_PUT =
  '2026-09-14T11:00:16.100000Z  INFO client_event_handling:process_client_request: freenet::client_events: Put accepted request_id=req-put-1 contract=HotPackContractKeyAAAA';

const GET_RELAY =
  '2026-09-14T11:00:51.365424Z  INFO freenet::operations::get::op_ctx_task: GET relay: downstream returned ResponseStreaming — forwarding stream upstream tx=01M2FS79FHV9CWDX7JMFNWJS02 contract=68i7VVAF3rDF47TqnKCys8ewXewEacJqkVcF6wXZsE1J';

const SUBSCRIBE =
  '2026-09-14T11:00:02.491722Z  INFO freenet::operations::subscribe::op_ctx_task: subscribe: subscribed tx=01M2FS5VV45VNFEACHNGHHDK03 contract=BSx4LnewLPNKeUbpUH91vGZMNcaB2M6Jgwjr8Ayx4yaH target=89.154.41.171:32960 outcome="subscribed"';

const NEIGHBOR =
  '2026-09-14T11:00:00.103459Z  INFO process_network_message{tx_type=connect}: freenet::node::neighbor_hosting: NEIGHBOR_HOSTING: Updated neighbor hosting state peer=34XGFY8gMt7kj84fd total_contracts=439';

describe('parseFreenetLogContractLine', () => {
  it('reads this node’s WS GET from process_client_request', () => {
    const hit = parseFreenetLogContractLine(CLIENT_GET, { nowMs: NOW, freshMs: null });
    expect(hit).toMatchObject({
      op: 'get',
      direction: 'in',
      source: 'log',
      slotKind: 'unknown',
      label: 'Fetched contract',
      contractKey: 'FRYxGUjEW1nSkwvSbaLpRTcEWt7i7FeDbK6UMWicTw9m',
      peerId: '65.181.23.138:41419',
      id: 'log-req-11000003',
    });
  });

  it('reads a WS PUT from process_client_request', () => {
    expect(parseFreenetLogContractLine(CLIENT_PUT, { nowMs: NOW, freshMs: null })).toMatchObject({
      op: 'put',
      direction: 'out',
      label: 'Sent contract',
    });
  });

  it('does not invent hops from relay, subscribe, neighbor, or HTML', () => {
    const opts = { nowMs: NOW, freshMs: null as const };
    expect(parseFreenetLogContractLine(GET_RELAY, opts)).toBeNull();
    expect(parseFreenetLogContractLine(SUBSCRIBE, opts)).toBeNull();
    expect(parseFreenetLogContractLine(NEIGHBOR, opts)).toBeNull();
    expect(parseFreenetLogContractLine('<html>contract=ABC process_client_request</html>', opts)).toBeNull();
    expect(parseFreenetLogContractLine('ring_connections=25', opts)).toBeNull();
  });

  it('drops a leftover line outside the freshness window', () => {
    expect(
      parseFreenetLogContractLine(CLIENT_GET, { nowMs: Date.parse('2026-09-14T11:10:16Z') }),
    ).toBeNull();
  });
});

describe('parseFreenetLogContractTraffic', () => {
  it('keeps the client GET and skips relay in the same tail', () => {
    const text = `${NEIGHBOR}\n${CLIENT_GET}\n${GET_RELAY}\n`;
    const events = parseFreenetLogContractTraffic(text, { nowMs: NOW, freshMs: null });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('log-req-11000003');
  });
});

describe('slotKindFromStorageKey + labels', () => {
  it('maps mist keys and host IPC identifiers', () => {
    expect(slotKindFromStorageKey('mist/v1/farm/f1/hot/current')).toBe('hot');
    expect(slotKindFromStorageKey('mist/v1/farm/f1/bones/farm-geometry')).toBe('bones');
    expect(slotKindFromStorageKey('mist/v1/farm/f1/hot/photo/issue1/p1')).toBe('photo');
    expect(slotKindFromStorageKey('mist/v1/farm/f1/hot/photos')).toBe('photo');
    expect(slotKindFromStorageKey(undefined)).toBe('unknown');
  });

  it('labels Send / Fetch when the slot kind is known', () => {
    expect(freenetContractTrafficLabel('put', 'hot')).toBe('Sent Hot');
    expect(freenetContractTrafficLabel('get', 'bones')).toBe('Fetched Bones');
    expect(freenetContractTrafficLabel('get', 'watch')).toBe('Fetched watch');
    expect(freenetContractTrafficLabel('put', 'invite')).toBe('Sent invite');
  });
});

describe('mergeFreenetContractTraffic', () => {
  it('prefers a host event with a slot kind over the log GET of the same contract', () => {
    const log = parseFreenetLogContractLine(CLIENT_GET, { nowMs: NOW, freshMs: null })!;
    const host = createFreenetContractTrafficEvent({
      op: 'get',
      source: 'host',
      slotKind: 'watch',
      at: NOW + 200,
      contractKey: log.contractKey,
    });
    const merged = mergeFreenetContractTraffic([log, host], NOW + 200, null);
    expect(merged).toHaveLength(1);
    expect(merged[0].label).toBe('Fetched watch');
    expect(merged[0].source).toBe('host');
  });

  it('hides events after the fade window (idle ring)', () => {
    const host = createFreenetContractTrafficEvent({
      op: 'put',
      source: 'host',
      slotKind: 'hot',
      at: NOW - 8_000,
    });
    expect(visibleFreenetContractTraffic([host], NOW)).toEqual([]);
  });
});
