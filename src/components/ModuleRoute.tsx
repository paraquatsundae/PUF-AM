import React from 'react';
import { Navigate } from 'react-router-dom';
import { effectiveModules, type FarmModuleId } from '../../shared/auth/farmModules';
import { useAuth } from '../contexts/AuthContext';
import { useOfferedFarmModules } from '../hooks/useOfferedFarmModules';
import { isWorkshopMode } from '../lib/workshopMode';

/** Blocks routes the member's module list does not include. */
export function ModuleRoute({
  moduleId,
  children,
}: {
  moduleId: FarmModuleId;
  children: React.ReactNode;
}) {
  const { userData, loading } = useAuth();
  const offered = useOfferedFarmModules();

  if (isWorkshopMode()) return <>{children}</>;
  if (loading) return null;
  const allowed = effectiveModules(userData?.role, userData?.modules, offered).includes(moduleId);
  if (!allowed) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
