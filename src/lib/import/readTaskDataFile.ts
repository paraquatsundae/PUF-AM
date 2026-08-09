/**
 * Load TASKDATA.XML / KML from a raw file or Ops Center zip folder.
 */
import { unzipSync } from 'fflate';
import { looksLikeTaskDataXml } from './isoxmlBoundaries';

export type LoadedImportText = {
  kind: 'xml' | 'kml';
  text: string;
  /** Display name of the source entry (file or zip member). */
  sourceName: string;
  fromZip: boolean;
};

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

function isTaskDataName(name: string): boolean {
  return /^taskdata\.xml$/i.test(basename(name));
}

function isKmlName(name: string): boolean {
  return /\.kml$/i.test(basename(name));
}

/** Prefer TASKDATA/TASKDATA.XML nesting used by JD Ops Center. */
function pickTaskDataFromZip(files: Record<string, Uint8Array>): { path: string; bytes: Uint8Array } | null {
  const entries = Object.keys(files).filter((p) => !p.endsWith('/'));
  const taskDatas = entries.filter(isTaskDataName);
  if (!taskDatas.length) return null;
  taskDatas.sort((a, b) => {
    const aScore = /\/TASKDATA\//i.test(a) || /^TASKDATA\//i.test(a) ? 0 : 1;
    const bScore = /\/TASKDATA\//i.test(b) || /^TASKDATA\//i.test(b) ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return a.length - b.length;
  });
  const path = taskDatas[0];
  return { path, bytes: files[path] };
}

function pickKmlFromZip(files: Record<string, Uint8Array>): { path: string; bytes: Uint8Array } | null {
  const entries = Object.keys(files).filter((p) => !p.endsWith('/') && isKmlName(p));
  if (!entries.length) return null;
  entries.sort((a, b) => a.length - b.length);
  const path = entries[0];
  return { path, bytes: files[path] };
}

function looksLikeZip(file: File, bytes: Uint8Array): boolean {
  if (/\.zip$/i.test(file.name)) return true;
  // PK\x03\x04 or PK\x05\x06
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

/**
 * Read a user-picked import file. Supports:
 * - TASKDATA.XML / Taskdata.xml (any case)
 * - .kml
 * - .zip containing TASKDATA.XML (JD Ops Center “Files” export)
 */
export async function loadImportFile(file: File): Promise<LoadedImportText> {
  const name = file.name;
  const lower = name.toLowerCase();

  if (lower.endsWith('.kml')) {
    return { kind: 'kml', text: await file.text(), sourceName: name, fromZip: false };
  }

  const buf = new Uint8Array(await file.arrayBuffer());

  if (looksLikeZip(file, buf)) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(buf);
    } catch {
      throw new Error('Could not read zip. Re-export from Ops Center or unzip and pick TASKDATA.XML.');
    }
    const task = pickTaskDataFromZip(files);
    if (task) {
      const text = decodeUtf8(task.bytes);
      if (!looksLikeTaskDataXml(text)) {
        throw new Error(`Zip member “${task.path}” does not look like ISOXML TASKDATA.`);
      }
      return { kind: 'xml', text, sourceName: `${name} → ${task.path}`, fromZip: true };
    }
    const kml = pickKmlFromZip(files);
    if (kml) {
      return {
        kind: 'kml',
        text: decodeUtf8(kml.bytes),
        sourceName: `${name} → ${kml.path}`,
        fromZip: true,
      };
    }
    throw new Error(
      'No TASKDATA.XML found inside this zip. Export the whole Taskdata folder from Ops Center (Files → zip), not a single linked binary.'
    );
  }

  if (lower.endsWith('.xml') || lower.endsWith('.xml.txt')) {
    const text = decodeUtf8(buf);
    return { kind: 'xml', text, sourceName: name, fromZip: false };
  }

  // Fallback: sniff content (some Android pickers lose extensions)
  const text = decodeUtf8(buf);
  if (text.includes('<kml') || text.includes('<KML')) {
    return { kind: 'kml', text, sourceName: name, fromZip: false };
  }
  if (looksLikeTaskDataXml(text)) {
    return { kind: 'xml', text, sourceName: name, fromZip: false };
  }

  throw new Error(
    'Choose TASKDATA.XML, a .kml, or a .zip of the Ops Center Taskdata folder.'
  );
}
