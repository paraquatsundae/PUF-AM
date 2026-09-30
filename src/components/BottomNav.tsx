import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IconLayoutDashboard, IconX } from '@tabler/icons-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import {
  navGroupsForMapTitle,
  navRows,
  cropSectionLabel,
  visibleGroupItems,
  isPathInGroup,
  pathMatchesHref,
  type NavGroupId,
} from '../lib/navConfig';
import { useFarmDiary } from '../lib/farmDiary';
import { useOfferedFarmModules } from '../hooks/useOfferedFarmModules';
import { mapUiCopy } from '../../shared/farm/farmTypes';

export function BottomNav() {
  const { isAdmin, isPlatformAdmin, userData, hasModule } = useAuth();
  const offeredModules = useOfferedFarmModules();
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
        offeredModules,
        isPlatformAdmin
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
                <openGroup.icon className="w-5 h-5 text-emerald-600" stroke={1.75} />
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
                <IconX className="w-5 h-5" stroke={1.75} />
              </button>
            </div>
            <div className="overflow-y-auto py-1">
              {navRows(sheetItems).map((row) => {
                if (row.kind === 'heading') {
                  return (
                    <p
                      key={row.section}
                      className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                    >
                      {cropSectionLabel(row.section)}
                    </p>
                  );
                }
                const item = row.item;
                const active = pathMatchesHref(location.pathname, item.href);
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => goTo(item.href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 min-h-12 text-left transition-colors min-w-0',
                      active
                        ? item.adminOnly
                          ? 'bg-purple-50 text-purple-800'
                          : 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" stroke={1.75} />
                    <span className="text-base font-medium min-w-0 break-words">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-0.5 py-1 z-[5002] flex items-stretch justify-around pb-safe">
        {hasModule('dashboard') && (
        <NavLink
          to="/"
          end
          onClick={closeSheet}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg transition-colors flex-1 min-w-0 max-w-[4.75rem]',
              isActive ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-900'
            )
          }
        >
          <IconLayoutDashboard className="w-6 h-6 shrink-0" stroke={1.75} />
          <span className="text-[10px] font-medium truncate w-full text-center">Home</span>
        </NavLink>
        )}

        {navGroups.map((group) => {
          const items = visibleGroupItems(
            group,
            isAdmin,
            userData?.role,
            userData?.modules,
            offeredModules,
            isPlatformAdmin
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
                'flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg transition-colors flex-1 min-w-0 max-w-[4.75rem]',
                isOpen || isActive
                  ? 'text-emerald-600'
                  : 'text-slate-500 hover:text-slate-900'
              )}
              aria-expanded={isOpen}
              aria-label={`${group.name} menu`}
            >
              <Icon className="w-6 h-6 shrink-0" stroke={1.75} />
              <span className="text-[10px] font-medium truncate w-full text-center">{group.name}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
