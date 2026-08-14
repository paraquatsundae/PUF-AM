import { describe, expect, it } from 'vitest';

import {
  BYO_FIREBASE_GUIDE_URL,
  BYO_FIREBASE_RISKS_URL,
  FIREBASE_AVOID_BILLS_URL,
  FIREBASE_WEB_SETUP_URL,
} from '../src/lib/byoDocs';

describe('BYO doc URLs', () => {
  it('keeps the long copy on pufworks.farm, not in the app origin', () => {
    expect(BYO_FIREBASE_GUIDE_URL).toBe('https://pufworks.farm/pufam/your-firebase/');
    expect(BYO_FIREBASE_RISKS_URL).toContain('#risks');
    expect(FIREBASE_WEB_SETUP_URL).toMatch(/^https:\/\/firebase\.google\.com\//);
    expect(FIREBASE_AVOID_BILLS_URL).toMatch(/avoid-surprise-bills/);
  });
});
