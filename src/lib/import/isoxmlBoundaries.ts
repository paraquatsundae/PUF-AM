/**
 * ISOXML TASKDATA.XML boundary import — port of PUF-mobile taskdata.cpp / farmstore importIsoxml.
 * CTR (client) → FRM (farm) → PFD (field/paddock) → PLN/LSG/PNT boundary ring.
 */
import {
  areaHaFromRing,
  simplifyRingForStorage,
  type LonLat,
} from '../boundaryGeometry';

export type IsoxmlField = {
  id: string;
  name: string;
  farmId: string;
  clientId: string;
  boundary: LonLat[];
  areaHa: number;
};

export type IsoxmlFarm = {
  id: string;
  name: string;
  clientId: string;
  fields: IsoxmlField[];
};

export type IsoxmlClient = {
  id: string;
  name: string;
  farms: IsoxmlFarm[];
};

export type IsoxmlTree = {
  clients: IsoxmlClient[];
};

function attr(el: Element, name: string): string {
  return el.getAttribute(name) || '';
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Parse TASKDATA.XML text into client → farm → field tree with WGS84 rings [lon,lat]. */
export function parseIsoxmlTaskData(xmlText: string): IsoxmlTree {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid ISOXML / TASKDATA.XML');
  }

  const clients = new Map<string, IsoxmlClient>();
  const farms = new Map<string, IsoxmlFarm>();
  const fields: IsoxmlField[] = [];

  for (const el of Array.from(doc.getElementsByTagName('CTR'))) {
    const id = attr(el, 'A');
    if (!id) continue;
    clients.set(id, {
      id,
      name: decodeXmlText(attr(el, 'B') || id),
      farms: [],
    });
  }

  for (const el of Array.from(doc.getElementsByTagName('FRM'))) {
    const id = attr(el, 'A');
    const clientId = attr(el, 'I');
    if (!id) continue;
    farms.set(id, {
      id,
      name: decodeXmlText(attr(el, 'B') || id),
      clientId,
      fields: [],
    });
  }

  for (const el of Array.from(doc.getElementsByTagName('PFD'))) {
    const id = attr(el, 'A');
    const name = decodeXmlText(attr(el, 'C') || id || 'Field');
    const clientId = attr(el, 'E');
    const farmId = attr(el, 'F');
    if (!id || !farmId) continue;

    const boundary: LonLat[] = [];
    for (const pln of Array.from(el.getElementsByTagName('PLN'))) {
      if (attr(pln, 'A') !== '1') continue;
      for (const lsg of Array.from(pln.getElementsByTagName('LSG'))) {
        if (attr(lsg, 'A') !== '1') continue;
        for (const pnt of Array.from(lsg.getElementsByTagName('PNT'))) {
          const lat = Number(attr(pnt, 'C'));
          const lon = Number(attr(pnt, 'D'));
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          boundary.push([lon, lat]);
        }
      }
    }

    if (boundary.length < 3) continue;
    const simplified = simplifyRingForStorage(boundary);
    fields.push({
      id,
      name,
      farmId,
      clientId,
      boundary: simplified,
      areaHa: areaHaFromRing(simplified),
    });
  }

  for (const field of fields) {
    const farm = farms.get(field.farmId);
    if (farm) farm.fields.push(field);
  }

  for (const farm of farms.values()) {
    const client = clients.get(farm.clientId);
    if (client) client.farms.push(farm);
    else {
      // Orphan farm — attach under synthetic client
      const synId = `_orphan_${farm.clientId || 'x'}`;
      let syn = clients.get(synId);
      if (!syn) {
        syn = { id: synId, name: 'Imported', farms: [] };
        clients.set(synId, syn);
      }
      syn.farms.push(farm);
    }
  }

  return { clients: [...clients.values()].filter((c) => c.farms.some((f) => f.fields.length)) };
}

export function flattenIsoxmlFarms(tree: IsoxmlTree): IsoxmlFarm[] {
  const out: IsoxmlFarm[] = [];
  for (const c of tree.clients) out.push(...c.farms);
  return out;
}

/** Find TASKDATA.XML text inside a FileList / zip-like folder structure is caller’s job. */
export function looksLikeTaskDataXml(text: string): boolean {
  return /ISO11783_TaskData|TASKDATA|<PFD\b|<FRM\b/i.test(text);
}
