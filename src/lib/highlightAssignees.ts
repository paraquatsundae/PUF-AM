/**
 * Who a “check this” highlight can be directed at.
 *
 * Cloud farms have Firestore members; Freenet People is the hub join-ticket
 * ledger (often empty on a tablet). Always allow a typed name, plus anyone
 * already visible on this device (session, presence, ticket labels).
 */
import { getLastDisplayName } from './deviceSession';

export type HighlightAssigneeOption = {
  id: string;
  name: string;
};

function pushUnique(
  out: HighlightAssigneeOption[],
  seen: Set<string>,
  id: string,
  name: string
): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ id: id.trim() || `name:${key}`, name: trimmed });
}

export function collectHighlightAssignees(input: {
  sessionName?: string | null;
  sessionId?: string | null;
  lastDisplayName?: string | null;
  presence?: Array<{ uid?: string; displayName?: string | null }>;
  ledger?: Array<{ id?: string; label?: string | null }>;
}): HighlightAssigneeOption[] {
  const seen = new Set<string>();
  const out: HighlightAssigneeOption[] = [];

  pushUnique(out, seen, input.sessionId || 'session', input.sessionName || '');
  pushUnique(out, seen, 'last-session', input.lastDisplayName || '');

  for (const row of input.presence || []) {
    pushUnique(out, seen, row.uid || '', row.displayName || '');
  }
  for (const row of input.ledger || []) {
    pushUnique(out, seen, row.id || '', row.label || '');
  }

  return out;
}

export function assigneesFromDevice(input: {
  sessionName?: string | null;
  sessionId?: string | null;
  presence?: Array<{ uid?: string; displayName?: string | null }>;
  ledger?: Array<{ id?: string; label?: string | null }>;
}): HighlightAssigneeOption[] {
  return collectHighlightAssignees({
    ...input,
    lastDisplayName: getLastDisplayName(),
  });
}
