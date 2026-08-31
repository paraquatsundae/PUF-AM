import './leaflet-draw-window-type';
import L from './leaflet-window';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import 'leaflet.markercluster';
import { patchLeafletDrawTouchGuards } from './mapDrawHelpers';

if (typeof window !== 'undefined') {
  patchLeafletDrawTouchGuards();
}

export default L;
