/** DPIRD station codes are short alphanumeric (e.g. MA002). */
const STATION_CODE = /^[A-Za-z0-9]{2,16}$/;

export function sanitizeStationCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim();
  if (!STATION_CODE.test(code)) return null;
  return code.toUpperCase();
}
