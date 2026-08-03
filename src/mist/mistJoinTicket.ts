/**
 * Join ticket — URI handoff for two-laptop Freenet workshop (Hot + bones).
 *
 * Format v1 JSON:
 * `{ "v": 1, "hotUri": "FN02@…", "bonesUri": "FN02@…", "hotContentHash?": "…", "bonesContentHash?": "…" }`
 *
 * Paste also accepts two lines (hot URI, then bones URI).
 */

export type MistJoinTicketV1 = {
  v: 1;
  hotUri: string;
  bonesUri: string;
  hotContentHash?: string;
  bonesContentHash?: string;
};

export type ParsedJoinTicket = {
  hotUri: string;
  bonesUri: string;
  hotContentHash?: string;
  bonesContentHash?: string;
};

export function formatJoinTicket(ticket: MistJoinTicketV1): string {
  return JSON.stringify(ticket, null, 2);
}

function isJoinTicketV1(value: unknown): value is MistJoinTicketV1 {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return o.v === 1 && typeof o.hotUri === 'string' && typeof o.bonesUri === 'string';
}

/** Parse JSON join ticket or two-line URI paste. */
export function parseJoinTicketInput(raw: string): ParsedJoinTicket | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isJoinTicketV1(parsed)) {
        return {
          hotUri: parsed.hotUri.trim(),
          bonesUri: parsed.bonesUri.trim(),
          hotContentHash: parsed.hotContentHash?.trim() || undefined,
          bonesContentHash: parsed.bonesContentHash?.trim() || undefined,
        };
      }
    } catch {
      return null;
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      hotUri: lines[0]!,
      bonesUri: lines[1]!,
      hotContentHash: lines[2]?.startsWith('sha256:') ? lines[2].slice(7) : undefined,
      bonesContentHash: lines[3]?.startsWith('sha256:') ? lines[3].slice(7) : undefined,
    };
  }

  return null;
}

export function buildJoinTicketV1(input: {
  hotUri: string;
  bonesUri: string;
  hotContentHash?: string;
  bonesContentHash?: string;
}): MistJoinTicketV1 {
  return {
    v: 1,
    hotUri: input.hotUri,
    bonesUri: input.bonesUri,
    hotContentHash: input.hotContentHash,
    bonesContentHash: input.bonesContentHash,
  };
}
