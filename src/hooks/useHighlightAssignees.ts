/**
 * Names a “check this” highlight can be directed at.
 * People ledger is hub-local and fail-soft — empty on Freenet tablets is OK.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  assigneesFromDevice,
  type HighlightAssigneeOption,
} from '../lib/highlightAssignees';
import { fetchJoinTicketLedger } from '../lib/joinLedger';

type Opts = {
  farmId: string | null | undefined;
  sessionName?: string | null;
  sessionId?: string | null;
  presence?: Array<{ uid?: string; displayName?: string | null }>;
  enabled?: boolean;
};

export function useHighlightAssignees({
  farmId,
  sessionName,
  sessionId,
  presence,
  enabled = true,
}: Opts): HighlightAssigneeOption[] {
  const [ledger, setLedger] = useState<Array<{ id?: string; label?: string | null }>>([]);

  useEffect(() => {
    if (!enabled || !farmId) {
      setLedger([]);
      return;
    }
    let cancelled = false;
    void fetchJoinTicketLedger(farmId)
      .then((result) => {
        if (!cancelled) setLedger(result.rows);
      })
      .catch(() => {
        if (!cancelled) setLedger([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, farmId]);

  return useMemo(
    () =>
      assigneesFromDevice({
        sessionName,
        sessionId,
        presence,
        ledger,
      }),
    [sessionName, sessionId, presence, ledger]
  );
}
