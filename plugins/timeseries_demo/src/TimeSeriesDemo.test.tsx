// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NormalizedDendrometerReading } from './dendrometerSeries';

const auth = vi.hoisted(() => ({ active: true }));
vi.mock('../../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ farmCropPacks: auth.active ? {
    timeseries_demo: { status: 'active', installedAt: '2026-09-16' },
  } : {} }),
}));
// Keep this integration test about selected data and layout, not SVG measurements.
vi.mock('./DendrometerChart', () => ({
  DendrometerChart: ({ title, data, normalized }: {
    title: string; data: NormalizedDendrometerReading[]; normalized?: boolean;
  }) => (
    <section data-chart={normalized ? 'normalized' : 'raw'}>
      <h2>{title}</h2>
      <output data-testid={normalized ? 'normalized-data' : 'raw-data'}>{JSON.stringify(data)}</output>
    </section>
  ),
}));
import { TimeSeriesDemo } from './TimeSeriesDemo';
import { validDate } from './useTimeRange';

const key = 'pufam.timeseries_demo.range';
function show(path = '/timeseries-demo') {
  return render(<MemoryRouter initialEntries={[path]}><TimeSeriesDemo /></MemoryRouter>);
}
function data(normalized = false): NormalizedDendrometerReading[] {
  return JSON.parse(screen.getByTestId(normalized ? 'normalized-data' : 'raw-data').textContent!);
}
beforeEach(() => { localStorage.clear(); auth.active = true; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('dendrometer demo dashboard', () => {
  it('shows two years by default with the normalized chart below the raw chart', () => {
    const { container } = show();
    expect(data()).toHaveLength(730);
    expect([...container.querySelectorAll('[data-chart]')].map(node => node.getAttribute('data-chart')))
      .toEqual(['raw', 'normalized']);
    expect(Math.min(...data(true).map(row => row.sensorANormalized))).toBe(0);
    expect(Math.min(...data(true).map(row => row.sensorBNormalized))).toBe(0);
  });

  it('updates both charts and recomputes their separate baselines when selecting 30 days', () => {
    show();
    const previousLast = data(true).at(-1)!.sensorANormalized;
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    const raw = data();
    const normalized = data(true);
    expect(raw).toHaveLength(30);
    expect(normalized).toHaveLength(30);
    expect(normalized.at(-1)!.sensorANormalized).not.toBe(previousLast);
    const minA = Math.min(...raw.map(row => row.sensorA));
    const minB = Math.min(...raw.map(row => row.sensorB));
    normalized.forEach((row, i) => {
      expect(row.sensorANormalized).toBeCloseTo(raw[i].sensorA - minA, 2);
      expect(row.sensorBNormalized).toBeCloseTo(raw[i].sensorB - minB, 2);
    });
  });

  it('supports inclusive single-day ranges and remembers a shared URL selection', async () => {
    show('/timeseries-demo?from=2026-08-31&to=2026-08-31');
    expect(data()).toHaveLength(1);
    expect(data(true)[0]).toMatchObject({ sensorANormalized: 0, sensorBNormalized: 0 });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ from: '2026-08-31', to: '2026-08-31' }));
  });

  it('restores a remembered range, but gives a valid URL precedence', () => {
    localStorage.setItem(key, JSON.stringify({ from: '2025-01-01', to: '2025-01-31' }));
    const first = show();
    expect(data()).toHaveLength(31);
    first.unmount();
    show('/timeseries-demo?from=2026-08-01&to=2026-08-02');
    expect(data()).toHaveLength(2);
    expect(data()[0].date).toBe('2026-08-01');
  });

  it('updates both charts through the date inputs and ignores cleared dates', () => {
    show();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-30' } });
    expect(data()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-30' } });
    expect(data(true)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    expect(data()).toHaveLength(1);
  });

  it('rejects corrupt preferences and clamps out-of-bounds URL dates', () => {
    localStorage.setItem(key, '{broken');
    show('/timeseries-demo?from=2000-01-01&to=2099-01-01');
    expect(data()).toHaveLength(730);
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2024-02-29')).toBe(true);
    expect(validDate(20260101)).toBe(false);
  });

  it('still works when browser preference storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    show();
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(data()).toHaveLength(90);
  });

  it('does not show charts for a farm where the pack is inactive or absent', () => {
    auth.active = false;
    show();
    expect(screen.queryByTestId('raw-data')).toBeNull();
    expect(screen.getByText(/This pack is not active/)).toBeTruthy();
  });
});
