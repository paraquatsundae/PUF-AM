import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY = 'pufam.timeseries_demo.range';

export type TimeRange = { from: string; to: string };

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function clampRange(range: TimeRange, minimum: string, maximum: string): TimeRange {
  const from = range.from < minimum ? minimum : range.from > maximum ? maximum : range.from;
  const to = range.to > maximum ? maximum : range.to < minimum ? minimum : range.to;
  return from <= to ? { from, to } : { from: to, to };
}

function storedRange(): TimeRange | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<TimeRange> | null;
    return validDate(parsed?.from ?? null) && validDate(parsed?.to ?? null)
      ? { from: parsed.from, to: parsed.to }
      : null;
  } catch {
    return null;
  }
}

export function useTimeRange(minimum: string, maximum: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const range = useMemo(() => {
    if (validDate(fromParam) && validDate(toParam)) {
      return clampRange({ from: fromParam, to: toParam }, minimum, maximum);
    }
    const saved = storedRange();
    if (saved) return clampRange(saved, minimum, maximum);
    return { from: minimum, to: maximum };
  }, [fromParam, maximum, minimum, toParam]);

  const setRange = useCallback((nextRange: TimeRange) => {
    // A partially cleared date input must not persist an invalid chart range.
    if (!validDate(nextRange.from) || !validDate(nextRange.to)) return;
    const next = clampRange(nextRange, minimum, maximum);
    const params = new URLSearchParams(searchParams);
    params.set('from', next.from);
    params.set('to', next.to);
    setSearchParams(params, { replace: true });
  }, [maximum, minimum, searchParams, setSearchParams]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
    } catch {
      // URL persistence still works when browser storage is unavailable.
    }
  }, [range]);

  useEffect(() => {
    if (fromParam !== range.from || toParam !== range.to) setRange(range);
  }, [fromParam, range, setRange, toParam]);

  return { range, setRange };
}
