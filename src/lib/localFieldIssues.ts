import type { FieldIssue } from './fieldStore';

const key = (farmId: string) => `sentinut_field_issues_${farmId}`;
const archiveKey = (farmId: string) => `sentinut_field_issues_archive_${farmId}`;

function read(farmId: string, which: 'open' | 'archive'): FieldIssue[] {
  try {
    const raw = localStorage.getItem(which === 'open' ? key(farmId) : archiveKey(farmId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(farmId: string, which: 'open' | 'archive', issues: FieldIssue[]) {
  localStorage.setItem(which === 'open' ? key(farmId) : archiveKey(farmId), JSON.stringify(issues));
}

export const localFieldIssues = {
  getOpen(farmId: string): FieldIssue[] {
    return read(farmId, 'open');
  },
  getArchived(farmId: string): FieldIssue[] {
    return read(farmId, 'archive');
  },
  saveOpen(farmId: string, issues: FieldIssue[]) {
    write(farmId, 'open', issues);
  },
  saveArchived(farmId: string, issues: FieldIssue[]) {
    write(farmId, 'archive', issues);
  },
  upsertOpen(farmId: string, issue: FieldIssue) {
    const list = read(farmId, 'open');
    const idx = list.findIndex((i) => i.id === issue.id);
    if (idx >= 0) list[idx] = issue;
    else list.push(issue);
    write(farmId, 'open', list);
    return list;
  },
  updateOpen(farmId: string, id: string, updates: Partial<FieldIssue> & Record<string, unknown>) {
    const list = read(farmId, 'open').map((i) => {
      if (i.id !== id) return i;
      const merged: FieldIssue = { ...i, ...updates };
      for (const key of Object.keys(updates)) {
        if (updates[key] === undefined || updates[key] === null) {
          delete (merged as unknown as Record<string, unknown>)[key];
        }
      }
      return merged;
    });
    write(farmId, 'open', list);
    return list;
  },
  archive(farmId: string, id: string, archivedBy: string) {
    const open = read(farmId, 'open');
    const issue = open.find((i) => i.id === id);
    if (!issue) return { open, archived: read(farmId, 'archive') };
    const nextOpen = open.filter((i) => i.id !== id);
    const archived: FieldIssue = {
      ...issue,
      status: 'archived',
      archivedAt: new Date().toISOString(),
      archivedBy,
    };
    const nextArchived = [...read(farmId, 'archive').filter((i) => i.id !== id), archived];
    write(farmId, 'open', nextOpen);
    write(farmId, 'archive', nextArchived);
    return { open: nextOpen, archived: nextArchived };
  },
  delete(farmId: string, id: string) {
    const open = read(farmId, 'open').filter((i) => i.id !== id);
    const archived = read(farmId, 'archive').filter((i) => i.id !== id);
    write(farmId, 'open', open);
    write(farmId, 'archive', archived);
    return { open, archived };
  },
};
