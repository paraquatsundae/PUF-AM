import type { Icon } from '@tabler/icons-react';
import {
  IconLayoutDashboard,
  IconMap,
  IconBook,
  IconDroplets,
  IconFlask2,
  IconTractor,
  IconChartLine,
  IconUsers,
  IconSettings,
  IconInfoCircle,
  IconShieldCheck,
  IconTrees,
  IconPlant,
  IconClipboardList,
  IconTool,
  IconBuildingWarehouse,
} from '@tabler/icons-react';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import { effectiveModules } from '../../shared/auth/farmModules';
import { packNavItemsForGroup } from '../packs/registry';

export type NavItem = {
  name: string;
  href: string;
  icon: Icon;
  adminOnly?: boolean;
  /** Farm module gate (platform Admin has no moduleId). */
  moduleId?: FarmModuleId;
};

export type NavGroupId = 'field' | 'crop' | 'records' | 'system';

export type NavGroup = {
  id: NavGroupId;
  name: string;
  icon: Icon;
  items: NavItem[];
};

function mergePackNav(groupId: NavGroupId, baseItems: NavItem[]): NavItem[] {
  const fromPacks = packNavItemsForGroup(groupId).map((item) => ({
    name: item.name,
    href: item.href,
    icon: item.icon,
    moduleId: item.moduleId,
    ...(item.adminOnly ? { adminOnly: true } : {}),
  }));
  // Pack items first within the group (crop tools ahead of generic water/nutrition).
  const seen = new Set(fromPacks.map((i) => i.href));
  return [...fromPacks, ...baseItems.filter((i) => !seen.has(i.href))];
}

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
  icon: IconLayoutDashboard,
  moduleId: 'dashboard',
};

/**
 * Shell nav groups. Crop-pack routes (e.g. Blight Risk) come from
 * `src/packs/registry` via mergePackNav — do not hardcode pack pages here.
 */
export const navGroups: NavGroup[] = [
  {
    id: 'field',
    name: 'Field',
    icon: IconTrees,
    items: mergePackNav('field', [
      { name: 'Paddock Map', href: '/map', icon: IconMap, moduleId: 'map' },
      { name: 'Farm Diary', href: '/diary', icon: IconBook, moduleId: 'diary' },
    ]),
  },
  {
    id: 'crop',
    name: 'Crop',
    icon: IconPlant,
    items: mergePackNav('crop', [
      { name: 'Water', href: '/water', icon: IconDroplets, moduleId: 'water' },
      { name: 'Nutrition', href: '/nutrition', icon: IconFlask2, moduleId: 'nutrition' },
    ]),
  },
  {
    id: 'records',
    name: 'Records',
    icon: IconClipboardList,
    items: mergePackNav('records', [
      { name: 'Harvest', href: '/harvest', icon: IconTractor, moduleId: 'harvest' },
      { name: 'Financials', href: '/financials', icon: IconChartLine, moduleId: 'financials' },
      { name: 'Farm Management', href: '/farm-management', icon: IconUsers, moduleId: 'farm_management' },
    ]),
  },
  {
    id: 'system',
    name: 'System',
    icon: IconTool,
    items: mergePackNav('system', [
      { name: 'Farm Setup', href: '/farm-setup', icon: IconBuildingWarehouse, moduleId: 'farm_setup' },
      { name: 'Settings', href: '/settings', icon: IconSettings, moduleId: 'settings' },
      { name: 'About', href: '/about', icon: IconInfoCircle },
      { name: 'Admin', href: '/admin', icon: IconShieldCheck, adminOnly: true },
    ]),
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
