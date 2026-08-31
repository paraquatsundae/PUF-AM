/**
 * Which `X-Forwarded-For` entries were written by a proxy we run.
 *
 * `clientIp` needs to skip those to find the caller, and counting hops cannot
 * do it here: `am.pufworks.farm` reaches Cloud Run through Firebase Hosting
 * (two hops) while the `run.app` origin stays open and reachable (one hop).
 * Firebase Hosting requires that — it proxies over the public internet and
 * cannot use restricted ingress — so both shapes arrive at the same process and
 * any fixed count is wrong for one of them. Recognising the proxy by address
 * instead handles both at once.
 *
 * Failure is safe by construction. An unrecognised edge is treated as the
 * caller, which puts everyone behind that edge in one rate-limit bucket —
 * coarse, but never forgeable. A caller cannot spoof their way past this
 * either: the entry Cloud Run appends is the address it actually accepted the
 * connection from, and anything the caller wrote sits to the left of it.
 */

/**
 * Fastly's published ranges, which is what Firebase Hosting is built on —
 * `https://api.fastly.com/public-ip-list`, fetched 2026-08-30.
 *
 * Treat this as a starting point rather than gospel: Hosting also fronts on
 * Google-owned addresses (`199.36.158.100`), so the origin-facing hop may not
 * be in this list. `GET /api/admin/client-ip` on the deployed service reports
 * the chain as it actually arrives; add anything missing via
 * `TRUSTED_PROXY_CIDRS` rather than waiting on a code change.
 */
const FASTLY_RANGES = [
  '23.235.32.0/20',
  '43.249.72.0/22',
  '103.244.50.0/24',
  '103.245.222.0/23',
  '103.245.224.0/24',
  '104.156.80.0/20',
  '140.248.64.0/18',
  '140.248.128.0/17',
  '146.75.0.0/17',
  '151.101.0.0/16',
  '157.52.64.0/18',
  '167.82.0.0/17',
  '167.82.128.0/20',
  '167.82.160.0/20',
  '167.82.224.0/20',
  '172.111.64.0/18',
  '185.31.16.0/22',
  '199.27.72.0/21',
  '199.232.0.0/16',
  '2a04:4e40::/32',
  '2a04:4e42::/32',
];

type ParsedAddress = { value: bigint; bits: 32 | 128 };
type Range = { base: bigint; bits: 32 | 128; prefix: number };

function parseIpv4(ip: string): bigint | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIpv6(ip: string): bigint | null {
  // A zone index (`fe80::1%eth0`) is scope, not address.
  const bare = ip.split('%')[0] ?? '';
  const halves = bare.split('::');
  if (halves.length > 2) return null;

  const expand = (part: string): string[] => (part ? part.split(':') : []);
  const head = expand(halves[0] ?? '');
  const tail = halves.length === 2 ? expand(halves[1] ?? '') : [];

  // A trailing IPv4 literal (`::ffff:1.2.3.4`) occupies the last two groups.
  const last = tail.length ? tail[tail.length - 1] : head[head.length - 1];
  if (last && last.includes('.')) {
    const v4 = parseIpv4(last);
    if (v4 === null) return null;
    const groups = [
      ((v4 >> 16n) & 0xffffn).toString(16),
      (v4 & 0xffffn).toString(16),
    ];
    if (tail.length) tail.splice(-1, 1, ...groups);
    else head.splice(-1, 1, ...groups);
  }

  const missing = 8 - (head.length + tail.length);
  if (halves.length === 2 ? missing < 0 : missing !== 0) return null;
  const groups = [...head, ...(halves.length === 2 ? Array(missing).fill('0') : []), ...tail];
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function parseAddress(ip: string): ParsedAddress | null {
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const value = parseIpv6(trimmed);
    return value === null ? null : { value, bits: 128 };
  }
  const value = parseIpv4(trimmed);
  return value === null ? null : { value, bits: 32 };
}

function parseRange(cidr: string): Range | null {
  const [ip, prefixPart] = cidr.trim().split('/');
  const address = parseAddress(ip ?? '');
  if (!address) return null;
  // A bare address is a host route, which is a legitimate thing to list. A
  // prefix that is *present but not plain digits* is a typo, and must be
  // rejected rather than coerced: `Number('')` from a trailing slash is 0, and
  // a /0 here would trust the entire internet as a proxy and collapse every
  // rate-limit bucket onto one key.
  if (prefixPart !== undefined && !/^\d{1,3}$/.test(prefixPart)) return null;
  const prefix = prefixPart === undefined ? address.bits : Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > address.bits) return null;
  return { base: address.value, bits: address.bits, prefix };
}

function contains(range: Range, address: ParsedAddress): boolean {
  if (range.bits !== address.bits) return false;
  const shift = BigInt(range.bits - range.prefix);
  return range.base >> shift === address.value >> shift;
}

let cached: { key: string; ranges: Range[] } | null = null;

/**
 * `TRUSTED_PROXY_CIDRS` is additive and comma-separated, so a Hosting edge that
 * turns out not to be in Fastly's list is a config change on a running service
 * rather than a redeploy. Setting it to `none` drops the built-ins entirely.
 */
function trustedRanges(): Range[] {
  const configured = process.env.TRUSTED_PROXY_CIDRS?.trim() || '';
  if (cached?.key === configured) return cached.ranges;

  const extra = configured
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const disableBuiltins = extra.some((entry) => entry.toLowerCase() === 'none');
  const wanted = [
    ...(disableBuiltins ? [] : FASTLY_RANGES),
    ...extra.filter((entry) => entry.toLowerCase() !== 'none'),
  ];

  const ranges: Range[] = [];
  for (const cidr of wanted) {
    const parsed = parseRange(cidr);
    if (parsed) ranges.push(parsed);
    else console.warn(`[clientIp] Ignoring unparseable trusted proxy CIDR: ${cidr}`);
  }

  cached = { key: configured, ranges };
  return ranges;
}

export function isTrustedProxyAddress(ip: string): boolean {
  const address = parseAddress(ip);
  if (!address) return false;
  return trustedRanges().some((range) => contains(range, address));
}
