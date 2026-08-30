import { useFarmDiary, getDefaultDiaryStartDate, type DiaryEvent } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { useAuth } from '../contexts/AuthContext';
import { SafetyAcceptModal } from '../components/SafetyAcceptModal';
import { DiaryIssuesPanel } from '../components/diary/DiaryIssuesPanel';
import { DiaryPageHeader } from '../components/diary/DiaryPageHeader';
import { DiaryBlockScope } from '../components/diary/DiaryBlockScope';
import { DiaryComposer } from '../components/diary/DiaryComposer';
import { DiaryTimeline } from '../components/diary/DiaryTimeline';
import { issuesForBlock } from '../lib/blockIssueCounts';
import { useFarmDiaryIssues } from '../hooks/useFarmDiaryIssues';
import { useFarmDiaryPage } from '../hooks/useFarmDiaryPage';
import { useFarmDiaryComposer } from '../hooks/useFarmDiaryComposer';

export function FarmDiary() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { events, settings, addEvent, updateEvent, removeEvent, updateSettings, canEdit, loadMore, hasMore, isLoadingMore } =
    useFarmDiary(getDefaultDiaryStartDate(90));
  const { blocks } = useMapStore();

  const { fieldIssues, openIssueCount, markIssueInProgress, resolveLinkedIssue, reopenLinkedIssue, updateFieldIssue } =
    useFarmDiaryIssues(farmId);

  const page = useFarmDiaryPage(events, blocks, farmId, settings.farmName);

  const composer = useFarmDiaryComposer({
    settings,
    addEvent,
    updateSettings,
    focusBlockId: page.focusBlockId,
    markIssueInProgress,
    onSwitchToTimeline: () => page.setPageMode('timeline'),
  });

  const confirmDelete = (event: DiaryEvent) => {
    if (event.type === 'work' && (event.status ?? 'planned') === 'planned' && event.linkedIssueId) {
      reopenLinkedIssue(event.linkedIssueId);
    }
    removeEvent(event.id);
    page.setDeleteConfirmId(null);
  };

  const markDone = (event: DiaryEvent) => {
    updateEvent(event.id, {
      status: 'done',
      completedAt: new Date().toISOString(),
    });
    if (event.linkedIssueId) resolveLinkedIssue(event.linkedIssueId);
  };

  const cancelPlan = (event: DiaryEvent) => {
    updateEvent(event.id, { status: 'cancelled' });
    if (event.linkedIssueId) reopenLinkedIssue(event.linkedIssueId);
  };

  const unlinkIssue = (event: DiaryEvent) => {
    const issueId = event.linkedIssueId;
    if (!issueId) return;
    updateEvent(event.id, { linkedIssueId: undefined });
    reopenLinkedIssue(issueId);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans">
      <DiaryPageHeader
        pageMode={page.pageMode}
        openIssueCount={openIssueCount}
        onPageMode={page.setPageMode}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 space-y-6">
          <DiaryBlockScope
            blocksSorted={page.blocksSorted}
            focusBlockId={page.focusBlockId}
            focusBlock={page.focusBlock}
            onFocusBlock={page.setFocusBlock}
          />

          {page.pageMode === 'issues' ? (
            <DiaryIssuesPanel
              blocks={page.focusBlock ? [page.focusBlock] : blocks}
              issues={page.focusBlock ? issuesForBlock(page.focusBlock, fieldIssues) : fieldIssues}
              canEdit={canEdit}
              onCreatePlan={composer.createPlanFromIssue}
              onResolve={(issue) => {
                if (!farmId) return;
                void updateFieldIssue(farmId, issue.id, {
                  status: 'resolved',
                  resolvedAt: new Date().toISOString(),
                });
              }}
            />
          ) : (
            <>
              <DiaryComposer canEdit={canEdit} blocks={blocks} composer={composer} />
              <DiaryTimeline
                farmId={farmId}
                blocks={blocks}
                filter={page.filter}
                onFilter={page.setFilter}
                searchQuery={page.searchQuery}
                onSearchQuery={page.setSearchQuery}
                filteredEvents={page.filteredEvents}
                groupedByBlock={page.groupedByBlock}
                sortedBlockIds={page.sortedBlockIds}
                focusBlockId={page.focusBlockId}
                onFocusBlock={page.setFocusBlock}
                onExportCsv={page.handleExport}
                exportBusy={page.exportBusy}
                onExportJson={page.exportFarmJson}
                onExportXlsx={page.exportFarmXlsx}
                canEdit={canEdit}
                deleteConfirmId={page.deleteConfirmId}
                onAskDelete={page.setDeleteConfirmId}
                onCancelDelete={() => page.setDeleteConfirmId(null)}
                onConfirmDelete={confirmDelete}
                onAcceptSafety={page.setSafetyForEventId}
                onMarkDone={markDone}
                onCancelPlan={cancelPlan}
                onUnlinkIssue={unlinkIssue}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
              />
            </>
          )}
        </div>
      </div>

      {farmId && page.safetyForEventId && (
        <SafetyAcceptModal
          farmId={farmId}
          title="Safety checklist"
          subtitle="Confirm required checks before starting this planned work."
          confirmLabel="Accept & start"
          onCancel={() => page.setSafetyForEventId(null)}
          onConfirm={() => {
            updateEvent(page.safetyForEventId, {
              safetyChecklistAccepted: true,
              acceptedAt: new Date().toISOString(),
            });
            page.setSafetyForEventId(null);
          }}
        />
      )}
    </div>
  );
}
