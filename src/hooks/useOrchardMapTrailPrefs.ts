import { useCallback, useEffect, useState } from 'react';
import {
  canEnableEveryoneTrails,
  readBreadTrailPrefs,
  writeBreadTrailPrefs,
  type BreadTrailPrefs,
} from '../lib/breadTrails';

export function useOrchardMapTrailPrefs(role: string | undefined) {
  const [trailPrefs, setTrailPrefs] = useState<BreadTrailPrefs>(() => readBreadTrailPrefs());

  const updateTrailPrefs = useCallback(
    (next: BreadTrailPrefs) => {
      const gated: BreadTrailPrefs = {
        ...next,
        showEveryone: canEnableEveryoneTrails(role) ? next.showEveryone : false,
      };
      setTrailPrefs(gated);
      writeBreadTrailPrefs(gated);
    },
    [role]
  );

  useEffect(() => {
    if (!canEnableEveryoneTrails(role) && trailPrefs.showEveryone) {
      updateTrailPrefs({ ...trailPrefs, showEveryone: false });
    }
  }, [role, trailPrefs, updateTrailPrefs]);

  return { trailPrefs, updateTrailPrefs };
}
