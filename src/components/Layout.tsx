import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  IconChevronsLeft,
  IconChevronDown,
  IconLogout,
  IconMenu2,
} from '@tabler/icons-react';
import { cn } from '../lib/utils';
import {
  dashboardItem,
  navGroupsForMapTitle,
  visibleGroupItems,
  pathMatchesHref,
  findGroupForPath,
  type NavGroupId,
} from '../lib/navConfig';
import { BottomNav } from './BottomNav';
import { useFarmDiary } from '../lib/farmDiary';
import { useOfferedFarmModules } from '../hooks/useOfferedFarmModules';
import { mapUiCopy } from '../../shared/farm/farmTypes';
import { APP_FULL_NAME, APP_LOGO_SRC, APP_NAME } from '../brand';

/** Below xl: overlay drawer (phone + tablet). xl+: permanent sidebar. */
const NAV_DRAWER_MQ = '(max-width: 1279px)';

export function Layout() {
  const { user, userData, isAdmin, isPlatformAdmin, hasModule, logout } = useAuth();
  const offeredModules = useOfferedFarmModules();
  const { settings } = useFarmDiary();
  const mapTitle = mapUiCopy(settings.farmProfile).mapTitle;
  const groups = React.useMemo(() => navGroupsForMapTitle(mapTitle), [mapTitle]);
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const activeGroup = findGroupForPath(location.pathname);

  const [expanded, setExpanded] = React.useState<Record<NavGroupId, boolean>>(() => ({
    field: activeGroup?.id === 'field',
    crop: activeGroup?.id === 'crop',
    records: activeGroup?.id === 'records',
    system: activeGroup?.id === 'system',
  }));

  // Keep the group for the current route open when navigating
  React.useEffect(() => {
    if (!activeGroup) return;
    setExpanded((prev) =>
      prev[activeGroup.id] ? prev : { ...prev, [activeGroup.id]: true }
    );
  }, [activeGroup?.id]);

  // Close drawer on route change when in overlay mode (phone/tablet)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia(NAV_DRAWER_MQ).matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const toggleGroup = (id: NavGroupId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen((open) => !open);

  return (
    <div className="h-dvh max-h-dvh overflow-hidden bg-slate-50 flex flex-col xl:flex-row">
      <BottomNav />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[5000] bg-slate-900/50 xl:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-nav-sidebar"
        className={cn(
          // Stop above the persistent BottomNav (< lg) so Sign out stays tappable.
          'fixed top-0 bottom-20 left-0 z-[5004] w-72 bg-slate-900 text-slate-300 transform transition-transform duration-200 ease-in-out lg:bottom-0 xl:translate-x-0 xl:static xl:flex-shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Main navigation"
      >
        <div className="h-full flex flex-col">
          <div className="flex items-center h-14 bg-slate-950 gap-1 pr-2">
            <NavLink
              to="/"
              onClick={closeSidebar}
              className="flex items-center flex-1 min-w-0 h-full px-3 gap-2.5 hover:bg-slate-900 transition-colors"
              title={APP_FULL_NAME}
            >
              <img
                src={APP_LOGO_SRC}
                alt=""
                className="w-7 h-7 rounded-lg object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
              <span className="text-sm font-bold text-white leading-tight whitespace-nowrap">
                {APP_NAME}
              </span>
            </NavLink>
            <button
              type="button"
              onClick={closeSidebar}
              className="xl:hidden p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 flex-shrink-0"
              aria-label="Collapse navigation menu"
            >
              <IconChevronsLeft className="h-5 w-5" stroke={1.75} />
            </button>
          </div>

          <nav className="flex-1 px-1.5 py-3 space-y-1 overflow-y-auto">
            {hasModule('dashboard') && (
            <NavLink
              to={dashboardItem.href}
              end
              onClick={closeSidebar}
              className={({ isActive }) =>
                cn(
                  'group flex items-center px-2 py-1.5 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'hover:bg-slate-800 hover:text-white'
                )
              }
            >
              <dashboardItem.icon
                className="mr-2.5 flex-shrink-0 h-5 w-5"
                stroke={1.75}
                aria-hidden="true"
              />
              {dashboardItem.name}
            </NavLink>
            )}

            <div className="pt-2 space-y-1">
              {groups.map((group) => {
                const items = visibleGroupItems(
                  group,
                  isAdmin,
                  userData?.role,
                  userData?.modules,
                  offeredModules,
                  isPlatformAdmin
                );
                if (items.length === 0) return null;

                const isOpen = expanded[group.id];
                const groupActive = items.some((item) =>
                  pathMatchesHref(location.pathname, item.href)
                );

                return (
                  <div key={group.id} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={cn(
                        'w-full flex items-center px-2 py-1.5 text-sm font-semibold rounded-md transition-colors',
                        groupActive
                          ? 'text-emerald-400 bg-slate-800/80'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      )}
                      aria-expanded={isOpen}
                    >
                      <group.icon
                        className="mr-2.5 flex-shrink-0 h-5 w-5"
                        stroke={1.75}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-left uppercase tracking-wider text-[10px]">
                        {group.name}
                      </span>
                      <IconChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform duration-200',
                          isOpen && 'rotate-180'
                        )}
                        stroke={1.75}
                      />
                    </button>

                    {isOpen && (
                      <div className="ml-2 pl-2 border-l border-slate-700 space-y-0.5">
                        {items.map((item) => (
                          <NavLink
                            key={item.href}
                            to={item.href}
                            onClick={closeSidebar}
                            className={({ isActive }) =>
                              cn(
                                'group flex items-center px-2 py-1.5 text-sm font-medium rounded-md transition-colors',
                                isActive
                                  ? item.adminOnly
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-emerald-600 text-white'
                                  : 'hover:bg-slate-800 hover:text-white'
                              )
                            }
                          >
                            <item.icon
                              className="mr-2.5 flex-shrink-0 h-5 w-5"
                              stroke={1.75}
                              aria-hidden="true"
                            />
                            {item.name}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="p-4 bg-slate-950 shrink-0">
            <div className="flex items-center mb-4">
              <img
                className="h-8 w-8 rounded-full bg-slate-800"
                src={
                  user?.photoURL ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.email || 'Workshop')}`
                }
                alt=""
                referrerPolicy="no-referrer"
              />
              <div className="ml-3 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.displayName || user?.email || 'Workshop User'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex items-center w-full px-2 py-2 text-sm font-medium text-slate-300 rounded-md hover:bg-slate-800 hover:text-white transition-colors"
            >
              <IconLogout className="mr-3 h-5 w-5" stroke={1.75} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="xl:hidden flex items-center gap-2 bg-white border-b border-slate-200 px-3 py-2">
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-2 -ml-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 flex-shrink-0"
            aria-label={sidebarOpen ? 'Collapse navigation menu' : 'Open navigation menu'}
            aria-expanded={sidebarOpen}
            aria-controls="app-nav-sidebar"
          >
            {sidebarOpen ? (
              <IconChevronsLeft className="h-6 w-6" stroke={1.75} />
            ) : (
              <IconMenu2 className="h-6 w-6" stroke={1.75} />
            )}
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={APP_LOGO_SRC}
              alt=""
              className="w-6 h-6 rounded object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
            <span className="text-base font-bold text-slate-900 truncate">{APP_NAME}</span>
          </div>
        </div>

        <main
          className={cn(
            'flex-1 focus:outline-none p-0 pb-16 lg:pb-0 min-h-0',
            location.pathname === '/map'
              ? 'overflow-hidden flex flex-col'
              : 'overflow-y-auto'
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
