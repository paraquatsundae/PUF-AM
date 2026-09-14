/**
 * Map-chrome copy for a Freenet farm — never "waiting to sync to the cloud".
 *
 * Cloud pending counts stay in `farmGeometrySync`. This only names Freenet
 * work: a farm that has not been sent yet, or a Hot/bones PUT still in flight.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */

import { usesCloudSyncOutbox } from './farmPipes';
import { getMistBonesPublishStatus, getMistHotPublishStatus } from '../mist/mistHotPublishMeta';
import { getMistPhotoIndexStatus } from '../mist/mistPhotoBridge';

export type FreenetMapPending = {
  label: string;
  title: string;
};

export function describeFreenetMapPending(farmId: string): FreenetMapPending | null {
  if (!farmId || usesCloudSyncOutbox()) return null;

  const hot = getMistHotPublishStatus(farmId);
  const bones = getMistBonesPublishStatus(farmId);
  const photos = getMistPhotoIndexStatus(farmId);
  if (hot?.freenetPending || bones?.freenetPending || photos?.pending) {
    return {
      label: photos?.pending ? 'Sending photo over Freenet…' : 'Sending over Freenet…',
      title: 'This farm is being published to Freenet. It is not waiting on Firebase.',
    };
  }

  return null;
}
