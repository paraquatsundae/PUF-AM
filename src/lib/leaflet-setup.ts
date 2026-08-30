import './leaflet-draw-window-type';
import L from './leaflet-window';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import 'leaflet.markercluster';
import { patchLeafletDrawTouchGuards } from './mapDrawHelpers';

if (typeof window !== 'undefined') {
  patchLeafletDrawTouchGuards();
  console.log('Leaflet setup debug:', {
    L_exists: !!L,
    gridLayer_exists: !!L.gridLayer,
    draw_exists: !!(L as any).Draw,
    markerCluster_exists: !!(L as any).markerClusterGroup,
    isExtensible: Object.isExtensible(L)
  });
}

export default L;
