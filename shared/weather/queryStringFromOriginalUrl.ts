/**
 * Raw query string from the incoming URL, including repeated keys.
 *
 * Express `req.query` collapses duplicates (`?limit=100&limit=100` → one
 * `limit`). DPIRD hourly requests send `limit` twice; rebuilding from
 * `req.query` drops the repeat. Shared by Cloud Run and BYO weather.
 */
export function queryStringFromOriginalUrl(originalUrl: string): string {
  const idx = originalUrl.indexOf('?');
  return idx === -1 ? '' : originalUrl.slice(idx + 1);
}
