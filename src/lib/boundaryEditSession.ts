/**
 * Single-paddock vertex edit: select, drag, delete vertices on a Leaflet polygon.
 */
import type { Map as LeafletMap, Polygon, Marker, LatLng } from 'leaflet';
import L from './leaflet-window';
import {
  areaHaFromRing,
  openRing,
  polygonFeatureFromRing,
  ringFromGeojson,
  type LonLat,
} from './boundaryGeometry';
import { markDrawUiInteraction } from './mapDrawHelpers';

export type BoundaryEditSession = {
  blockId: string;
  map: LeafletMap;
  polygon: Polygon;
  markers: Marker[];
  selectedIndex: number | null;
  originalGeojson: unknown;
  onChange: () => void;
};

function vertexIcon(selected: boolean): L.DivIcon {
  const bg = selected ? '#dc2626' : '#4f46e5';
  const size = selected ? 22 : 18;
  return L.divIcon({
    className: 'pufom-boundary-vertex',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  });
}

function latLngsToRing(latlngs: LatLng[]): LonLat[] {
  return latlngs.map((ll) => [ll.lng, ll.lat] as LonLat);
}

function getPolygonLatLngs(polygon: Polygon): LatLng[] {
  const latlngs = polygon.getLatLngs();
  const ring = Array.isArray(latlngs[0]) ? (latlngs[0] as LatLng[]) : (latlngs as LatLng[]);
  return openRing(ring.map((ll) => [ll.lng, ll.lat] as LonLat)).map(([lon, lat]) =>
    L.latLng(lat, lon)
  );
}

function applyRingToPolygon(polygon: Polygon, ring: LonLat[]): void {
  polygon.setLatLngs(openRing(ring).map(([lon, lat]) => L.latLng(lat, lon)));
}

function syncPolygonFromMarkers(session: BoundaryEditSession): void {
  const pts = session.markers.map((m) => m.getLatLng());
  applyRingToPolygon(session.polygon, latLngsToRing(pts));
}

function clearMarkers(session: BoundaryEditSession): void {
  for (const m of session.markers) {
    m.off();
    session.map.removeLayer(m);
  }
  session.markers = [];
}

function rebuildMarkers(session: BoundaryEditSession): void {
  clearMarkers(session);
  const latlngs = getPolygonLatLngs(session.polygon);
  latlngs.forEach((ll, index) => {
    const selected = session.selectedIndex === index;
    const marker = L.marker(ll, {
      draggable: true,
      icon: vertexIcon(selected),
      zIndexOffset: 1000,
      keyboard: false,
    });

    marker.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      markDrawUiInteraction(session.map as unknown as { _container?: HTMLElement });
      session.selectedIndex = index;
      session.markers.forEach((m, i) => m.setIcon(vertexIcon(i === index)));
      session.onChange();
    });

    marker.on('dragstart', () => {
      markDrawUiInteraction(session.map as unknown as { _container?: HTMLElement });
      session.selectedIndex = index;
      session.markers.forEach((m, i) => m.setIcon(vertexIcon(i === index)));
      session.onChange();
    });

    marker.on('drag', () => {
      markDrawUiInteraction(session.map as unknown as { _container?: HTMLElement });
      syncPolygonFromMarkers(session);
    });

    marker.on('dragend', () => {
      syncPolygonFromMarkers(session);
      session.onChange();
    });

    marker.addTo(session.map);
    session.markers.push(marker);
  });
}

export function startBoundaryEdit(opts: {
  map: LeafletMap;
  polygon: Polygon;
  blockId: string;
  onChange: () => void;
}): BoundaryEditSession {
  const originalGeojson = opts.polygon.toGeoJSON();
  opts.polygon.setStyle({
    color: '#4f46e5',
    weight: 3,
    fillOpacity: 0.25,
    dashArray: '6 4',
  });
  const session: BoundaryEditSession = {
    blockId: opts.blockId,
    map: opts.map,
    polygon: opts.polygon,
    markers: [],
    selectedIndex: null,
    originalGeojson,
    onChange: opts.onChange,
  };
  opts.map.getContainer().classList.add('pufom-boundary-editing');
  rebuildMarkers(session);
  return session;
}

export function deleteSelectedVertex(session: BoundaryEditSession): boolean {
  if (session.selectedIndex == null) return false;
  const latlngs = getPolygonLatLngs(session.polygon);
  if (latlngs.length <= 3) return false;
  latlngs.splice(session.selectedIndex, 1);
  applyRingToPolygon(session.polygon, latLngsToRing(latlngs));
  session.selectedIndex = Math.min(session.selectedIndex, latlngs.length - 1);
  if (latlngs.length === 0) session.selectedIndex = null;
  rebuildMarkers(session);
  session.onChange();
  return true;
}

export function commitBoundaryEdit(session: BoundaryEditSession): {
  geojson: GeoJSON.Feature<GeoJSON.Polygon>;
  areaHa: number;
} {
  const ring = latLngsToRing(getPolygonLatLngs(session.polygon));
  const geojson = polygonFeatureFromRing(ring);
  const areaHa = areaHaFromRing(ring);
  teardownBoundaryEdit(session);
  return { geojson, areaHa };
}

export function cancelBoundaryEdit(session: BoundaryEditSession): void {
  const ring = ringFromGeojson(session.originalGeojson);
  if (ring) applyRingToPolygon(session.polygon, ring);
  teardownBoundaryEdit(session);
}

function teardownBoundaryEdit(session: BoundaryEditSession): void {
  clearMarkers(session);
  session.map.getContainer().classList.remove('pufom-boundary-editing');
  session.polygon.setStyle({
    color: '#4f46e5',
    weight: 2,
    fillOpacity: 0.4,
    dashArray: undefined,
  });
  session.selectedIndex = null;
}

export function boundaryEditVertexCount(session: BoundaryEditSession | null): number {
  if (!session) return 0;
  return getPolygonLatLngs(session.polygon).length;
}
