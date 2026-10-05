import { describe, expect, it } from 'vitest';
import {
  nextRecordedScenarioName,
  nextScenarioId,
  spraysForSandboxScenario,
} from './useBlightSandbox';

const recorded = {
  '2026-09-01': { type: 'chem' as const, method: 'ground' as const },
  '2026-09-12': { type: 'both' as const, method: 'helicopter' as const },
};

describe('sandbox recorded sprays', () => {
  it('keeps diary sprays under a what-if scenario and lets extras win the same day', () => {
    const sprays = spraysForSandboxScenario(
      {
        sprays: { '2026-09-20': { type: 'bio', method: 'drone' } },
      },
      recorded
    );
    expect(sprays['2026-09-01']).toEqual(recorded['2026-09-01']);
    expect(sprays['2026-09-20']).toEqual({ type: 'bio', method: 'drone' });
  });

  it('uses only the copied program once a scenario owns its sprays', () => {
    const sprays = spraysForSandboxScenario(
      {
        ownsSprayProgram: true,
        sprays: { '2026-09-01': { type: 'bio', method: 'ground' } },
      },
      recorded
    );
    expect(sprays).toEqual({ '2026-09-01': { type: 'bio', method: 'ground' } });
    expect(sprays['2026-09-12']).toBeUndefined();
  });

  it('names a second recorded snapshot without reusing an id', () => {
    const existing = [
      { id: '1', name: 'Scenario 1' },
      { id: '2', name: 'Recorded sprays' },
    ];
    expect(nextRecordedScenarioName(existing)).toBe('Recorded sprays 2');
    expect(nextScenarioId(existing)).toBe('3');
  });
});
