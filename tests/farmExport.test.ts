import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import type { DiaryEvent } from '../src/lib/farmDiary';
import type { FieldIssue } from '../src/lib/fieldStore';
import {
  FARM_EXPORT_FORMAT,
  FARM_EXPORT_VERSION,
  assembleFarmExportEnvelope,
  buildBlockNameMap,
  enrichDiaryForExport,
  isFarmExportV1,
  sanitizeIssueForExport,
  sortDiaryForExport,
} from '../src/lib/farmExport';
import {
  DIARY_SHEET_COLUMNS,
  farmExportSheetNames,
  farmExportToCsvSheets,
  farmExportToSheetsZip,
  ISSUES_ARCHIVE_SHEET_COLUMNS,
  ISSUES_SHEET_COLUMNS,
} from '../src/lib/farmExportSheets';

const sampleDiary: DiaryEvent[] = [
  {
    id: 'd2',
    date: '2026-08-01',
    type: 'spray',
    blockId: 'block-a',
    agentName: 'Roundup',
    updatedAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 'd1',
    date: '2026-08-02',
    type: 'work',
    status: 'planned',
    title: 'Fix drip',
    updatedAt: '2026-08-02T10:00:00.000Z',
  },
];

const sampleIssue: FieldIssue = {
  id: 'issue-1',
  lat: -31.9,
  lng: 116.5,
  category: 'pest',
  priority: 'high',
  status: 'open',
  reportedBy: 'uid1',
  reportedAt: '2026-08-01T08:00:00.000Z',
  photoData: 'data:image/jpeg;base64,/9j/4AAQ',
  note: 'Chewed leaves',
};

const sampleArchived: FieldIssue = {
  ...sampleIssue,
  id: 'issue-arch',
  status: 'archived',
  archivedAt: '2026-08-03T08:00:00.000Z',
  archivedBy: 'uid2',
};

