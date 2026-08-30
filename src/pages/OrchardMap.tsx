import React, { useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useFarmDiary } from '../lib/farmDiary';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { EditMapSidebar } from '../components/map/EditMapSidebar';
import { editMapTabs } from '../components/map/editMapTabs';
import { useOrchardMapOperate } from '../hooks/useOrchardMapOperate';
import { useOrchardMapDraw } from '../hooks/useOrchardMapDraw';
import { useOrchardMapLayers } from '../hooks/useOrchardMapLayers';
import { useOrchardMapBasemap } from '../hooks/useOrchardMapBasemap';
import { useOrchardMapSearch } from '../hooks/useOrchardMapSearch';
import { useOrchardMapViewport } from '../hooks/useOrchardMapViewport';
import { useOrchardMapAnalytics } from '../hooks/useOrchardMapAnalytics';
import { useOrchardMapClicks } from '../hooks/useOrchardMapClicks';
import { useOrchardMapChrome } from '../hooks/useOrchardMapChrome';
import { useOrchardMapTrailPrefs } from '../hooks/useOrchardMapTrailPrefs';
import { useDebouncedTrackName } from '../hooks/useDebouncedTrackName';
import { OrchardMapToolbar } from '../components/map/OrchardMapToolbar';
import { OrchardMapCanvas } from '../components/map/OrchardMapCanvas';
import { OrchardMapSheets } from '../components/map/OrchardMapSheets';
import { countOpenIssuesByBlock } from '../lib/blockIssueCounts';
import { orchardMapDiaryDateRange } from '../lib/orchardMapDiaryRange';
import { buildOrchardMapDrawLayerCtx } from '../lib/orchardMapDrawLayerCtx';
import { orchardMapCanvasActions } from '../lib/orchardMapCanvasActions';
import { orchardMapSheetActions } from '../lib/orchardMapSheetActions';
import { useFarmChillPortions } from '../hooks/useFarmChillPortions';
import { useChillPack } from '../hooks/useChillPack';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';
import { useCrewPresence } from '../hooks/useCrewPresence';
import { useMapHighlights } from '../hooks/useMapHighlights';
import { mapUiCopy } from '../../shared/farm/farmTypes';

