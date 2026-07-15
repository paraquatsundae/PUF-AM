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

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export type NavGroupId = 'field' | 'crop' | 'records' | 'system';

export type NavGroup = {
  id: NavGroupId;
  name: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const dashboardItem: NavItem = {
  name: 'Dashboard',
  href: '/',
  icon: LayoutDashboard,
};

export const navGroups: NavGroup[] = [
  {
    id: 'field',
    name: 'Field',
    icon: TreePine,
    items: [
      { name: 'Orchard Map', href: '/map', icon: Map },
      { name: 'Farm Diary', href: '/diary', icon: BookOpen },
    ],
  },
  {
    id: 'crop',
    name: 'Crop',
    icon: Sprout,
    items: [
      { name: 'Blight Risk', href: '/blight', icon: Bug },
      { name: 'Water', href: '/water', icon: Droplets },
      { name: 'Nutrition', href: '/nutrition', icon: Beaker },
    ],
  },
  {
    id: 'records',
    name: 'Records',
    icon: ClipboardList,
    items: [
      { name: 'Harvest', href: '/harvest', icon: Tractor },
      { name: 'Financials', href: '/financials', icon: LineChart },
      { name: 'Farm Management', href: '/farm-management', icon: Users },
    ],
  },
  {
    id: 'system',
    name: 'System',
    icon: Wrench,
    items: [
      { name: 'Farm Setup', href: '/farm-setup', icon: Warehouse },
      { name: 'Settings', href: '/settings', icon: SettingsIcon },
      { name: 'About', href: '/about', icon: Info },
      { name: 'Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
    ],
  },
];

/** Visible items for a group given admin status. */
export function visibleGroupItems(group: NavGroup, isAdmin: boolean): NavItem[] {
  return group.items.filter((item) => !item.adminOnly || isAdmin);
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
