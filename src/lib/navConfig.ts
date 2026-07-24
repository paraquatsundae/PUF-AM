import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Map,
  BookOpen,
  Bug,
  Droplets,
  Beaker,
  Tractor,
  LineChart,
  Users,
  Settings as SettingsIcon,
  Info,
  ShieldCheck,
  TreePine,
  Sprout,
  ClipboardList,
  Wrench,
  Warehouse,
} from 'lucide-react';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import { effectiveModules } from '../../shared/auth/farmModules';

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Farm module gate (platform Admin has no moduleId). */
  moduleId?: FarmModuleId;
};

export type NavGroupId = 'field' | 'crop' | 'records' | 'system';

export type NavGroup = {
  id: NavGroupId;
  name: string;
  icon: LucideIcon;
  items: NavItem[];
};

/** Clone nav with farm-type-aware map label (Orchard Map vs Paddock Map). */
export function navGroupsForMapTitle(mapTitle: string): NavGroup[] {
  return navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.href === '/map' ? { ...item, name: mapTitle } : item
    ),
  }));
}

export const dashboardItem: NavItem = {
  name: 'Dashboard',
  href: '/',
  icon: LayoutDashboard,
  moduleId: 'dashboard',
};

export const navGroups: NavGroup[] = [
  {
    id: 'field',
    name: 'Field',
    icon: TreePine,
    items: [
      { name: 'Paddock Map', href: '/map', icon: Map, moduleId: 'map' },
      { name: 'Farm Diary', href: '/diary', icon: BookOpen, moduleId: 'diary' },
    ],
  },
  {
    id: 'crop',
    name: 'Crop',
    icon: Sprout,
    items: [
      { name: 'Blight Risk', href: '/blight', icon: Bug, moduleId: 'blight' },
      { name: 'Water', href: '/water', icon: Droplets, moduleId: 'water' },
      { name: 'Nutrition', href: '/nutrition', icon: Beaker, moduleId: 'nutrition' },
    ],
  },
  {
    id: 'records',
    name: 'Records',
    icon: ClipboardList,
    items: [
      { name: 'Harvest', href: '/harvest', icon: Tractor, moduleId: 'harvest' },
      { name: 'Financials', href: '/financials', icon: LineChart, moduleId: 'financials' },
      { name: 'Farm Management', href: '/farm-management', icon: Users, moduleId: 'farm_management' },
    ],
  },
  {
    id: 'system',
    name: 'System',
    icon: Wrench,
    items: [
      { name: 'Farm Setup', href: '/farm-setup', icon: Warehouse, moduleId: 'farm_setup' },
      { name: 'Settings', href: '/settings', icon: SettingsIcon, moduleId: 'settings' },
      { name: 'About', href: '/about', icon: Info },
      { name: 'Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
    ],
  },
];

/** Visible items for a group given admin status + module access. */
export function visibleGroupItems(
  group: NavGroup,
  isAdmin: boolean,
  role?: string,
  modules?: unknown,
  farmEnabled?: unknown
): NavItem[] {
  const allowed = effectiveModules(role, modules, farmEnabled);
  return group.items.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.moduleId && !allowed.includes(item.moduleId)) return false;
    return true;
  });
}

export function pathModuleId(pathname: string): FarmModuleId | null {
  if (pathname === '/' || pathname === '') return 'dashboard';
  for (const group of navGroups) {
    for (const item of group.items) {
      if (!item.moduleId) continue;
      if (pathMatchesHref(pathname, item.href)) return item.moduleId;
    }
  }
  if (pathname === '/' || pathMatchesHref(pathname, dashboardItem.href)) {
    return dashboardItem.moduleId || null;
  }
  return null;
}

/** Whether pathname matches a nav href (exact for `/`, prefix otherwise). */
export function pathMatchesHref(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findGroupForPath(pathname: string): NavGroup | undefined {
  return navGroups.find((group) =>
    group.items.some((item) => pathMatchesHref(pathname, item.href))
  );
}

export function isPathInGroup(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => pathMatchesHref(pathname, item.href));
}
