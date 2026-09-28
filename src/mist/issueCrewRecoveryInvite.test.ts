import { beforeEach, describe, expect, it, vi } from 'vitest';

const lastPublishedFreenetHandoff = vi.fn();
const resolveMistFarmSeed = vi.fn();
const issueCrewInvite = vi.fn();
const publishFarmToFreenet = vi.fn();

vi.mock('./mistHotPublishMeta.ts', () => ({
  lastPublishedFreenetHandoff: (...args: unknown[]) => lastPublishedFreenetHandoff(...args),
}));

vi.mock('./mistHotBridge.ts', () => ({
  resolveMistFarmSeed: (...args: unknown[]) => resolveMistFarmSeed(...args),
}));

vi.mock('./issueCrewInvite.ts', () => ({
  issueCrewInvite: (...args: unknown[]) => issueCrewInvite(...args),
}));

vi.mock('./mistFreenetClient.ts', () => ({
  publishFarmToFreenet: (...args: unknown[]) => publishFarmToFreenet(...args),
}));

vi.mock('./freenetPublishLock.ts', () => ({
  withFreenetFarmPublishLock: async <T>(run: () => Promise<T>) => run(),
}));

const { issueCrewRecoveryInvite } = await import('./issueCrewRecoveryInvite.ts');

describe('issueCrewRecoveryInvite', () => {
  beforeEach(() => {
    lastPublishedFreenetHandoff.mockReset();
    resolveMistFarmSeed.mockReset();
    issueCrewInvite.mockReset();
    publishFarmToFreenet.mockReset();
    issueCrewInvite.mockResolvedValue({ shortTicket: 'PUF-RECOVERY', shortTicketRole: 'farmer' });
    publishFarmToFreenet.mockResolvedValue({ shortTicket: 'PUF-SEND', shortTicketRole: 'farmer' });
    resolveMistFarmSeed.mockResolvedValue(new Uint8Array(32).fill(3));
  });

  it('refuses a blank label', async () => {
    await expect(issueCrewRecoveryInvite({ farmId: 'farm-1', label: '  ' })).rejects.toThrow(
      /Name who this recovery code is for/,
    );
  });

  it('remints against last published URIs without a second farm PUT', async () => {
    lastPublishedFreenetHandoff.mockReturnValue({
      hotUri: 'FN02@hot',
      bonesUri: 'FN02@bones',
      hotContentHash: 'h',
      bonesContentHash: 'b',
    });

    const result = await issueCrewRecoveryInvite({ farmId: 'farm-1', label: 'Dave' });
    expect(result.shortTicket).toBe('PUF-RECOVERY');
    expect(publishFarmToFreenet).not.toHaveBeenCalled();
    expect(issueCrewInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        farmId: 'farm-1',
        hotUri: 'FN02@hot',
        bonesUri: 'FN02@bones',
        label: 'Dave',
      }),
    );
  });

  it('falls back to Send when this device has no published URIs', async () => {
    lastPublishedFreenetHandoff.mockReturnValue(null);
    const result = await issueCrewRecoveryInvite({ farmId: 'farm-1', label: 'Sam' });
    expect(result.shortTicket).toBe('PUF-SEND');
    expect(publishFarmToFreenet).toHaveBeenCalledWith(
      'farm-1',
      expect.objectContaining({ label: 'Sam' }),
    );
    expect(issueCrewInvite).not.toHaveBeenCalled();
  });
});
