/**
 * Fade polylines for recent presence trail points (last 2 minutes).
 */
import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../lib/leaflet-setup';
import { presenceColourForUid, type CrewPresenceDoc } from '../../lib/crewPresence';
import {
  isVehiclePresence,
  pruneTrail,
  trailOpacityAt,
  type BreadTrailPrefs,
  type TrailPoint,
} from '../../lib/breadTrails';

type Props = {
  selfUid: string | null | undefined;
  selfTrail: TrailPoint[];
  others: CrewPresenceDoc[];
  prefs: BreadTrailPrefs;
};

function drawTrail(
  group: L.LayerGroup,
  points: TrailPoint[],
  colour: string,
  weight: number,
  nowMs: number
): void {
  const pts = pruneTrail(points, nowMs);
  if (pts.length < 2) return;
  for (let i = 1; i < pts.length; i++) {
    const age = nowMs - pts[i].t;
    const opacity = trailOpacityAt(age);
    if (opacity <= 0.02) continue;
    L.polyline(
      [
        [pts[i - 1].lat, pts[i - 1].lng],
        [pts[i].lat, pts[i].lng],
      ],
      {
        color: colour,
        opacity,
        weight,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        className: 'pufom-bread-trail',
      }
    ).addTo(group);
  }
}

export function BreadTrailLayer({ selfUid, selfTrail, others, prefs }: Props) {
  const map = useMap();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);

    if (prefs.showMine && selfUid && selfTrail.length >= 2) {
      drawTrail(group, selfTrail, presenceColourForUid(selfUid), 3, now);
    }

    for (const p of others) {
      const trail = p.trail || [];
      if (trail.length < 2) continue;
      const vehicle = isVehiclePresence(p);
      if (vehicle) {
        if (!prefs.showMachines) continue;
      } else if (!prefs.showEveryone) {
        continue;
      }
      drawTrail(group, trail, presenceColourForUid(p.uid), vehicle ? 6 : 3, now);
    }

    return () => {
      map.removeLayer(group);
    };
  }, [map, selfUid, selfTrail, others, prefs, now]);

  return null;
}
