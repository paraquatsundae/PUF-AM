/**
 * One job: poll / ensure Freenet until Join can unwrap (On Opennet).
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (Join waits for On Opennet).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { isFreenetHostHoldOff } from '../lib/freenetHostHoldOff';
import {
  FREENET_JOIN_WAIT_POLL_MS,
  describeFreenetJoinWait,
  freenetJoinDeviceIsOffline,
  initialFreenetJoinWaitView,
  readFreenetJoinHostStatus,
  waitForFreenetJoinOpennet,
  type FreenetJoinWaitDeps,
  type FreenetJoinWaitResult,
  type FreenetJoinWaitView,
} from '../lib/freenetJoinWait';
import { ensureFreenetHostListening } from '../mist/ensureFreenetHostListening';

export type UseFreenetJoinWaitDeps = Pick<
  FreenetJoinWaitDeps,
  'readHost' | 'ensureHost' | 'isHoldOff' | 'isOffline' | 'pollMs' | 'timeoutMs'
>;

export function useFreenetJoinWait(
  enabled: boolean,
  deps: UseFreenetJoinWaitDeps = {},
): {
  view: FreenetJoinWaitView;
  waitUntilOpennet: () => Promise<FreenetJoinWaitResult>;
} {
  const [view, setView] = useState<FreenetJoinWaitView>(() => {
    const holdOff = (deps.isHoldOff ?? isFreenetHostHoldOff)();
    const offline = (deps.isOffline ?? freenetJoinDeviceIsOffline)();
    if (holdOff || offline) {
      return describeFreenetJoinWait({
        elapsedMs: 0,
        timeoutMs: 0,
        holdOff,
        offline,
        host: null,
        polled: true,
      });
    }
    return initialFreenetJoinWaitView();
  });
  const viewRef = useRef(view);
  viewRef.current = view;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pollMs = depsRef.current.pollMs ?? FREENET_JOIN_WAIT_POLL_MS;

    const tick = async () => {
      if (cancelled) return;
      const current = depsRef.current;
      const isHoldOff = current.isHoldOff ?? isFreenetHostHoldOff;
      const isOffline = current.isOffline ?? freenetJoinDeviceIsOffline;
      if (isHoldOff()) {
        setView(
          describeFreenetJoinWait({
            elapsedMs: 0,
            timeoutMs: 0,
            holdOff: true,
            offline: false,
            host: null,
            polled: true,
          }),
        );
        return;
      }
      if (isOffline()) {
        setView(
          describeFreenetJoinWait({
            elapsedMs: 0,
            timeoutMs: 0,
            holdOff: false,
            offline: true,
            host: null,
            polled: true,
          }),
        );
        return;
      }
      const ensureHost = current.ensureHost ?? (() => ensureFreenetHostListening());
      const readHost = current.readHost ?? readFreenetJoinHostStatus;
      await ensureHost();
      const host = await readHost();
      if (cancelled) return;
      setView(
        describeFreenetJoinWait({
          elapsedMs: 0,
          timeoutMs: 0,
          holdOff: false,
          offline: false,
          host,
          polled: true,
        }),
      );
    };

    void tick();
    const timer = window.setInterval(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [enabled]);

  const waitUntilOpennet = useCallback(async (): Promise<FreenetJoinWaitResult> => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const current = depsRef.current;
    return waitForFreenetJoinOpennet({
      readHost: current.readHost,
      ensureHost: current.ensureHost,
      isHoldOff: current.isHoldOff,
      isOffline: current.isOffline,
      pollMs: current.pollMs,
      timeoutMs: current.timeoutMs,
      seed: viewRef.current,
      signal: ac.signal,
      onProgress: setView,
    });
  }, []);

  return { view, waitUntilOpennet };
}
