import { useCallback, useEffect, useState } from 'react';
import {
  clearBasemapPack,
  getBasemapPack,
  getBasemapSkipped,
  setBasemapSkipped,
  type BasemapPack,
} from '../lib/basemapPack';

export function useOrchardMapBasemap(farmId: string | undefined) {
  const [basemapPack, setBasemapPack] = useState<BasemapPack | null>(null);
  const [basemapChecked, setBasemapChecked] = useState(false);
  const [showBasemapSetup, setShowBasemapSetup] = useState(false);
  const [basemapBusy, setBasemapBusy] = useState(false);
  const [basemapSkipped, setBasemapSkippedState] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    let capHandle: { remove: () => Promise<void> } | undefined;
    void (async () => {
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        setIsOnline(Boolean(status.connected));
        capHandle = await Network.addListener('networkStatusChange', (s) => {
          setIsOnline(Boolean(s.connected));
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      void capHandle?.remove();
    };
  }, []);

  const refreshBasemapPack = useCallback(async () => {
    if (!farmId) {
      setBasemapPack(null);
      setBasemapSkippedState(false);
      setBasemapChecked(true);
      return;
    }
    try {
      const pack = await getBasemapPack(farmId);
      const skipped = getBasemapSkipped(farmId);
      setBasemapPack(pack);
      setBasemapSkippedState(skipped);
      setShowBasemapSetup(!pack && !skipped);
    } catch (e) {
      console.error('[Basemap] Failed to read pack:', e);
      setBasemapPack(null);
      const skipped = getBasemapSkipped(farmId);
      setBasemapSkippedState(skipped);
      setShowBasemapSetup(!skipped);
    } finally {
      setBasemapChecked(true);
    }
  }, [farmId]);

  useEffect(() => {
    setBasemapChecked(false);
    refreshBasemapPack();
  }, [refreshBasemapPack]);

  const openBasemapSetup = (clearSkip = false) => {
    if (farmId && clearSkip) setBasemapSkipped(farmId, false);
    if (clearSkip) setBasemapSkippedState(false);
    setShowBasemapSetup(true);
  };

  const handleClearBasemap = async () => {
    if (!farmId) return;
    if (!confirm('Clear the local farm satellite map from this device? You will need to download it again.')) {
      return;
    }
    setBasemapBusy(true);
    try {
      await clearBasemapPack(farmId);
      setBasemapPack(null);
      setBasemapSkipped(farmId, false);
      setBasemapSkippedState(false);
      setShowBasemapSetup(true);
    } catch (e) {
      console.error(e);
      alert('Failed to clear local map.');
    } finally {
      setBasemapBusy(false);
    }
  };

  return {
    basemapPack,
    basemapChecked,
    showBasemapSetup,
    setShowBasemapSetup,
    basemapBusy,
    basemapSkipped,
    setBasemapSkippedState,
    isOnline,
    refreshBasemapPack,
    openBasemapSetup,
    handleClearBasemap,
  };
}
