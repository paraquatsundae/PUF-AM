/**
 * Directed at / assignee match — one mention system.
 * Empty uid+name = Everyone (not For you). Name match is fail-soft (Freenet hole 3).
 * Plans/FARM_MESSAGING.md
 */

export function directedAtIsEmpty(
  uid?: string | null,
  name?: string | null
): boolean {
  return !(uid || '').trim() && !(name || '').trim();
}

export function isDirectedAtYou(input: {
  directedAtUid?: string | null;
  directedAtName?: string | null;
  personUid?: string | null;
  personNames?: readonly (string | null | undefined)[];
}): boolean {
  if (directedAtIsEmpty(input.directedAtUid, input.directedAtName)) return false;
  const uid = (input.directedAtUid || '').trim();
  const personUid = (input.personUid || '').trim();
  if (uid && personUid && uid === personUid) return true;
  const target = (input.directedAtName || '').trim().toLowerCase();
  if (!target) return false;
  return (input.personNames || []).some((n) => (n || '').trim().toLowerCase() === target);
}
