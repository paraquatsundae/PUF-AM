import { useEffect, useMemo } from 'react';
import { useFieldStore } from '../lib/fieldStore';

export function useFarmDiaryIssues(farmId: string | undefined) {
  const fieldIssues = useFieldStore((s) => s.issues);
  const loadFieldData = useFieldStore((s) => s.loadData);
  const updateFieldIssue = useFieldStore((s) => s.updateIssue);

  useEffect(() => {
    if (farmId) loadFieldData(farmId);
  }, [farmId, loadFieldData]);

  const openIssueCount = useMemo(
    () => fieldIssues.filter((i) => i.status === 'open' || i.status === 'in-progress').length,
    [fieldIssues]
  );

  const markIssueInProgress = (issueId: string) => {
    if (!farmId) return;
    void updateFieldIssue(farmId, issueId, { status: 'in-progress' });
  };

  const resolveLinkedIssue = (issueId: string) => {
    if (!farmId) return;
    void updateFieldIssue(farmId, issueId, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
  };

  const reopenLinkedIssue = (issueId: string) => {
    if (!farmId) return;
    void updateFieldIssue(farmId, issueId, {
      status: 'open',
      resolvedAt: null as unknown as undefined,
    });
  };

  return {
    fieldIssues,
    openIssueCount,
    markIssueInProgress,
    resolveLinkedIssue,
    reopenLinkedIssue,
    updateFieldIssue,
  };
}
