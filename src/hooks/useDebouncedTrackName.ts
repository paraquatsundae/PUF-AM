import { useEffect, useMemo } from 'react';
import debounce from 'lodash/debounce';

/** Debounced track rename for the edit sheet. Same 300 ms window as the old page. */
export function useDebouncedTrackName(updateTrack: (id: string, updates: { name: string }) => void) {
  const debouncedUpdateTrackName = useMemo(
    () =>
      debounce((id: string, name: string) => {
        updateTrack(id, { name });
      }, 300),
    [updateTrack]
  );

  useEffect(() => {
    return () => {
      debouncedUpdateTrackName.cancel();
    };
  }, [debouncedUpdateTrackName]);

  return debouncedUpdateTrackName;
}