export function OrchardMap() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const chrome = useOrchardMapChrome();
  const { trailPrefs, updateTrailPrefs } = useOrchardMapTrailPrefs(userData?.role);
  const {
    others: crewOthers,
    selfTrail: crewSelfTrail,
    nearbyCount: crewNearby,
    sharing: crewSharing,
    publishStatus: crewPublishStatus,
    lastError: crewError,
  } = useCrewPresence({
    farmId,
    uid: userData?.uid,
    displayName: userData?.displayName || userData?.email,
    fix: chrome.userFix,
    enabled: Boolean(farmId && userData?.uid),
  });
  const basemap = useOrchardMapBasemap(farmId);
  const store = useMapStore();
  const {
    blocks,
    pins,
    tracks,
    viewport,
    setViewport,
    setBounds,
    addBlock,
    updateBlock,
    removeBlock,
    addPin,
    updatePin,
    removePin,
    addTrack,
    updateTrack,
    removeTrack,
    isLoaded,
    canEdit,
    pendingSyncCount,
    syncError,
    clearSyncError,
    flushSync,
    loadData,
  } = store;

  const viewportApi = useOrchardMapViewport({
    mapInstance: chrome.mapInstance,
    isLoaded,
    farmId,
    blocks,
    basemapPack: basemap.basemapPack,
    setViewport,
    setBounds,
    userFix: chrome.userFix,
    followUser: chrome.followUser,
    setFollowUser: chrome.setFollowUser,
  });

  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const diaryDateRange = React.useMemo(() => orchardMapDiaryDateRange(), []);
  const { events, settings, getSprayEvents, getIrrigationEvents } = useFarmDiary(
    diaryDateRange.start,
    diaryDateRange.end
  );
  const showChill = useChillPack();
  const farmChill = useFarmChillPortions(
    viewport.lat,
    viewport.lng,
    showChill,
    settings.dpirdStationCode,
    settings.dpirdStationName
  );
  const mapCopy = useMemo(() => mapUiCopy(settings.farmProfile), [settings.farmProfile]);
  const {
    highlights: mapHighlights,
    createHighlight,
    removeHighlight,
    canDelete: canDeleteHighlight,
  } = useMapHighlights({
    farmId,
    uid: userData?.uid,
    displayName: userData?.displayName || userData?.email,
    role: userData?.role,
    farmDefaultSeconds: settings.highlightDefaultSeconds,
    enabled: Boolean(farmId && userData?.uid),
  });
  const draw = useOrchardMapDraw({
    mapInstance: chrome.mapInstance,
    canEdit,
    mapMode: chrome.mapMode,
    activeTab: chrome.activeTab,
    infraDrawKind: chrome.infraDrawKind,
    farmId,
    isLoaded,
    blocks,
    pins,
    featureGroupRef: chrome.featureGroupRef,
    layerMapRef: chrome.layerMapRef,
    updateBlock,
    setEditingBlockId: chrome.setEditingBlockId,
    setIsConfirmingDeleteBlock: chrome.setIsConfirmingDeleteBlock,
    setHighlightedBlockId: chrome.setHighlightedBlockId,
    setActiveTab: chrome.setActiveTab,
    setShowSidebar: chrome.setShowSidebar,
    setEditingPinId: chrome.setEditingPinId,
  });

  const operate = useOrchardMapOperate({
    farmId,
    uid: userData?.uid,
    mapInstance: chrome.mapInstance,
    mapMode: chrome.mapMode,
    blocks,
    highlightedBlockId: chrome.highlightedBlockId,
    setHighlightedBlockId: chrome.setHighlightedBlockId,
    fitBlockInView: viewportApi.fitBlockInView,
  });

  const clicks = useOrchardMapClicks({
    mapInstance: chrome.mapInstance,
    isLoaded,
    mapMode: chrome.mapMode,
    activeTab: chrome.activeTab,
    blocks,
    featureGroupRef: chrome.featureGroupRef,
    layerMapRef: chrome.layerMapRef,
    activeDrawerRef: draw.activeDrawerRef,
    boundaryEditRef: draw.boundaryEditRef,
    internalBoundaryDrawRef: draw.internalBoundaryDrawRef,
    activeTabRef: chrome.activeTabRef,
    highlightedBlockId: chrome.highlightedBlockId,
    highlightedBlockIdRef: chrome.highlightedBlockIdRef,
    highlightedTrackIdRef: chrome.highlightedTrackIdRef,
    setHighlightedBlockId: chrome.setHighlightedBlockId,
    setHighlightedTrackId: chrome.setHighlightedTrackId,
    setActiveTab: chrome.setActiveTab,
    setShowSidebar: chrome.setShowSidebar,
    setEditingTrackId: chrome.setEditingTrackId,
    setEditingPinId: chrome.setEditingPinId,
    placingFlag: operate.placingFlag,
    setPlacingFlag: operate.setPlacingFlag,
    setReportDraft: operate.setReportDraft,
    setIssuesPanelBlockId: operate.setIssuesPanelBlockId,
    setSelectedIssue: operate.setSelectedIssue,
  });

  const analytics = useOrchardMapAnalytics({
    farmId,
    mapMode: chrome.mapMode,
    activeTab: chrome.activeTab,
    blocks,
    viewport,
    events,
    getSprayEvents,
    getIrrigationEvents,
    irrigationSystemType: settings.irrigationSystemType,
  });

  useOrchardMapLayers({
    mapInstance: chrome.mapInstance,
    isLoaded,
    mapMode: chrome.mapMode,
    activeTab: chrome.activeTab,
    blocks,
    pins,
    tracks,
    featureGroupRef: chrome.featureGroupRef,
    layerMapRef: chrome.layerMapRef,
    highlightedTrackId: chrome.highlightedTrackId,
    highlightedTrackIdRef: chrome.highlightedTrackIdRef,
    highlightedBlockId: chrome.highlightedBlockId,
    internalBoundaryDrawing: draw.internalBoundaryDrawing,
    analyticsView: analytics.analyticsView,
    blockAnalytics: analytics.blockAnalytics,
  });

  const debouncedUpdateTrackName = useDebouncedTrackName(updateTrack);
  const search = useOrchardMapSearch({
    mapInstance: chrome.mapInstance,
    mapMode: chrome.mapMode,
    blocks,
    tracks,
    pins,
    flyToTrack: viewportApi.flyToTrack,
    setHighlightedBlockId: chrome.setHighlightedBlockId,
    setHighlightedTrackId: chrome.setHighlightedTrackId,
    setActiveTab: chrome.setActiveTab,
    setEditingTrackId: chrome.setEditingTrackId,
    setShowSidebar: chrome.setShowSidebar,
  });

  const tabs = editMapTabs(mapCopy);
  const drawLayerCtx = buildOrchardMapDrawLayerCtx({
    farmId,
    canEdit,
    viewport,
    farmProfile: settings.farmProfile,
    blocks,
    pins,
    tracks,
    pinsRef,
    chrome,
    draw,
    store: { addBlock, addPin, addTrack, updateBlock, updatePin, updateTrack, removeBlock, removePin, removeTrack },
  });
  const canvasActions = orchardMapCanvasActions({
    farmId: farmId || '',
    basemapPack: basemap.basemapPack,
    setBasemapSkippedState: basemap.setBasemapSkippedState,
    setShowBasemapSetup: basemap.setShowBasemapSetup,
    refreshBasemapPack: basemap.refreshBasemapPack,
    setHighlightedBlockId: chrome.setHighlightedBlockId,
    setIssuesPanelBlockId: operate.setIssuesPanelBlockId,
    setSelectedIssue: operate.setSelectedIssue,
    placingHighlight: clicks.placingHighlight,
    highlightDraftGeo: clicks.highlightDraftGeo,
    cancelHighlightPaint: clicks.cancelHighlightPaint,
    startHighlightPaint: clicks.startHighlightPaint,
    placingFlag: operate.placingFlag,
    setPlacingFlag: operate.setPlacingFlag,
    setReportDraft: operate.setReportDraft,
    selectedOperateBlock: operate.selectedOperateBlock,
    fitBlockInView: viewportApi.fitBlockInView,
    setHighlightSending: chrome.setHighlightSending,
    createHighlight,
    setHighlightDraftGeo: clicks.setHighlightDraftGeo,
    mapInstance: chrome.mapInstance,
    boundaryEditRef: draw.boundaryEditRef,
    setBoundaryEditTick: draw.setBoundaryEditTick,
    boundaryEditBlockId: draw.boundaryEditBlockId,
    canEdit,
    beginInternalBoundaryDraw: draw.beginInternalBoundaryDraw,
    resolveIssue: operate.resolveIssue,
    selectedIssue: operate.selectedIssue,
  });
  const sheetActions = orchardMapSheetActions({
    namingBlock: chrome.namingBlock,
    updateBlock,
    setNamingBlock: chrome.setNamingBlock,
    setEditingBlockId: chrome.setEditingBlockId,
    setIsConfirmingDeleteBlock: chrome.setIsConfirmingDeleteBlock,
    editingBlockId: chrome.editingBlockId,
    removeBlock,
    featureGroupRef: chrome.featureGroupRef,
    layerMapRef: chrome.layerMapRef,
    setEditingPinId: chrome.setEditingPinId,
    farmId,
    resetFarmFit: viewportApi.resetFarmFit,
    loadData,
    fitFarmInView: viewportApi.fitFarmInView,
    setIsConfirmingDeletePin: chrome.setIsConfirmingDeletePin,
    editingPinId: chrome.editingPinId,
    removePin,
    setEditingTrackId: chrome.setEditingTrackId,
    setIsConfirmingDeleteTrack: chrome.setIsConfirmingDeleteTrack,
    editingTrackId: chrome.editingTrackId,
    removeTrack,
  });

  const openIssuesByBlock = useMemo(
    () => countOpenIssuesByBlock(blocks, operate.fieldIssues),
    [blocks, operate.fieldIssues]
  );

  const enterEditPaddocks = () => {
    chrome.setMapMode('edit');
    chrome.setActiveTab('blocks');
    chrome.setShowSidebar(true);
    operate.setPlacingFlag(false);
    operate.setReportDraft(null);
    operate.setIssuesPanelBlockId(null);
  };

  const exitEditPaddocks = () => {
    chrome.setMapMode('operate');
    chrome.setEditingBlockId(null);
    chrome.setEditingPinId(null);
    chrome.setEditingTrackId(null);
    chrome.setShowSidebar(false);
  };

  if (!isLoaded || !basemap.basemapChecked) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!farmId) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6 text-center text-slate-500 bg-slate-50">
        Sign in with a farm account to use the orchard map.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-900">
      <OrchardMapToolbar
        mapMode={chrome.mapMode}
        mapCopy={mapCopy}
        showSidebar={chrome.showSidebar}
        onToggleSidebar={() => chrome.setShowSidebar(!chrome.showSidebar)}
        showCrewChip={Boolean(userData?.uid) && !isLocalOnlyFarmSession()}
        crewNearby={crewNearby}
        crewPublishStatus={crewPublishStatus}
        crewSharing={crewSharing}
        crewError={crewError}
        pendingSyncCount={pendingSyncCount}
        onFlushSync={() => void flushSync(farmId)}
        searchQuery={search.searchQuery}
        onSearchQuery={search.setSearchQuery}
        onSearch={search.handleSearch}
        isSearching={search.isSearching}
        basemapPack={basemap.basemapPack}
        basemapBusy={basemap.basemapBusy}
        basemapSkipped={basemap.basemapSkipped}
        onOpenBasemapSetup={() => basemap.openBasemapSetup(true)}
        onClearBasemap={() => void basemap.handleClearBasemap()}
        onOpenHelp={() => chrome.setShowHelp(true)}
        canEdit={canEdit}
        onEnterEdit={enterEditPaddocks}
        onExitEdit={exitEditPaddocks}
        tabs={tabs}
        activeTab={chrome.activeTab}
        onSelectTab={(tab) => {
          chrome.setActiveTab(tab);
          chrome.setShowSidebar(true);
        }}
        syncError={syncError}
        onClearSyncError={clearSyncError}
      />

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <EditMapSidebar
          mapMode={chrome.mapMode}
          showSidebar={chrome.showSidebar}
          onCloseSidebar={() => chrome.setShowSidebar(false)}
          tabs={tabs}
          activeTab={chrome.activeTab}
          setActiveTab={chrome.setActiveTab}
          showCoverage={chrome.showCoverage}
          setShowCoverage={chrome.setShowCoverage}
          canEdit={canEdit}
          onImportBoundaries={() => chrome.setShowBoundaryImport(true)}
          onQuickAdd={draw.handleQuickAdd}
          boundaryEditBlockId={draw.boundaryEditBlockId}
          infraDrawKind={chrome.infraDrawKind}
          setInfraDrawKind={chrome.setInfraDrawKind}
          mapCopy={mapCopy}
          blocks={blocks}
          pins={pins}
          tracks={tracks}
          highlightedBlockId={chrome.highlightedBlockId}
          highlightedTrackId={chrome.highlightedTrackId}
          onSelectBlock={(blockId) => {
            chrome.setEditingBlockId(blockId);
            chrome.setHighlightedBlockId(blockId);
          }}
          onSelectAnalyticsBlock={chrome.setHighlightedBlockId}
          onSelectPin={chrome.setEditingPinId}
          onSelectTrack={(track) => {
            chrome.setEditingTrackId(track.id);
            chrome.setHighlightedTrackId(track.id);
            viewportApi.flyToTrack(track);
          }}
          beginInternalBoundaryDraw={draw.beginInternalBoundaryDraw}
          harvests={analytics.harvests}
          analyticsView={analytics.analyticsView}
          setAnalyticsView={analytics.setAnalyticsView}
          blockAnalytics={analytics.blockAnalytics}
        />

        <OrchardMapCanvas
          farmId={farmId}
          mapMode={chrome.mapMode}
          activeTab={chrome.activeTab}
          canEdit={canEdit}
          viewport={viewport}
          mapLayer={chrome.mapLayer}
          basemapPack={basemap.basemapPack}
          showBasemapSetup={basemap.showBasemapSetup}
          isOnline={basemap.isOnline}
          useGoogleSatellite={basemap.useGoogleSatellite}
          googleMapsApiKey={basemap.googleMapsApiKey}
          onGoogleFail={() => basemap.setUseGoogleSatellite(false)}
          featureGroupRef={chrome.featureGroupRef}
          drawLayerCtx={drawLayerCtx}
          boundaryEditBlockId={draw.boundaryEditBlockId}
          showCoverage={chrome.showCoverage}
          pins={pins}
          dailyEvents={analytics.dailyEvents}
          blockCenters={analytics.blockCenters}
          blocks={blocks}
          fieldIssues={operate.fieldIssues}
          openIssuesByBlock={openIssuesByBlock}
          showIssueFlags={operate.showIssueFlags}
          mapHighlights={mapHighlights}
          canDeleteHighlight={canDeleteHighlight}
          onDeleteHighlight={removeHighlight}
          userUid={userData?.uid}
          userRole={userData?.role}
          crewSelfTrail={crewSelfTrail}
          crewOthers={crewOthers}
          trailPrefs={trailPrefs}
          reportDraft={operate.reportDraft}
          followUser={chrome.followUser}
          onUserFix={chrome.setUserFix}
          mapTitle={mapCopy.mapTitle}
          onGoHome={viewportApi.handleGoHome}
          onLocateMe={viewportApi.handleLocateMe}
          userFix={chrome.userFix}
          onToggleFlags={() => operate.setShowIssueFlags((v) => !v)}
          placingHighlight={clicks.placingHighlight}
          highlightDraftGeo={clicks.highlightDraftGeo}
          placingFlag={operate.placingFlag}
          onTrailPrefs={updateTrailPrefs}
          selectedOperateBlock={operate.selectedOperateBlock}
          highlightSending={chrome.highlightSending}
          onCancelHighlight={clicks.cancelHighlightPaint}
          farmDefaultSeconds={settings.highlightDefaultSeconds}
          chill={{
            portions: farmChill.data?.totalPortions ?? null,
            loading: farmChill.loading,
            error: farmChill.error,
            stationName: farmChill.data?.stationName,
            seasonLabel: farmChill.data?.seasonLabel,
          }}
          onCloseBlock={() => chrome.setHighlightedBlockId(null)}
          onReportIssue={operate.startReportForBlock}
          issuesPanelBlock={operate.issuesPanelBlock}
          issuesPanelOpen={Boolean(operate.issuesPanelBlockId)}
          issuesForPanel={operate.issuesForPanel}
          reportBlockName={
            operate.reportDraft?.blockId
              ? blocks.find((b) => b.id === operate.reportDraft?.blockId)?.name
              : undefined
          }
          selectedIssue={operate.selectedIssue}
          onCloseIssues={() => operate.setIssuesPanelBlockId(null)}
          onSaveIssue={operate.handleSaveIssue}
          onCloseIssue={() => operate.setSelectedIssue(null)}
          mapInstance={chrome.mapInstance}
          onMapReady={chrome.setMapInstance}
          boundaryEditRef={draw.boundaryEditRef}
          boundaryEditTick={draw.boundaryEditTick}
          onSaveBoundary={draw.saveBoundaryEdit}
          onCancelBoundary={draw.cancelBoundaryEditUi}
          internalBoundaryDrawing={draw.internalBoundaryDrawing}
          onCancelDraw={draw.clearInternalBoundaryDraw}
          {...canvasActions}
        />
      </div>

      <OrchardMapSheets
        farmId={farmId}
        farmName={settings.farmName || 'Farm'}
        farmProfile={settings.farmProfile}
        canEdit={canEdit}
        mapMode={chrome.mapMode}
        namingBlock={chrome.namingBlock}
        editingBlockId={chrome.editingBlockId}
        blocks={blocks}
        pins={pins}
        isConfirmingDeleteBlock={chrome.isConfirmingDeleteBlock}
        setIsConfirmingDeleteBlock={chrome.setIsConfirmingDeleteBlock}
        updateBlock={updateBlock}
        beginInternalBoundaryDraw={draw.beginInternalBoundaryDraw}
        beginBoundaryEdit={draw.beginBoundaryEdit}
        showBoundaryImport={chrome.showBoundaryImport}
        onCloseImport={() => chrome.setShowBoundaryImport(false)}
        onCurrentFarmBlock={addBlock}
        onCurrentFarmDelete={removeBlock}
        editingPinId={chrome.editingPinId}
        isConfirmingDeletePin={chrome.isConfirmingDeletePin}
        setIsConfirmingDeletePin={chrome.setIsConfirmingDeletePin}
        updatePin={updatePin}
        editingTrackId={chrome.editingTrackId}
        tracks={tracks}
        isConfirmingDeleteTrack={chrome.isConfirmingDeleteTrack}
        setIsConfirmingDeleteTrack={chrome.setIsConfirmingDeleteTrack}
        updateTrack={updateTrack}
        debouncedUpdateTrackName={debouncedUpdateTrackName}
        showHelp={chrome.showHelp}
        onCloseHelp={() => chrome.setShowHelp(false)}
        basemapPack={basemap.basemapPack}
        basemapBusy={basemap.basemapBusy}
        onUpdatePack={() => basemap.openBasemapSetup(true)}
        onClearPack={() => void basemap.handleClearBasemap()}
        {...sheetActions}
      />
    </div>
  );
}
