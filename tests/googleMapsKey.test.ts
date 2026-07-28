import { describe, expect, it } from 'vitest';
import { resolveGoogleMapsApiKey } from '../src/lib/googleMapsKey';

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
