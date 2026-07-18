import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Menu, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  dashboardItem,
  navGroups,
  visibleGroupItems,
  pathMatchesHref,
  findGroupForPath,
  type NavGroupId,
} from '../lib/navConfig';
import { BottomNav } from './BottomNav';

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
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

  const toggleGroup = (id: NavGroupId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="h-dvh max-h-dvh overflow-hidden bg-slate-50 flex flex-col lg:flex-row">
      <BottomNav />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[5000] bg-slate-900/50 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-[5001] w-52 bg-slate-900 text-slate-300 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:flex-shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-full flex flex-col">
          <NavLink
            to="/"
            onClick={closeSidebar}
            className="flex items-center justify-center h-14 px-3 bg-slate-950 gap-2.5 hover:bg-slate-900 transition-colors"
            title="PUF Orchard Manager"
          >
            <img
              src="/logo.png"
              alt="PUF"
              className="w-7 h-7 rounded-lg object-cover shrink-0"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-lg font-bold text-white">PUF</span>
              <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider truncate">Orchard Manager</span>
            </div>
          </NavLink>

          <nav className="flex-1 px-1.5 py-3 space-y-1 overflow-y-auto">
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
              <dashboardItem.icon className="mr-2.5 flex-shrink-0 h-4 w-4" aria-hidden="true" />
              {dashboardItem.name}
            </NavLink>

            <div className="pt-2 space-y-1">
              {navGroups.map((group) => {
                const items = visibleGroupItems(group, isAdmin);
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
                      <group.icon className="mr-2.5 flex-shrink-0 h-4 w-4" aria-hidden="true" />
                      <span className="flex-1 text-left uppercase tracking-wider text-[10px]">
                        {group.name}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform duration-200',
                          isOpen && 'rotate-180'
                        )}
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
                              className="mr-2.5 flex-shrink-0 h-4 w-4"
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

          <div className="p-4 bg-slate-950">
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
              <div className="ml-3">
                <p className="text-sm font-medium text-white truncate w-40">
                  {user?.displayName || user?.email || 'Workshop User'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex items-center w-full px-2 py-2 text-sm font-medium text-slate-300 rounded-md hover:bg-slate-800 hover:text-white transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="lg:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="PUF"
              className="w-6 h-6 rounded object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-lg font-bold text-slate-900 truncate">PUF</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 flex-shrink-0"
          >
            <Menu className="h-6 w-6" />
          </button>
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
