import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { DiaryEvent } from '../src/lib/farmDiary';
import type { FieldIssue } from '../src/lib/fieldStore';
import {
  FARM_EXPORT_FORMAT,
  FARM_EXPORT_VERSION,
  assembleFarmExportEnvelope,
  buildBlockNameMap,
  DIARY_XLSX_COLUMNS,
  enrichDiaryForExport,
  farmExportToXlsx,
  farmExportXlsxSheetNames,
  isFarmExportV1,
  ISSUES_ARCHIVE_XLSX_COLUMNS,
  ISSUES_XLSX_COLUMNS,
  sanitizeIssueForExport,
  sortDiaryForExport,
} from '../src/lib/farmExport';

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

describe('farmExport xlsx', () => {
  it('includes expected sheet names and diary columns', () => {
    const envelope = assembleFarmExportEnvelope({
      farmId: 'farm-1',
      diary: sampleDiary,
      issues: [sampleIssue],
      issuesArchive: [sampleArchived],
      blockNames: buildBlockNameMap([{ id: 'block-a', name: 'North Paddock' }]),
    });

    expect(farmExportXlsxSheetNames(envelope)).toEqual([
      'Diary',
      'Issues',
      'IssuesArchive',
      '_Meta',
    ]);

    const bytes = farmExportToXlsx(envelope);
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Diary', 'Issues', 'IssuesArchive', '_Meta']);

    const diarySheet = wb.Sheets.Diary;
    const diaryRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(diarySheet);
    expect(diaryRows.length).toBeGreaterThan(0);
    for (const col of DIARY_XLSX_COLUMNS) {
      expect(Object.keys(diaryRows[0] || {})).toContain(col);
    }

    const issuesRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Issues);
    for (const col of ISSUES_XLSX_COLUMNS) {
      expect(Object.keys(issuesRows[0] || {})).toContain(col);
    }

    const archiveRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets.IssuesArchive
    );
    for (const col of ISSUES_ARCHIVE_XLSX_COLUMNS) {
      expect(Object.keys(archiveRows[0] || {})).toContain(col);
    }
  });
});
