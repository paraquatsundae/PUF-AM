import { describe, expect, it } from 'vitest';
import { PUFOM_MDNS_TXT, PUFOM_MDNS_TYPE } from '../shared/sync/mdnsConstants';

describe('mdnsConstants', () => {
  it('uses a stable Bonjour service type', () => {
    expect(PUFOM_MDNS_TYPE).toBe('pufom-sync');
    expect(PUFOM_MDNS_TXT.path).toBe('/api/sync/lan');
    expect(PUFOM_MDNS_TXT.ver).toBe('1');
  });
});
