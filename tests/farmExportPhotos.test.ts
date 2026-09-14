import { describe, expect, it } from 'vitest';
import { farmExportPhotoMissingWarning, type FarmExportMissingPhoto } from '../src/lib/farmExportPhotos';
import { exportPhotoZipName } from '../src/lib/farmPhoto';

describe('farm export photo sidecar', () => {
  it('uses flat opaque names', () => {
    expect(exportPhotoZipName('issue-1', 'photo')).toBe('photos/issue-1_photo.jpg');
    expect(exportPhotoZipName('evt-9', 'p2')).toBe('photos/evt-9_p2.jpg');
  });

  it('warns when listed photos have no JPEG on this device', () => {
    const missing: FarmExportMissingPhoto[] = [
      { kind: 'issue', recordId: 'issue-1', photoId: 'photo' },
      { kind: 'event', recordId: 'evt-2', photoId: 'p2' },
    ];
    const text = farmExportPhotoMissingWarning(missing);
    expect(text).toMatch(/2 photos/);
    expect(text).toMatch(/Freenet-cached/);
    expect(text).toMatch(/season review/);
    expect(text).not.toMatch(/silently/);
  });
});
