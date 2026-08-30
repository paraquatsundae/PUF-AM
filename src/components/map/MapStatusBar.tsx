import React, { useEffect, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

export function MapStatusBar({ map, activeTab }: { map: LeafletMap | null; activeTab: string }) {
  const [mapState, setMapState] = useState({ lat: -33.9249, lng: 115.075, zoom: 15 });

  useEffect(() => {
    if (!map) return;
    const updateState = () => {
      const center = map.getCenter();
      setMapState({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      });
    };
    updateState();
    map.on('moveend', updateState);
    map.on('zoomend', updateState);
    return () => {
      map.off('moveend', updateState);
      map.off('zoomend', updateState);
    };
  }, [map]);

  return (
    <div className="absolute bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 pointer-events-none z-[1000] w-full px-4 justify-center">
      <div className="bg-slate-900/80 backdrop-blur-md text-white px-4 sm:px-6 py-2 sm:py-3 rounded-full shadow-lg border border-white/10 flex items-center gap-3 sm:gap-4 pointer-events-auto max-w-full overflow-hidden">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">{activeTab}</span>
        </div>
        <div className="w-px h-4 bg-white/20 flex-shrink-0" />
        <div className="text-[9px] sm:text-[10px] font-mono text-slate-300 tracking-wider truncate">
          <span className="hidden sm:inline">
            {mapState.lat.toFixed(4)}, {mapState.lng.toFixed(4)} •{' '}
          </span>
          Z{mapState.zoom}
        </div>
      </div>
    </div>
  );
}
