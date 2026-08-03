import { describe, expect, it } from 'vitest';
import { buildJoinTicketV1, formatJoinTicket, parseJoinTicketInput } from './mistJoinTicket';

describe('mistJoinTicket', () => {
  const hotUri = 'FN02@abc123hot';
  const bonesUri = 'FN02@def456bones';

  it('formats and parses JSON join ticket', () => {
    const ticket = buildJoinTicketV1({
      hotUri,
      bonesUri,
      hotContentHash: 'aa'.repeat(32),
      bonesContentHash: 'bb'.repeat(32),
    });
    const text = formatJoinTicket(ticket);
    const parsed = parseJoinTicketInput(text);
    expect(parsed?.hotUri).toBe(hotUri);
    expect(parsed?.bonesUri).toBe(bonesUri);
    expect(parsed?.hotContentHash).toBe('aa'.repeat(32));
  });

  it('parses two-line URI paste', () => {
    const parsed = parseJoinTicketInput(`${hotUri}\n${bonesUri}`);
    expect(parsed?.hotUri).toBe(hotUri);
    expect(parsed?.bonesUri).toBe(bonesUri);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseJoinTicketInput('')).toBeNull();
    expect(parseJoinTicketInput('only-one-uri')).toBeNull();
  });
});
