import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { MapMode, MapSubTab } from '../components/map/editMapTypes';
import type { UserGeoFix } from '../components/map/UserLocationLayer';
import type { OrchardBlock } from '../lib/mapStore';
import type { InfraTypeId } from '../../shared/farm/infraTypes';

/** Chrome + selection state for OrchardMap. Not viewport / analytics / clicks. */
export function useOrchardMapChrome() {
  const [mapMode, setMapMode] = useState<MapMode>('operate');
  const [activeTab, setActiveTab] = useState<MapSubTab>('blocks');
  const [mapLayer, setMapLayer] = useState<'vector' | 'satellite'>('satellite');
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [highlightSending, setHighlightSending] = useState(false);
  const [userFix, setUserFix] = useState<UserGeoFix | null>(null);
  const [followUser, setFollowUser] = useState(false);
  const [namingBlock, setNamingBlock] = useState<OrchardBlock | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);
  const highlightedBlockIdRef = useRef<string | null>(null);
  highlightedBlockIdRef.current = highlightedBlockId;
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [highlightedTrackId, setHighlightedTrackId] = useState<string | null>(null);
  const highlightedTrackIdRef = useRef<string | null>(null);
  highlightedTrackIdRef.current = highlightedTrackId;
  const [isConfirmingDeleteBlock, setIsConfirmingDeleteBlock] = useState(false);
  const [isConfirmingDeletePin, setIsConfirmingDeletePin] = useState(false);
  const [isConfirmingDeleteTrack, setIsConfirmingDeleteTrack] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const featureGroupRef = useRef<any>(null);
  const layerMapRef = useRef<Record<number, { type: 'block' | 'pin' | 'track'; id: string }>>({});
  const [showBoundaryImport, setShowBoundaryImport] = useState(false);
  const [infraDrawKind, setInfraDrawKind] = useState<Exclude<InfraTypeId, ''>>('standpipe');
  const activeTabRef = useRef<MapSubTab>(activeTab);
  activeTabRef.current = activeTab;
  const infraDrawKindRef = useRef(infraDrawKind);
  infraDrawKindRef.current = infraDrawKind;

  useEffect(() => {
    setMapLayer('satellite');
  }, [activeTab]);

  return {
    mapMode,
    setMapMode,
    activeTab,
    setActiveTab,
    mapLayer,
    mapInstance,
    setMapInstance,
    highlightSending,
    setHighlightSending,
    userFix,
    setUserFix,
    followUser,
    setFollowUser,
    namingBlock,
    setNamingBlock,
    showSidebar,
    setShowSidebar,
    showHelp,
    setShowHelp,
    editingBlockId,
    setEditingBlockId,
    highlightedBlockId,
    setHighlightedBlockId,
    highlightedBlockIdRef,
    editingPinId,
    setEditingPinId,
    editingTrackId,
    setEditingTrackId,
    highlightedTrackId,
    setHighlightedTrackId,
    highlightedTrackIdRef,
    isConfirmingDeleteBlock,
    setIsConfirmingDeleteBlock,
    isConfirmingDeletePin,
    setIsConfirmingDeletePin,
    isConfirmingDeleteTrack,
    setIsConfirmingDeleteTrack,
    showCoverage,
    setShowCoverage,
    featureGroupRef,
    layerMapRef,
    showBoundaryImport,
    setShowBoundaryImport,
    infraDrawKind,
    setInfraDrawKind,
    activeTabRef,
    infraDrawKindRef,
  };
}
