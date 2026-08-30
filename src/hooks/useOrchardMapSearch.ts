import { useState, type FormEvent } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import * as turf from '@turf/turf';
import type { MapMode, MapSubTab } from '../components/map/editMapTypes';
import { farmMapNameMatches } from '../lib/farmMapSearch';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from '../lib/mapStore';

export function useOrchardMapSearch({
  mapInstance,
  mapMode,
  blocks,
  tracks,
  pins,
  flyToTrack,
  setHighlightedBlockId,
  setHighlightedTrackId,
  setActiveTab,
  setEditingTrackId,
  setShowSidebar,
}: {
  mapInstance: LeafletMap | null;
  mapMode: MapMode;
  blocks: OrchardBlock[];
  tracks: FarmTrack[];
  pins: InfrastructurePin[];
  flyToTrack: (track: FarmTrack) => void;
  setHighlightedBlockId: (id: string | null) => void;
  setHighlightedTrackId: (id: string | null) => void;
  setActiveTab: (tab: MapSubTab) => void;
  setEditingTrackId: (id: string | null) => void;
  setShowSidebar: (open: boolean) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query || !mapInstance) return;

    setIsSearching(true);
    try {
      const foundBlock = blocks.find((b) => farmMapNameMatches(b.name, query));
      if (foundBlock?.geojson) {
        try {
          const center = turf.centerOfMass(foundBlock.geojson);
          mapInstance.flyTo([center.geometry.coordinates[1], center.geometry.coordinates[0]], 16);
          setHighlightedBlockId(foundBlock.id);
          setActiveTab('blocks');
          setSearchQuery('');
          return;
        } catch {
          /* fallback to tracks / pins / geocode */
        }
      }

      const foundTrack = tracks.find((t) => farmMapNameMatches(t.name, query));
      if (foundTrack?.geojson) {
        flyToTrack(foundTrack);
        setHighlightedTrackId(foundTrack.id);
        setActiveTab('tracks');
        if (mapMode === 'edit') {
          setEditingTrackId(foundTrack.id);
          setShowSidebar(true);
        }
        setSearchQuery('');
        return;
      }

      const foundPin = pins.find((p) => farmMapNameMatches(p.name, query));
      if (foundPin) {
        mapInstance.flyTo([foundPin.lat, foundPin.lng], 18);
        setActiveTab('infrastructure');
        setSearchQuery('');
        return;
      }

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        mapInstance.flyTo([parseFloat(lat), parseFloat(lon)], 14);
        setSearchQuery('');
      } else {
        console.error('Location not found. Try a different search term.');
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  return { searchQuery, setSearchQuery, isSearching, handleSearch };
}
