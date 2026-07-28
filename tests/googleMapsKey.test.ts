import { describe, expect, it, vi, afterEach } from 'vitest';
import { preferEsriSatelliteBasemap, resolveGoogleMapsApiKey } from '../src/lib/googleMapsKey';

describe('resolveGoogleMapsApiKey', () => {
  it('rejects empty and placeholder keys', () => {
    expect(resolveGoogleMapsApiKey('')).toBeUndefined();
    expect(resolveGoogleMapsApiKey('   ')).toBeUndefined();
    expect(resolveGoogleMapsApiKey('YOUR_GOOGLE_MAPS_API_KEY')).toBeUndefined();
    expect(resolveGoogleMapsApiKey('your_api_key_here')).toBeUndefined();
  });

  it('accepts a real-looking key', () => {
    expect(resolveGoogleMapsApiKey('AIzaSyDummyKeyForUnitTest123')).toBe(
      'AIzaSyDummyKeyForUnitTest123'
    );
  });
});

describe('preferEsriSatelliteBasemap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to Esri (avoids blank Google Mutant on localhost/LAN)', () => {
    vi.stubEnv('VITE_PREFER_GOOGLE_SATELLITE', '');
    expect(preferEsriSatelliteBasemap()).toBe(true);
  });

  it('allows forcing Google via env', () => {
    vi.stubEnv('VITE_PREFER_GOOGLE_SATELLITE', '1');
    expect(preferEsriSatelliteBasemap()).toBe(false);
  });
});
