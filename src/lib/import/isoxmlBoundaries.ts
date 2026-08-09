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

export type IsoxmlParseStats = {
  pfdTotal: number;
  pfdWithBoundary: number;
  pfdMissingFarm: number;
  pfdNoRing: number;
  hintsExternalGeometry: boolean;
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

function elementsByTag(root: ParentNode, tag: string): Element[] {
  // Prefer NS-agnostic match (some ISOXML exports declare a default xmlns).
  const ns = (root as Document | Element).getElementsByTagNameNS?.('*', tag);
  if (ns && ns.length) return Array.from(ns);
  return Array.from((root as Document | Element).getElementsByTagName(tag));
}

function ringFromPfd(el: Element): LonLat[] {
  const boundary: LonLat[] = [];
  for (const pln of elementsByTag(el, 'PLN')) {
    // PartfieldBoundary — ISO 11783-10 type 1. Also accept missing/empty A (some exporters omit it).
    const plnType = attr(pln, 'A');
    if (plnType && plnType !== '1') continue;
    for (const lsg of elementsByTag(pln, 'LSG')) {
      const lsgType = attr(lsg, 'A');
      if (lsgType && lsgType !== '1') continue; // PolygonExterior
      for (const pnt of elementsByTag(lsg, 'PNT')) {
        const lat = Number(attr(pnt, 'C'));
        const lon = Number(attr(pnt, 'D'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        boundary.push([lon, lat]);
      }
    }
  }
  return boundary;
}

function externalGeometryHints(xmlText: string): boolean {
  return /<XFR\b|\.BNN\b|\.BIN\b|BinaryData/i.test(xmlText);
}

/** Parse TASKDATA.XML text into client → farm → field tree with WGS84 rings [lon,lat]. */
export function parseIsoxmlTaskData(xmlText: string): IsoxmlTree {
  const { tree } = parseIsoxmlTaskDataWithStats(xmlText);
  return tree;
}

export function parseIsoxmlTaskDataWithStats(xmlText: string): {
  tree: IsoxmlTree;
  stats: IsoxmlParseStats;
} {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid ISOXML / TASKDATA.XML (XML parse failed — check encoding).');
  }

  const clients = new Map<string, IsoxmlClient>();
  const farms = new Map<string, IsoxmlFarm>();
  const fields: IsoxmlField[] = [];
  let pfdTotal = 0;
  let pfdMissingFarm = 0;
  let pfdNoRing = 0;

  for (const el of elementsByTag(doc, 'CTR')) {
    const id = attr(el, 'A');
    if (!id) continue;
    clients.set(id, {
      id,
      name: decodeXmlText(attr(el, 'B') || id),
      farms: [],
    });
  }

  for (const el of elementsByTag(doc, 'FRM')) {
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

  for (const el of elementsByTag(doc, 'PFD')) {
    pfdTotal += 1;
    const id = attr(el, 'A');
    const name = decodeXmlText(attr(el, 'C') || id || 'Field');
    const clientId = attr(el, 'E');
    const farmId = attr(el, 'F');
    if (!id || !farmId) {
      pfdMissingFarm += 1;
      continue;
    }

    const boundary = ringFromPfd(el);
    if (boundary.length < 3) {
      pfdNoRing += 1;
      continue;
    }
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

  const tree: IsoxmlTree = {
    clients: [...clients.values()].filter((c) => c.farms.some((f) => f.fields.length)),
  };
  const stats: IsoxmlParseStats = {
    pfdTotal,
    pfdWithBoundary: fields.length,
    pfdMissingFarm,
    pfdNoRing,
    hintsExternalGeometry: externalGeometryHints(xmlText),
  };
  return { tree, stats };
}

/** Human-readable reason when parse yields zero importable paddocks. */
export function describeEmptyIsoxml(stats: IsoxmlParseStats): string {
  if (stats.pfdTotal === 0) {
    return 'No paddocks (PFD) found in TASKDATA.XML. Confirm this is an Ops Center field/boundary export, not LINKLIST.XML or a timelog.';
  }
  if (stats.hintsExternalGeometry || stats.pfdNoRing > 0) {
    return (
      `Found ${stats.pfdTotal} paddock(s) but ${stats.pfdNoRing || stats.pfdTotal} have no inline boundary polygons. ` +
      'John Deere sometimes stores geometry in companion files — import the whole Taskdata folder as a .zip (preferred), not TASKDATA.XML alone.'
    );
  }
  if (stats.pfdMissingFarm) {
    return `Found ${stats.pfdTotal} paddock(s) but ${stats.pfdMissingFarm} are missing farm links (PFD/@F).`;
  }
  return 'No field boundaries found in TASKDATA.XML.';
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
