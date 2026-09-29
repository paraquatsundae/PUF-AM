/**
 * Names a “check this” highlight can be directed at.
 * People ledger is hub-local and fail-soft — empty on Freenet tablets is OK.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  assigneesFromDevice,
  mergeHighlightAssignees,
  type HighlightAssigneeOption,
} from '../lib/highlightAssignees';
import { fetchJoinTicketLedger } from '../lib/joinLedger';
import { mapApi } from '../services/mapApi';

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
  const [farmMembers, setFarmMembers] = useState<HighlightAssigneeOption[]>([]);

  useEffect(() => {
    if (!enabled || !farmId) {
      setLedger([]);
      setFarmMembers([]);
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
    void mapApi
      .getMembers(farmId)
      .then((rows) => {
        if (cancelled) return;
        const members: HighlightAssigneeOption[] = [];
        for (const row of rows) {
          const data = row as { uid?: string; displayName?: string };
          const id = typeof data.uid === 'string' ? data.uid.trim() : '';
          const name = typeof data.displayName === 'string' ? data.displayName.trim() : '';
          if (!id || !name) continue;
          members.push({ id, name });
        }
        setFarmMembers(members);
      })
      .catch(() => {
        if (!cancelled) setFarmMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, farmId]);

  return useMemo(
    () =>
      mergeHighlightAssignees(
        farmMembers,
        assigneesFromDevice({
          sessionName,
          sessionId,
          presence,
          ledger,
        })
      ),
    [farmMembers, sessionName, sessionId, presence, ledger]
  );
}
