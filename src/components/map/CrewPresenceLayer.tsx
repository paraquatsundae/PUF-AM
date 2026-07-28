/**
 * Other farm members' live GPS markers (self stays UserLocationLayer).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from '../../lib/leaflet-setup';
import {
  presenceColourForUid,
  secondsAgoLabel,
  type CrewPresenceDoc,
} from '../../lib/crewPresence';

type Props = {
  others: CrewPresenceDoc[];
};

function crewIcon(colour: string) {
  return L.divIcon({
    className: 'pufom-crew-presence-icon',
    html: `
      <div class="pufom-crew-loc" style="--crew-colour:${colour}">
        <span class="pufom-crew-loc__dot"></span>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function CrewPresenceLayer({ others }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const icons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    for (const p of others) {
      map.set(p.uid, crewIcon(presenceColourForUid(p.uid)));
    }
    return map;
  }, [others]);

  if (!others.length) return null;

  return (
    <>
      {others.map((p) => (
        <Marker
          key={p.uid}
          position={[p.lat, p.lng]}
          icon={icons.get(p.uid) || crewIcon(presenceColourForUid(p.uid))}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold text-slate-900">{p.displayName || 'Crew'}</p>
              <p className="text-xs text-slate-500">{secondsAgoLabel(p.updatedAt, now)}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