describe('farmExport envelope', () => {
  it('builds v1 shape with blockName resolution', () => {
    const blockNames = buildBlockNameMap([
      { id: 'block-a', name: 'North Paddock' },
    ]);
    const envelope = assembleFarmExportEnvelope({
      farmId: 'farm-1',
      farmName: 'Clare Downs',
      diary: sampleDiary,
      issues: [sampleIssue],
      issuesArchive: [sampleArchived],
      blockNames,
      exportedAt: '2026-08-03T00:00:00.000Z',
    });

    expect(isFarmExportV1(envelope)).toBe(true);
    expect(envelope.format).toBe(FARM_EXPORT_FORMAT);
    expect(envelope.v).toBe(FARM_EXPORT_VERSION);
    expect(envelope.source).toBe('local');
    expect(envelope.exportScope.diary).toBe('all');
    expect(envelope.diary).toHaveLength(2);
    expect(envelope.diary[0]?.id).toBe('d1');
    expect(envelope.diary[1]?.blockName).toBe('North Paddock');
    expect(envelope.issues[0]?.hasPhoto).toBe(true);
    expect(envelope.issues[0]).not.toHaveProperty('photoData');
    expect(envelope.issuesArchive[0]?.archivedAt).toBe('2026-08-03T08:00:00.000Z');
  });

  it('resolves block names from geometry map', () => {
    const blockNames = buildBlockNameMap([{ id: 'b1', name: 'Block One' }]);
    const row = enrichDiaryForExport(
      { id: 'x', date: '2026-01-01', type: 'irrigation', blockId: 'b1' },
      blockNames
    );
    expect(row.blockName).toBe('Block One');
    expect(
      enrichDiaryForExport({ id: 'y', date: '2026-01-01', type: 'work' }, blockNames).blockName
    ).toBeUndefined();
  });

  it('sorts diary date desc then type then id', () => {
    const sorted = sortDiaryForExport([
      { id: 'c', date: '2026-08-01', type: 'nutrition' },
      { id: 'a', date: '2026-08-02', type: 'spray' },
      { id: 'b', date: '2026-08-02', type: 'irrigation' },
    ] as DiaryEvent[]);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('derives hasPhoto without embedding photoData', () => {
    const out = sanitizeIssueForExport(sampleIssue);
    expect(out.hasPhoto).toBe(true);
    expect(out.note).toBe('Chewed leaves');
    expect('photoData' in out).toBe(false);
  });
});

/** Split one CSV record, honouring RFC 4180 quoting. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

const headerOf = (csv: string) => parseCsvRow(csv.split('\r\n')[0] || '');

describe('farmExport sheets', () => {
  const envelope = assembleFarmExportEnvelope({
    farmId: 'farm-1',
    diary: sampleDiary,
    issues: [sampleIssue],
    issuesArchive: [sampleArchived],
    blockNames: buildBlockNameMap([{ id: 'block-a', name: 'North Paddock' }]),
  });

  it('includes expected sheet names and columns', () => {
    expect(farmExportSheetNames(envelope)).toEqual([
      'Diary',
      'Issues',
      'IssuesArchive',
      '_Meta',
    ]);

    const sheets = farmExportToCsvSheets(envelope);
    expect(Object.keys(sheets)).toEqual(['Diary', 'Issues', 'IssuesArchive', '_Meta']);

    expect(headerOf(sheets.Diary)).toEqual(expect.arrayContaining([...DIARY_SHEET_COLUMNS]));
    expect(sheets.Diary.split('\r\n').filter(Boolean).length).toBeGreaterThan(1);

    expect(headerOf(sheets.Issues)).toEqual(expect.arrayContaining([...ISSUES_SHEET_COLUMNS]));
    expect(headerOf(sheets.IssuesArchive)).toEqual(
      expect.arrayContaining([...ISSUES_ARCHIVE_SHEET_COLUMNS])
    );
  });

  it('zips one CSV per sheet', () => {
    const files = unzipSync(farmExportToSheetsZip(envelope));
    expect(Object.keys(files).sort()).toEqual([
      'diary.csv',
      'issues-archive.csv',
      'issues.csv',
      'meta.csv',
    ]);
  });

  it('escapes quotes and delimiters rather than truncating the cell', () => {
    const awkward = assembleFarmExportEnvelope({
      farmId: 'farm-1',
      diary: [
        {
          id: 'd-awkward',
          date: '2026-08-01',
          type: 'work',
          // Every character that needs quoting, in one note.
          notes: 'He said "spray it", then left\nnew line',
          updatedAt: '2026-08-01T10:00:00.000Z',
        },
      ],
      issues: [],
      issuesArchive: [],
      blockNames: buildBlockNameMap([]),
    });

    const csv = farmExportToCsvSheets(awkward).Diary;
    const header = headerOf(csv);
    const notesIndex = header.indexOf('notes');
    expect(notesIndex).toBeGreaterThanOrEqual(0);

    // The record spans a newline inside a quoted field, so it is not line 2 alone.
    const body = csv.slice(csv.indexOf('\r\n') + 2);
    expect(body).toContain('""spray it""');
    expect(parseCsvRow(body.replace(/\r\n$/, ''))[notesIndex]).toBe(
      'He said "spray it", then left\nnew line'
    );
  });

  it('defuses a note that Excel would otherwise run as a formula', () => {
    // A spray diary is the file that gets emailed to an agronomist and opened
    // without a thought. The xlsx workbook this replaced wrote string cells as
    // strings, so this is a property being kept, not a new one.
    const injected = assembleFarmExportEnvelope({
      farmId: 'farm-1',
      diary: [
        {
          id: 'd-injected',
          date: '2026-08-01',
          type: 'work',
          title: '=cmd|\' /C calc\'!A0',
          notes: '@SUM(1+1)',
        },
      ],
      issues: [],
      issuesArchive: [],
      blockNames: buildBlockNameMap([]),
    });

    const csv = farmExportToCsvSheets(injected).Diary;
    const header = headerOf(csv);
    const row = parseCsvRow(csv.split('\r\n')[1] as string);

    expect(row[header.indexOf('title')]).toBe("'=cmd|' /C calc'!A0");
    expect(row[header.indexOf('notes')]).toBe("'@SUM(1+1)");
  });

  it('leaves a negative number alone rather than making it text', () => {
    // The guard is for strings only: a southern-hemisphere latitude starts with
    // a minus sign, and quoting it would break every spreadsheet that maps it.
    const bundle = assembleFarmExportEnvelope({
      farmId: 'farm-1',
      diary: [],
      issues: [{ ...sampleIssue, id: 'i-neg', lat: -33.9, lng: 121.9 }],
      issuesArchive: [],
      blockNames: buildBlockNameMap([]),
    });

    const csv = farmExportToCsvSheets(bundle).Issues;
    const header = headerOf(csv);
    expect(parseCsvRow(csv.split('\r\n')[1] as string)[header.indexOf('lat')]).toBe('-33.9');
  });

  it('gives an empty diary its header rather than a zero-byte file', () => {
    // A brand-new farm's first export. A 0-byte csv is indistinguishable from a
    // broken one, and "no rows" is exactly what the reader needs to be able to
    // tell.
    const empty = assembleFarmExportEnvelope({
      farmId: 'farm-1',
      diary: [],
      issues: [],
      issuesArchive: [],
      blockNames: buildBlockNameMap([]),
    });

    expect(headerOf(farmExportToCsvSheets(empty).Diary)).toEqual([...DIARY_SHEET_COLUMNS]);
  });

  it('writes each sheet with a BOM so Excel on Windows reads it as UTF-8', () => {
    const bundle = assembleFarmExportEnvelope({
      farmId: 'farm-1',
      diary: [{ id: 'd-deg', date: '2026-08-01', type: 'work', notes: '35°C, 4 µg/L' }],
      issues: [],
      issuesArchive: [],
      blockNames: buildBlockNameMap([]),
    });

    const files = unzipSync(farmExportToSheetsZip(bundle));
    const diary = files['diary.csv'] as Uint8Array;
    expect([diary[0], diary[1], diary[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(diary)).toContain('35°C, 4 µg/L');
  });
});
