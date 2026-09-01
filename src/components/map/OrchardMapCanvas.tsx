import { AnimatePresence } from 'motion/react';
import { MapContainer, ZoomControl, FeatureGroup, Marker } from 'react-leaflet';
import L from '../../lib/leaflet-setup';
import { canEnableEveryoneTrails } from '../../lib/breadTrails';
import {
  handleOrchardMapDrawCreated,
  handleOrchardMapDrawDeleted,
  handleOrchardMapDrawEdited,
} from '../../lib/orchardMapDrawCreated';
import { boundaryEditVertexCount } from '../../lib/boundaryEditSession';
import type { OrchardMapCanvasProps } from './orchardMapPaneTypes';
import { FarmBasemapSetup } from './FarmBasemapSetup';
import { StableEditControl } from './StableEditControl';
import { OrchardMapBasemapLayers } from './OrchardMapBasemapLayers';
import { InfraCoverageLayer } from './InfraCoverageLayer';
import { EventMarkerCluster } from './EventMarkerCluster';
import { OperateIssuesLayer } from './OperateIssuesLayer';
import { PaddockNameLayer } from './PaddockNameLayer';
import { MapHighlightsLayer } from './MapHighlightsLayer';
import { BreadTrailLayer } from './BreadTrailLayer';
import { UserLocationLayer } from './UserLocationLayer';
import { CrewPresenceLayer } from './CrewPresenceLayer';
import { MapSoftKeys } from './MapSoftKeys';
import { OperateMapOverlays } from './OperateMapOverlays';
import { MapStatusBar } from './MapStatusBar';
import { DrawingActionBar } from './DrawingActionBar';
import { BoundaryEditActionBar } from './BoundaryEditActionBar';
import { CoverageZonesLegend, InternalBoundaryDrawBanner } from './EditMapBanners';
import { OrchardMapLeafletStyles } from './OrchardMapLeafletStyles';

const leafletDrawOptions = {
  rectangle: false,
  circle: false,
  circlemarker: false,
  polyline: false,
  marker: false,
  polygon: false,
};

const leafletEditOptions = {
  edit: false,
  remove: false,
};

