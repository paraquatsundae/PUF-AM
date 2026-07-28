/**
 * KML paddock import — port of PUF-mobile kmlimport.cpp (outer rings → fields).
 */
import {
  areaHaFromRing,
  simplifyRingForStorage,
  type LonLat,
} from '../boundaryGeometry';

export type KmlField = {
  name: string;
  boundary: LonLat[];
  areaHa: number;
};

function textContent(el: Element | null): string {
  return (el?.textContent || '').trim();
}

function parseCoordinates(text: string): LonLat[] {
  const out: LonLat[] = [];
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const parts = token.split(',');
    if (parts.length < 2) continue;
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push([lon, lat]);
  }
  // Drop closing duplicate
  if (out.length >= 2) {
    const [a0, a1] = out[0];
    const [b0, b1] = out[out.length - 1];
    if (a0 === b0 && a1 === b1) out.pop();
  }
  return out;
}

export function parseKmlFields(kmlText: string): KmlField[] {
  const doc = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid KML');
  }

  const fields: KmlField[] = [];
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  let n = 0;
  for (const pm of placemarks) {
    const nameEl = pm.getElementsByTagName('name')[0];
    const name = textContent(nameEl) || `Field ${++n}`;

    const outers = Array.from(pm.getElementsByTagName('outerBoundaryIs'));
    for (const outer of outers) {
      const rings = Array.from(outer.getElementsByTagName('LinearRing'));
      for (const ring of rings) {
        const coordsEl = ring.getElementsByTagName('coordinates')[0];
        const boundary = parseCoordinates(textContent(coordsEl));
        if (boundary.length < 3) continue;
        const simplified = simplifyRingForStorage(boundary);
        fields.push({
          name,
          boundary: simplified,
          areaHa: areaHaFromRing(simplified),
        });
      }
    }

    // Bare Polygon/LinearRing without outerBoundaryIs
    if (outers.length === 0) {
      for (const ring of Array.from(pm.getElementsByTagName('LinearRing'))) {
        if (ring.closest('innerBoundaryIs')) continue;
        const coordsEl = ring.getElementsByTagName('coordinates')[0];
        const boundary = parseCoordinates(textContent(coordsEl));
        if (boundary.length < 3) continue;
        const simplified = simplifyRingForStorage(boundary);
        fields.push({
          name,
          boundary: simplified,
          areaHa: areaHaFromRing(simplified),
        });
      }
    }
  }
  return fields;
}
