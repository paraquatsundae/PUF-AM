import type { LucideIcon } from 'lucide-react';

export type MapMode = 'operate' | 'edit';
export type MapSubTab = 'blocks' | 'infrastructure' | 'tracks' | 'analytics';

export type EditMapTab = {
  id: MapSubTab;
  name: string;
  icon: LucideIcon;
  description: string;
};
