/**
 * Small-world ring: this node + real peers, or N count-only dots.
 * Does not invent peers — the caller passes 0 or N.
 * Contract flashes are this node ↔ network (or a named peer when the log has one).
 */

import React from 'react';

import type { FreenetContractTrafficEvent } from '../lib/freenetContractTraffic';
import type { FreenetRingDot } from '../lib/freenetRingStatus';

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 78;

function xy(angle: number, radius = R): { x: number; y: number } {
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
}

function matchPeerDot(dots: FreenetRingDot[], peerId?: string): FreenetRingDot | undefined {
  if (!peerId) return undefined;
  return dots.find(
    (dot) =>
      dot.kind === 'peer' &&
      (dot.key === `peer-${peerId}` || dot.key.endsWith(peerId) || dot.key.includes(peerId)),
  );
}

function TrafficFlash({
  event,
  self,
  dots,
}: {
  event: FreenetContractTrafficEvent;
  self: FreenetRingDot;
  dots: FreenetRingDot[];
}) {
  const from = xy(self.angle);
  const named = matchPeerDot(dots, event.peerId);
  const target = named ? 'peer' : 'ring';
  const to = named ? xy(named.angle) : xy(self.angle, R * 0.42);
  const start = event.direction === 'out' ? from : to;
  const end = event.direction === 'out' ? to : from;
  const sweep = event.direction === 'out' ? 0.55 : -0.55;
  const mid = xy(self.angle + sweep * 0.5, R);
  const arcEnd = xy(self.angle + sweep, R);

  return (
    <g
      data-testid="freenet-ring-traffic"
      data-direction={event.direction}
      data-target={target}
      data-slot-kind={event.slotKind}
      data-op={event.op}
    >
      <path
        data-testid="freenet-ring-traffic-arc"
        d={`M ${from.x} ${from.y} Q ${mid.x} ${mid.y} ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke="currentColor"
        className="text-violet-500"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ animation: 'pufam-fn-traffic 3.6s ease-out forwards' }}
      />
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="currentColor"
        className="text-violet-400"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ animation: 'pufam-fn-traffic 3.6s ease-out forwards' }}
      />
    </g>
  );
}

export function FreenetPeerRing({
  dots,
  placement,
  peerCount,
  traffic = [],
}: {
  dots: FreenetRingDot[];
  placement: 'locations' | 'count' | 'empty';
  peerCount: number;
  traffic?: FreenetContractTrafficEvent[];
}) {
  const self = dots.find((d) => d.kind === 'self');
  const peers = dots.filter((d) => d.kind === 'peer');
  const latest = traffic[0];
  const label =
    placement === 'empty'
      ? 'Freenet ring, this node'
      : placement === 'locations'
        ? `Freenet ring, this node and ${peerCount} peer${peerCount === 1 ? '' : 's'} placed by location`
        : `Freenet ring, this node and ${peerCount} peer${peerCount === 1 ? '' : 's'} (count only)`;

  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="freenet-peer-ring"
      data-placement={placement}
      data-peer-count={peerCount}
      data-traffic-count={traffic.length}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[220px] mx-auto"
    >
      <style>
        {`@keyframes pufam-fn-traffic { 0% { opacity: 0.95; } 100% { opacity: 0; } }`}
      </style>
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="currentColor"
        className="text-slate-200"
        strokeWidth="2"
      />
      {self &&
        traffic.map((event) => <TrafficFlash key={event.id} event={event} self={self} dots={dots} />)}
      {peers.map((dot) => {
        const p = xy(dot.angle);
        return (
          <circle
            key={dot.key}
            data-testid="freenet-ring-peer"
            cx={p.x}
            cy={p.y}
            r={5}
            className="fill-slate-400"
          />
        );
      })}
      {self && (
        <g data-testid="freenet-ring-self">
          <circle cx={xy(self.angle).x} cy={xy(self.angle).y} r={8} className="fill-violet-600" />
          <text
            x={xy(self.angle, R + 18).x}
            y={xy(self.angle, R + 18).y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-violet-800 text-[10px] font-semibold"
          >
            this node
          </text>
        </g>
      )}
      {latest ? (
        <text
          data-testid="freenet-ring-traffic-label"
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-violet-800 text-[11px] font-semibold"
        >
          {latest.label}
        </text>
      ) : null}
    </svg>
  );
}
