// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiaryComposer } from '../src/components/diary/DiaryComposer';
import { useFarmDiaryComposer } from '../src/hooks/useFarmDiaryComposer';
import type { OrchardBlock } from '../src/lib/mapStore';

const { mapLoads } = vi.hoisted(() => ({ mapLoads: vi.fn() }));

vi.mock('../src/components/map/DiaryPaddockMiniMap', () => ({
  DiaryPaddockMiniMap: () => {
    mapLoads();
    return <div data-testid="paddock-map" />;
  },
}));

const blocks: OrchardBlock[] = [
  { id: '14', name: '14', cultivar: 'Howard', density: '', irrigation: '', areaHa: 2, geojson: null },
  { id: '3', name: '3', cultivar: 'Howard', density: '', irrigation: '', areaHa: 1, geojson: null },
  { id: '7', name: '7', cultivar: 'Howard', density: '', irrigation: '', areaHa: 1.5, geojson: null },
];

function Harness() {
  const composer = useFarmDiaryComposer({
    settings: { farmName: 'Farm', irrigationSystemType: 'micro' },
    addEvent: vi.fn(),
    updateSettings: vi.fn(),
    focusBlockId: null,
    markIssueInProgress: vi.fn(),
    onSwitchToTimeline: vi.fn(),
  });
  return <DiaryComposer canEdit blocks={blocks} composer={composer} farmId="farm_workshop" />;
}

afterEach(() => {
  cleanup();
  mapLoads.mockClear();
});

describe('diary composer paddocks', () => {
  it('colours plan, spray, and water, and selects several paddocks', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Add to diary/ }));

    const className = (name: string) => screen.getByRole('button', { name }).className;
    expect(className('Plan')).toContain('bg-amber-500');
    expect(className('Spray')).toContain('bg-orange-50');
    expect(className('Water')).toContain('bg-sky-50');
    expect(className('Save plan')).toContain('bg-amber-600');

    fireEvent.click(screen.getByRole('button', { name: 'Spray' }));
    expect(className('Spray')).toContain('bg-orange-500');
    expect(className('Plan')).toContain('bg-amber-50');
    expect(className('Save log')).toContain('bg-orange-600');

    fireEvent.click(screen.getByRole('button', { name: 'Water' }));
    expect(className('Water')).toContain('bg-sky-500');
    expect(className('Save log')).toContain('bg-sky-600');

    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed('Farm-wide')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '14' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    expect(screen.getByText('3 paddocks')).toBeTruthy();
    expect(pressed('14')).toBe('true');
    expect(pressed('Farm-wide')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Farm-wide' }));
    expect(screen.queryByText('3 paddocks')).toBeNull();
    expect(pressed('14')).toBe('false');
  });

  it('does not mount the paddock map until the toggle is opened', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Add to diary/ }));
    expect(mapLoads).not.toHaveBeenCalled();
    expect(screen.queryByTestId('paddock-map')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show paddock map' }));
    expect(await screen.findByTestId('paddock-map')).toBeTruthy();
    expect(mapLoads).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Hide paddock map' }));
    expect(screen.queryByTestId('paddock-map')).toBeNull();
  });
});
