import React from 'react';
import { Navigate } from 'react-router-dom';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import { useAuth } from '../contexts/AuthContext';
import { isWorkshopMode } from '../lib/workshopMode';

/** Blocks routes the member's module list does not include. */
export function ModuleRoute({
  moduleId,
  children,
}: {
  moduleId: FarmModuleId;
  children: React.ReactNode;
}) {
  const { hasModule, loading } = useAuth();

  if (isWorkshopMode()) return <>{children}</>;
  if (loading) return null;
  if (!hasModule(moduleId)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
