import { AnimatePresence, motion } from 'motion/react';
import type { FieldIssue } from '../../lib/fieldStore';
import type { OrchardBlock } from '../../lib/mapStore';
import type { BreadTrailPrefs } from '../../lib/breadTrails';
import type { ChillDisplay } from './BlockOperateCard';
import { BlockOperateCard } from './BlockOperateCard';
import { BlockIssuesSheet } from './BlockIssuesSheet';
import { ReportIssueSheet } from './ReportIssueSheet';
import { HighlightComposeSheet } from './HighlightComposeSheet';
import { BreadTrailToggles } from './BreadTrailToggles';
import { OperateIssueDetailSheet } from './OperateIssueDetailSheet';

export function OperateMapOverlays({
  trailPrefs,
  canEveryoneTrails,
  onTrailPrefs,
  placingFlag,
  selectedOperateBlock,
  placingHighlight,
  highlightDraftGeo,
  highlightRole,
  farmDefaultSeconds,
  highlightSending,
  onCancelHighlight,
  onSendHighlight,
  openIssuesByBlock,
  chill,
  onCloseBlock,
  onViewIssues,
  onReportIssue,
  issuesPanelBlock,
  issuesPanelOpen,
  issuesForPanel,
  reportDraft,
  reportBlockName,
  selectedIssue,
  farmId,
  onCloseIssues,
  onSelectIssue,
  onCancelReport,
  onSaveIssue,
  onCloseIssue,
  onResolveSelected,
  onResolveListedIssue,
}: {
  trailPrefs: BreadTrailPrefs;
  canEveryoneTrails: boolean;
  onTrailPrefs: (next: BreadTrailPrefs) => void;
  placingFlag: boolean;
  selectedOperateBlock: OrchardBlock | null;
  placingHighlight: boolean;
  highlightDraftGeo: GeoJSON.Feature | GeoJSON.Geometry | null;
  highlightRole: string | undefined;
  farmDefaultSeconds: number | undefined;
  highlightSending: boolean;
  onCancelHighlight: () => void;
  onSendHighlight: (payload: { note: string; durationSeconds: number }) => void;
  openIssuesByBlock: Record<string, number>;
  chill: ChillDisplay;
  onCloseBlock: () => void;
  onViewIssues: () => void;
  onReportIssue: (block: OrchardBlock) => void;
  issuesPanelBlock: OrchardBlock | null;
  issuesPanelOpen: boolean;
  issuesForPanel: FieldIssue[];
  reportDraft: { lat: number; lng: number; blockId?: string } | null;
  reportBlockName?: string;
  selectedIssue: FieldIssue | null;
  farmId: string | undefined;
  onCloseIssues: () => void;
  onSelectIssue: (issue: FieldIssue) => void;
  onCancelReport: () => void;
  onSaveIssue: (data: {
    category: FieldIssue['category'];
    priority: FieldIssue['priority'];
    note: string;
  }) => Promise<void>;
  onCloseIssue: () => void;
  onResolveSelected: () => void;
  onResolveListedIssue: (issue: FieldIssue) => void;
}) {
  return (
    <>
      <div className="absolute top-3 left-3 z-[1000] pointer-events-none">
        <BreadTrailToggles prefs={trailPrefs} canEveryone={canEveryoneTrails} onChange={onTrailPrefs} />
      </div>

      {placingFlag && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none">
          <div className="bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
            {selectedOperateBlock
              ? `Tap inside ${selectedOperateBlock.name || 'block'} to drop pin`
              : 'Tap the map to drop a pin'}
          </div>
        </div>
      )}

      {placingHighlight && !highlightDraftGeo && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none">
          <div className="bg-teal-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
            Trace an area — Finish when done
          </div>
        </div>
      )}

      {highlightDraftGeo && (
        <HighlightComposeSheet
          role={highlightRole}
          farmDefaultSeconds={farmDefaultSeconds}
          busy={highlightSending}
          onCancel={onCancelHighlight}
          onSend={onSendHighlight}
        />
      )}

      <AnimatePresence>
        {selectedOperateBlock &&
          !placingFlag &&
          !placingHighlight &&
          !highlightDraftGeo &&
          !issuesPanelOpen &&
          !reportDraft &&
          !selectedIssue && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="absolute bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 z-[1100] w-[calc(100%-1.5rem)] sm:w-full px-2 flex justify-center pointer-events-none"
            >
              <BlockOperateCard
                block={selectedOperateBlock}
                openIssues={openIssuesByBlock[selectedOperateBlock.id] || 0}
                chill={chill}
                onClose={onCloseBlock}
                onViewIssues={onViewIssues}
                onReportIssue={() => onReportIssue(selectedOperateBlock)}
              />
            </motion.div>
          )}
      </AnimatePresence>

      {issuesPanelBlock && !reportDraft && (
        <BlockIssuesSheet
          blockName={issuesPanelBlock.name || 'Unnamed block'}
          issues={issuesForPanel}
          onClose={onCloseIssues}
          onSelectIssue={onSelectIssue}
          onReport={() => onReportIssue(issuesPanelBlock)}
          onResolve={farmId ? onResolveListedIssue : undefined}
        />
      )}

      {reportDraft && (
        <ReportIssueSheet
          location={reportDraft}
          blockName={reportBlockName}
          onCancel={onCancelReport}
          onSave={onSaveIssue}
        />
      )}

      {selectedIssue && !reportDraft && (
        <OperateIssueDetailSheet
          issue={selectedIssue}
          canResolve={Boolean(farmId)}
          onClose={onCloseIssue}
          onResolve={onResolveSelected}
        />
      )}
    </>
  );
}
