import { describe, expect, it } from 'vitest';
import { kFromInoculumLevel } from '../shared/weather/jiBlightModel';

describe('Blight orchard inoculum (BE-02)', () => {
  it('maps H/M/L to Ji k the production panel displays', () => {
    expect(kFromInoculumLevel('low')).toBe(0.5);
    expect(kFromInoculumLevel('medium')).toBe(1.0);
    expect(kFromInoculumLevel('high')).toBe(2.0);
  });
});
