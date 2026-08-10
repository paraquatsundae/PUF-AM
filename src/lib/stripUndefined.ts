/**
 * Firestore rejects `undefined` anywhere in a document — one optional field
 * left unset (a diary entry with no notes) wedged the whole outbox in a retry
 * loop, failing the same `setDoc` every few seconds forever. Dropping those
 * keys writes what the entry actually has; `null` is kept, because null is a
 * value Firestore accepts and an author may have meant.
 *
 * Payloads here are plain JSON (`DiaryEvent`, `FieldIssue` — ISO-string dates,
 * no class instances), so a generic object walk is safe.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      out[key] = stripUndefinedDeep(entry);
    }
    return out as T;
  }
  return value;
}
