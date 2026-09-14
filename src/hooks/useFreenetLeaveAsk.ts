/**
 * Android session-leave Freenet ask. Desktop quit uses the Electron modal.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (ask before cutting Freenet).
 */

import { useCallback, useRef, useState } from 'react';

import {
  androidFreenetHostStatusNow,
  isFreenetHostPluginAvailable,
} from '../lib/androidFreenetHost.ts';
import { stopManagedFreenetHost } from '../lib/stopManagedFreenet.ts';
import {
  freenetQuitAskKind,
  type FreenetQuitAskKind,
} from '../../units/puf-freenet-host/src/quit-ask.ts';

export type FreenetLeaveAskState = {
  kind: Exclude<FreenetQuitAskKind, 'none'>;
};

export function useFreenetLeaveAsk(): {
  beginLeave: (then: () => void | Promise<void>) => Promise<void>;
  ask: FreenetLeaveAskState | null;
  keepRunning: () => void;
  stopFreenet: () => void;
  leaveAttached: () => void;
} {
  const pending = useRef<(() => void | Promise<void>) | null>(null);
  const [ask, setAsk] = useState<FreenetLeaveAskState | null>(null);

  const finish = useCallback(async (stop: boolean) => {
    const then = pending.current;
    pending.current = null;
    setAsk(null);
    if (stop) {
      try {
        await stopManagedFreenetHost();
      } catch {
        /* best effort — still leave the farm */
      }
    }
    await then?.();
  }, []);

  const beginLeave = useCallback(async (then: () => void | Promise<void>) => {
    if (!isFreenetHostPluginAvailable()) {
      await then();
      return;
    }
    try {
      const status = await androidFreenetHostStatusNow({ probe: true });
      const next = freenetQuitAskKind(status.mode);
      if (next === 'none') {
        await then();
        return;
      }
      pending.current = then;
      setAsk({ kind: next });
    } catch {
      await then();
    }
  }, []);

  return {
    beginLeave,
    ask,
    keepRunning: () => void finish(false),
    stopFreenet: () => void finish(true),
    leaveAttached: () => void finish(false),
  };
}
