/**
 * @vitest-environment jsdom
 *
 * The diary page's export is one sheet, so it is one file.
 *
 * It passes `includeIssues: false`, so zipping produced an archive containing a
 * single real CSV — and on the Android tablet, which is the device this button
 * exists for, a zip cannot be opened in Sheets at all without a separate unzip
 * app. The button said CSV and delivered something that was not one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiaryEvent } from '../src/lib/farmDiary';

const diary: DiaryEvent[] = [
  { id: 'd1', date: '2026-08-02', type: 'work', title: 'Fix drip', notes: '35°C in the shed' },
  { id: 'd2', date: '2026-08-01', type: 'spray', agentName: 'Kocide' },
];

vi.mock('../src/lib/farmGeometryIdb', () => ({
  getFarmGeometry: async () => ({ blocks: [], viewport: null }),
}));

vi.mock('../src/lib/localFarmRepo', () => ({
  listLocalEntities: async (_farmId: string, kind: string) => (kind === 'diary' ? diary : []),
}));

vi.mock('../src/lib/photoOutbox', () => ({ listPhotoOutbox: async () => [] }));

const { downloadFarmExportDiaryCsv } = await import('../src/lib/farmExportSheets.ts');

/** The single object URL the download path creates, with its blob. */
let created: { blob: Blob; filename: string } | null = null;

beforeEach(() => {
  created = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
    created = { blob, filename: '' };
    return 'blob:stub';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (created) created.filename = this.download;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the diary CSV download', () => {
  it('is a single .csv, not a zip', async () => {
    const result = await downloadFarmExportDiaryCsv('farm-1', { farmName: 'Clare Downs' });

    expect(result.filename).toMatch(/\.csv$/);
    expect(result.filename).not.toMatch(/\.zip$/);
    expect(created?.filename).toBe(result.filename);
    expect(created?.blob.type).toBe('text/csv;charset=utf-8');
  });

  it('carries the diary rows, with the BOM Excel needs', async () => {
    const { csv } = await downloadFarmExportDiaryCsv('farm-1', { farmName: 'Clare Downs' });

    // Read as bytes, not `.text()` — that decodes UTF-8 *with BOM removal* per
    // spec, so it would report a pass whether or not the BOM was written.
    const bytes = new Uint8Array(await created!.blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(csv);

    expect(csv.split('\r\n')[0]).toContain('date');
    expect(csv).toContain('Fix drip');
    expect(csv).toContain('Kocide');
    expect(csv).toContain('35°C in the shed');
  });

  it('leaves issues out — this button is the diary', async () => {
    const { bundle } = await downloadFarmExportDiaryCsv('farm-1');
    expect(bundle.exportScope.issues).toBe(false);
    expect(bundle.exportScope.issuesArchive).toBe(false);
    expect(bundle.issues).toEqual([]);
  });
});
