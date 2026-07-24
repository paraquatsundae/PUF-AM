import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import {
  navGroupsForMapTitle,
  visibleGroupItems,
  isPathInGroup,
  pathMatchesHref,
  type NavGroupId,
} from '../lib/navConfig';
import { useFarmDiary } from '../lib/farmDiary';
import { mapUiCopy } from '../../shared/farm/farmTypes';

export function BottomNav() {
  const { isAdmin, userData, hasModule, farmEnabledModules } = useAuth();
  const { settings } = useFarmDiary();
  const mapTitle = mapUiCopy(settings.farmProfile).mapTitle;
  const navGroups = React.useMemo(() => navGroupsForMapTitle(mapTitle), [mapTitle]);
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroupId, setOpenGroupId] = React.useState<NavGroupId | null>(null);

  const openGroup = openGroupId
    ? navGroups.find((g) => g.id === openGroupId) ?? null
    : null;

  const sheetItems = openGroup
    ? visibleGroupItems(
        openGroup,
        isAdmin,
        userData?.role,
        userData?.modules,
        farmEnabledModules
      )
    : [];

  const closeSheet = () => setOpenGroupId(null);

  const toggleGroup = (id: NavGroupId) => {
    setOpenGroupId((prev) => (prev === id ? null : id));
  };

  const goTo = (href: string) => {
    navigate(href);
    closeSheet();
  };

  return (
    <>
      {openGroup && (
        <div className="lg:hidden fixed inset-0 z-[5003]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close menu"
            onClick={closeSheet}
          />
          <div
            className="absolute bottom-16 left-0 right-0 mx-2 mb-1 rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[60vh] flex flex-col"
            role="dialog"
            aria-label={`${openGroup.name} menu`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <openGroup.icon className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  {openGroup.name}
                </span>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto py-1">
              {sheetItems.map((item) => {
                const active = pathMatchesHref(location.pathname, item.href);
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => goTo(item.href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 min-h-12 text-left transition-colors',
                      active
                        ? item.adminOnly
                          ? 'bg-purple-50 text-purple-800'
                          : 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-base font-medium">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-1 py-1 z-[5002] flex items-center justify-around pb-safe">
        {hasModule('dashboard') && (
        <NavLink
          to="/"
          end
          onClick={closeSheet}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[56px]',
              isActive ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-900'
            )
          }
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-medium">Home</span>
        </NavLink>
        )}

        {navGroups.map((group) => {
          const items = visibleGroupItems(
            group,
            isAdmin,
            userData?.role,
            userData?.modules,
            farmEnabledModules
          );
          if (items.length === 0) return null;
          const isOpen = openGroupId === group.id;
          const isActive = isPathInGroup(location.pathname, group);
          const Icon = group.icon;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[56px]',
                isOpen || isActive
                  ? 'text-emerald-600'
                  : 'text-slate-500 hover:text-slate-900'
              )}
              aria-expanded={isOpen}
              aria-label={`${group.name} menu`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{group.name}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
