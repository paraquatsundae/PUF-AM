import { BarChart3, Layers, MapPin, Route } from 'lucide-react';
import type { MapUiCopy } from '../../../shared/farm/farmTypes';
import type { EditMapTab } from './editMapTypes';

export function editMapTabs(mapCopy: MapUiCopy): EditMapTab[] {
  return [
    { id: 'blocks', name: mapCopy.blocksTab, icon: Layers, description: 'Draw and edit paddock boundaries' },
    { id: 'tracks', name: 'Tracks', icon: Route, description: 'Farm pathways & navigation' },
    { id: 'infrastructure', name: 'Infrastructure', icon: MapPin, description: 'Dams, pipes, sensors & pins' },
    { id: 'analytics', name: 'Analytics', icon: BarChart3, description: 'Risk heatmaps & yield view' },
  ];
}