export function OrchardMapCanvas({
  farmId,
  mapMode,
  activeTab,
  canEdit,
  viewport,
  mapLayer,
  basemapPack,
  showBasemapSetup,
  isOnline,
  onBasemapCancel,
  onBasemapComplete,
  featureGroupRef,
  drawLayerCtx,
  boundaryEditBlockId,
  showCoverage,
  pins,
  dailyEvents,
  blockCenters,
  blocks,
  fieldIssues,
  openIssuesByBlock,
  showIssueFlags,
  onSelectIssueBlock,
  onSelectIssue,
  mapHighlights,
  canDeleteHighlight,
  onDeleteHighlight,
  userUid,
  userRole,
  crewSelfTrail,
  crewOthers,
  trailPrefs,
  reportDraft,
  followUser,
  onUserFix,
  mapTitle,
  onGoHome,
  onLocateMe,
  userFix,
  onToggleFlags,
  placingHighlight,
  highlightDraftGeo,
  onToggleHighlight,
  placingFlag,
  onTogglePlaceFlag,
  onTrailPrefs,
  selectedOperateBlock,
  highlightSending,
  onCancelHighlight,
  onSendHighlight,
  farmDefaultSeconds,
  chill,
  onCloseBlock,
  onViewIssues,
  onReportIssue,
  issuesPanelBlock,
  issuesPanelOpen,
  issuesForPanel,
  reportBlockName,
  selectedIssue,
  onCloseIssues,
  onSelectIssueFly,
  onCancelReport,
  onSaveIssue,
  onCloseIssue,
  onResolveSelected,
  onResolveListedIssue,
  mapInstance,
  onMapReady,
  boundaryEditRef,
  boundaryEditTick,
  onSaveBoundary,
  onDeleteBoundaryPoint,
  onCancelBoundary,
  onAddInternalBoundary,
  internalBoundaryDrawing,
  onCancelDraw,
}: OrchardMapCanvasProps) {
  return (
    <div className="flex-1 min-h-0 bg-slate-900 relative overflow-hidden group">
      {showBasemapSetup && (
        <FarmBasemapSetup
          farmId={farmId}
          forceSetup={!basemapPack}
          onCancel={onBasemapCancel}
          onComplete={onBasemapComplete}
        />
      )}
      <MapContainer
        center={[viewport.lat, viewport.lng]}
        zoom={viewport.zoom}
        maxZoom={20}
        zoomControl={false}
        scrollWheelZoom={true}
        wheelPxPerZoomLevel={120}
        wheelDebounceTime={40}
        zoomSnap={0}
        zoomDelta={0.5}
        className="absolute inset-0 z-0 orchard-map-leaflet pufom-hide-draw-toolbar"
        ref={onMapReady}
      >
        <OrchardMapBasemapLayers
          farmId={farmId}
          mapLayer={mapLayer}
          basemapPack={basemapPack}
          isOnline={isOnline}
        />
        <ZoomControl position="bottomright" />

        <FeatureGroup ref={featureGroupRef}>
          {mapMode === 'edit' && canEdit && activeTab !== 'analytics' && !boundaryEditBlockId && (
            <StableEditControl
              position="bottomleft"
              onCreated={(e) => handleOrchardMapDrawCreated(drawLayerCtx, e)}
              onEdited={(e) => handleOrchardMapDrawEdited(drawLayerCtx, e)}
              onDeleted={(e) => handleOrchardMapDrawDeleted(drawLayerCtx, e)}
              draw={leafletDrawOptions}
              edit={leafletEditOptions}
            />
          )}
        </FeatureGroup>

        {activeTab === 'infrastructure' && showCoverage && (
          <InfraCoverageLayer pins={pins} />
        )}

        {activeTab === 'analytics' && (
          <EventMarkerCluster events={dailyEvents as any} blockCenters={blockCenters} />
        )}

        {mapMode === 'operate' && (
          <OperateIssuesLayer
            blocks={blocks}
            issues={fieldIssues}
            openIssuesByBlock={openIssuesByBlock}
            showFlags={showIssueFlags}
            onSelectBlock={onSelectIssueBlock}
            onSelectIssue={onSelectIssue}
          />
        )}

        <PaddockNameLayer blocks={blocks} />

        <MapHighlightsLayer
          highlights={mapHighlights}
          canDelete={canDeleteHighlight}
          onDelete={onDeleteHighlight}
        />

        <BreadTrailLayer
          selfUid={userUid}
          selfTrail={crewSelfTrail}
          others={crewOthers}
          prefs={
            canEnableEveryoneTrails(userRole)
              ? trailPrefs
              : { ...trailPrefs, showEveryone: false }
          }
        />

        {reportDraft && (
          <Marker
            position={[reportDraft.lat, reportDraft.lng]}
            icon={L.divIcon({
              className: '',
              html: `<div style="width:18px;height:18px;border-radius:50%;background:#d97706;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            })}
          />
        )}

        <UserLocationLayer follow={followUser} onFix={onUserFix} />
        <CrewPresenceLayer others={crewOthers} />
      </MapContainer>

      <MapSoftKeys
        mapTitle={mapTitle}
        onGoHome={onGoHome}
        onLocateMe={onLocateMe}
        userFix={userFix}
        followUser={followUser}
        mapMode={mapMode}
        showIssueFlags={showIssueFlags}
        onToggleFlags={onToggleFlags}
        placingHighlight={placingHighlight}
        highlightDraftGeo={highlightDraftGeo}
        onToggleHighlight={onToggleHighlight}
        placingFlag={placingFlag}
        onTogglePlaceFlag={onTogglePlaceFlag}
      />

      {mapMode === 'operate' && (
        <OperateMapOverlays
          trailPrefs={trailPrefs}
          canEveryoneTrails={canEnableEveryoneTrails(userRole)}
          onTrailPrefs={onTrailPrefs}
          placingFlag={placingFlag}
          selectedOperateBlock={selectedOperateBlock}
          placingHighlight={placingHighlight}
          highlightDraftGeo={highlightDraftGeo}
          highlightRole={userRole}
          farmDefaultSeconds={farmDefaultSeconds}
          highlightSending={highlightSending}
          onCancelHighlight={onCancelHighlight}
          onSendHighlight={onSendHighlight}
          openIssuesByBlock={openIssuesByBlock}
          chill={chill}
          onCloseBlock={onCloseBlock}
          onViewIssues={onViewIssues}
          onReportIssue={onReportIssue}
          issuesPanelBlock={issuesPanelBlock}
          issuesPanelOpen={issuesPanelOpen}
          issuesForPanel={issuesForPanel}
          reportDraft={reportDraft}
          reportBlockName={reportBlockName}
          selectedIssue={selectedIssue}
          farmId={farmId}
          onCloseIssues={onCloseIssues}
          onSelectIssue={onSelectIssueFly}
          onCancelReport={onCancelReport}
          onSaveIssue={onSaveIssue}
          onCloseIssue={onCloseIssue}
          onResolveSelected={onResolveSelected}
          onResolveListedIssue={onResolveListedIssue}
        />
      )}

      {mapMode === 'edit' && <MapStatusBar map={mapInstance} activeTab={activeTab} />}

      <DrawingActionBar
        map={mapInstance}
        enabled={
          (mapMode === 'edit' && canEdit && !boundaryEditBlockId) ||
          (mapMode === 'operate' && placingHighlight) ||
          Boolean(internalBoundaryDrawing && mapMode === 'edit' && canEdit)
        }
        onCancel={onCancelDraw}
      />
      <BoundaryEditActionBar
        map={mapInstance}
        enabled={Boolean(boundaryEditBlockId) && mapMode === 'edit' && canEdit}
        selected={boundaryEditRef.current?.selectedIndex != null}
        canDelete={
          Boolean(boundaryEditRef.current) &&
          boundaryEditRef.current?.selectedIndex != null &&
          boundaryEditVertexCount(boundaryEditRef.current) > 3
        }
        onSave={onSaveBoundary}
        onDeletePoint={onDeleteBoundaryPoint}
        onCancel={onCancelBoundary}
        onAddInternalBoundary={onAddInternalBoundary}
      />
      <span className="hidden" aria-hidden>
        {boundaryEditTick}
      </span>
      {internalBoundaryDrawing && mapMode === 'edit' && (
        <InternalBoundaryDrawBanner
          kind={internalBoundaryDrawing.kind}
          blockName={blocks.find((x) => x.id === internalBoundaryDrawing.blockId)?.name}
        />
      )}

      <AnimatePresence>
        {activeTab === 'infrastructure' && showCoverage && <CoverageZonesLegend />}
      </AnimatePresence>

      <OrchardMapLeafletStyles />
    </div>
  );
}
