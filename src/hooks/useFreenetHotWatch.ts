/**
 * Background Freenet Hot watch while a farm is open and a node can answer.
 * Polls the watch slot (20s) even when the window is unfocused — Linux ↔ APK
 * chat died when AppImage lost focus and skipped the poll. No Settings → Sync → Pull.
 *
 * Freenet 0.2.135 host plugin has no subscribe API we can use; this is a poll.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9 Decision 2026-09-12
 */
import { useEffect, useRef } from 'react';
import { freenetPlaneFarmId, shouldRunFreenetHotWatch } from '../lib/farmPipes';
import { canReachFreenetNode, refreshFreenetRuntime } from '../lib/freenetRuntime';
import { flushPendingBonesAutoPublish } from '../mist/mistBonesBridge';
import { flushPendingHotAutoPublish } from '../mist/mistHotBridge';
import {
  FREENET_HOT_WATCH_MIN_GAP_MS,
  FREENET_HOT_WATCH_POLL_MS,
  pollFreenetHotWatch,
  refreshFarmUiAfterHotMerge,
} from '../mist/hotWatchSync';

export function useFreenetHotWatch(farmId: string | null | undefined): void {
  const lastAt = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    const watchFarmId = freenetPlaneFarmId() || farmId;
    if (!watchFarmId || !shouldRunFreenetHotWatch()) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || running.current) return;
      const now = Date.now();
      if (now - lastAt.current < FREENET_HOT_WATCH_MIN_GAP_MS) return;

      const runtime = await refreshFreenetRuntime().catch(() => null);
      if (!runtime || !canReachFreenetNode(runtime)) return;

      running.current = true;
      lastAt.current = now;
      try {
        await flushPendingBonesAutoPublish(watchFarmId);
        await flushPendingHotAutoPublish(watchFarmId);
        const result = await pollFreenetHotWatch(watchFarmId);
        if (result === 'applied' && !cancelled) {
          await refreshFarmUiAfterHotMerge(watchFarmId);
        }
      } catch {
        /* Quiet — same rule as auto-sync: a sleeping node is not news. */
      } finally {
        running.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), FREENET_HOT_WATCH_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [farmId]);
}
