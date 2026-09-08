import { describe, expect, it } from 'vitest';

import {
  applyWeatherSettingsDoc,
  parseWeatherEndpoint,
  parseWeatherEndpointError,
} from '../src/lib/byoWeatherEndpoint';

const FN = 'https://australia-southeast1-my-farm-project.cloudfunctions.net/byoWeatherApi';

describe('parseWeatherEndpoint', () => {
  it('accepts a Cloud Functions URL and strips a trailing slash', () => {
    const result = parseWeatherEndpoint(`${FN}/`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe(FN);
  });

  it('strips a pasted /api/weather path so apiUrl can append it', () => {
    const result = parseWeatherEndpoint(`${FN}/api/weather/health`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe(FN);
  });

  it('allows localhost http for a workshop emulator', () => {
    const result = parseWeatherEndpoint('http://127.0.0.1:5001/my-farm/us-central1/byoWeatherApi');
    expect(result.ok).toBe(true);
  });

  it('refuses the PUFworks weather hosts', () => {
    expect(parseWeatherEndpoint('https://am.pufworks.farm/api/weather/ensure-cache').ok).toBe(false);
    expect(parseWeatherEndpoint('https://Am.Pufworks.Farm/api/weather/ensure-cache').ok).toBe(false);
    expect(
      parseWeatherEndpointError(
        parseWeatherEndpoint('https://pufom-quby5ye5pa-ts.a.run.app/api/weather/ensure-cache')
      )
    ).toMatch(/PUFworks/);
  });

  it('refuses a pasted DPIRD key', () => {
    expect(parseWeatherEndpoint('sk-dpird-not-a-url').ok).toBe(false);
    expect(parseWeatherEndpointError(parseWeatherEndpoint(`${FN}?api-key=abc`))).toMatch(/key/i);
  });

  it('refuses http on the public internet', () => {
    expect(parseWeatherEndpoint('http://example.com/byoWeatherApi').ok).toBe(false);
  });
});

describe('applyWeatherSettingsDoc', () => {
  it('reads a valid endpoint and ignores setAt', () => {
    expect(applyWeatherSettingsDoc({ weatherEndpoint: FN, setAt: '2026-09-08T00:00:00.000Z' })).toBe(FN);
  });

  it('returns null when a key-shaped field is present', () => {
    expect(
      applyWeatherSettingsDoc({ weatherEndpoint: FN, dpirdApiKey: 'nope' })
    ).toBeNull();
  });

  it('returns null for an empty or hosted doc', () => {
    expect(applyWeatherSettingsDoc(undefined)).toBeNull();
    expect(applyWeatherSettingsDoc({ weatherEndpoint: 'https://am.pufworks.farm' })).toBeNull();
  });
});
