/**
 * Parse the literal farm allowlist from firestore.rules (FIREBASE_BILLING.md §5 item 2).
 *
 * The IDs live in the rules file on purpose — evaluating `farmId in [...]` costs no
 * document read. Deploy refuses an empty list so a half-finished edit cannot lock
 * every farm out.
 */
export function parseAllowedFarmIds(rulesSource) {
  const match = rulesSource.match(
    /function\s+allowedFarmIds\s*\(\s*\)\s*\{\s*return\s*\[([\s\S]*?)\]\s*;\s*\}/
  );
  if (!match) {
    throw new Error(
      'firestore.rules is missing allowedFarmIds() — restore the §5 item 2 allowlist helper.'
    );
  }
  // Drop // line comments so placeholder examples in comments are not treated as live ids.
  const body = match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  const ids = [];
  for (const m of body.matchAll(/'([^']+)'/g)) {
    ids.push(m[1]);
  }
  for (const m of body.matchAll(/"([^"]+)"/g)) {
    ids.push(m[1]);
  }
  return [...new Set(ids)];
}

export function assertAllowedFarmIdsReady(rulesSource, { allowEmpty = false } = {}) {
  const ids = parseAllowedFarmIds(rulesSource);
  if (!allowEmpty && ids.length === 0) {
    throw new Error(
      [
        'firestore.rules allowedFarmIds() is empty.',
        'Add each of George\'s farmIds (from the Firebase console or create-farm response),',
        'then re-run deploy. An empty list would deny every client farm read/write.',
        'Workshop override: PUF_ALLOW_EMPTY_FARM_ALLOWLIST=1',
      ].join(' ')
    );
  }
  return ids;
}
