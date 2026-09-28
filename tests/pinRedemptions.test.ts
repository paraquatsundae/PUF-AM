import { describe, expect, it } from 'vitest';
import { summarizePinUses, type PinRedemption } from '../server/accessPinCrypto';

const row = (patch: Partial<PinRedemption>): PinRedemption => ({
  at: '2026-09-28T00:00:00.000Z',
  uid: 'ap_alex',
  displayName: 'Alex',
  ip: '203.0.113.7',
  userAgent: 'Phone',
  ...patch,
});

describe('summarizePinUses', () => {
  it('says when nothing has been logged', () => {
    expect(summarizePinUses([])).toBe('No device log yet');
  });

  it('treats a repeated sign-in from one browser as one device', () => {
    expect(summarizePinUses([row({}), row({ at: '2026-09-28T01:00:00.000Z' })])).toBe(
      'Same account, one device'
    );
  });

  it('treats the same account on a second IP or browser as another device', () => {
    expect(
      summarizePinUses([row({}), row({ ip: '198.51.100.4', userAgent: 'Laptop' })])
    ).toBe('Same account on 2 devices');
  });

  it('flags a second name as a different person', () => {
    expect(
      summarizePinUses([row({}), row({ uid: 'ap_sam', displayName: 'Sam' })])
    ).toBe('2 different accounts — this code was used by more than one person');
  });
});
