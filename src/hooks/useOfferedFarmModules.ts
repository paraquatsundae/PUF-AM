/**
 * Farm module catalog plus pack modules that should already be visible.
 *
 * New packs (e.g. chill) are not in stored `enabledModules` until migrate
 * writes. Dashboard / nav still need the route under Crop immediately.
 */
import { useMemo } from 'react';
import { FARM_MODULE_IDS, type FarmModuleId } from '../../shared/auth/farmModules';
import { useAuth } from '../contexts/AuthContext';
import { useChillPack } from './useChillPack';
import { useWalnutPack } from './useWalnutPack';

export function useOfferedFarmModules(): FarmModuleId[] {
  const { farmEnabledModules } = useAuth();
  const showChill = useChillPack();
  const showWalnut = useWalnutPack();

  return useMemo(() => {
    const extra: FarmModuleId[] = [];
    if (showChill) extra.push('chill');
    if (showWalnut) extra.push('blight');
    if (extra.length === 0) return farmEnabledModules;
    const set = new Set<FarmModuleId>([...farmEnabledModules, ...extra]);
    return FARM_MODULE_IDS.filter((id) => set.has(id));
  }, [farmEnabledModules, showChill, showWalnut]);
}
