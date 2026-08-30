import { useCallback, useEffect, useState } from 'react';
import { mapApi } from '../services/api';
import {
  listFarmMembers,
  removeFarmMember,
  updateFarmMember,
  type FarmMember,
  type PinRole,
} from '../lib/invitePinAuth';
import type { FarmModuleId } from '../../shared/auth/farmModules';

/** Team + farm name for Farm Management. One job: load and mutate org members. */
export function useFarmManagementOrg(
  farmId: string | undefined,
  isAdmin: boolean,
  farmEnabledModules: FarmModuleId[]
) {
  const [farm, setFarm] = useState<any>(null);
  const [members, setMembers] = useState<FarmMember[]>([]);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [editName, setEditName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!farmId) return;
    try {
      if (isAdmin) {
        setMembers(await listFarmMembers());
      } else {
        const publicMembers = await mapApi.getMembers(farmId);
        setMembers(
          publicMembers.map((m: any) => ({
            uid: m.uid,
            displayName: m.displayName || 'User',
            email: m.email || null,
            role: (m.role || 'farmer') as PinRole,
            farmId: m.farmId || farmId,
            modules: (m.modules || []) as FarmModuleId[],
            authMethod: m.authMethod || null,
            createdAt: m.createdAt || null,
          }))
        );
      }
      setTeamError(null);
    } catch (error) {
      console.error('Failed to load members:', error);
      setTeamError(error instanceof Error ? error.message : 'Failed to load members');
    }
  }, [farmId, isAdmin]);

  useEffect(() => {
    if (!farmId) return;
    const loadOrgData = async () => {
      setIsLoadingOrg(true);
      try {
        const farmData = await mapApi.getFarm(farmId);
        setFarm(farmData);
        setEditName(farmData?.name || '');
        await loadMembers();
      } catch (error) {
        console.error('Failed to load organization data:', error);
      } finally {
        setIsLoadingOrg(false);
      }
    };
    void loadOrgData();
  }, [farmId, loadMembers]);

  const handleCopyId = () => {
    if (!farmId) return;
    navigator.clipboard.writeText(farmId);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleUpdateName = async () => {
    if (!farmId || !editName.trim()) return;
    setIsSavingOrg(true);
    try {
      await mapApi.updateFarm(farmId, { name: editName.trim() });
      setFarm((prev: any) => ({ ...prev, name: editName.trim() }));
      setIsEditingName(false);
    } catch (error) {
      console.error('Failed to update farm name:', error);
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleRemoveMember = async (targetUid: string) => {
    if (
      !window.confirm(
        'Remove access for this person? Their session will end and they cannot return until you mint a new invite PIN.'
      )
    ) {
      return;
    }
    setIsUpdating(targetUid);
    try {
      await removeFarmMember(targetUid);
      setMembers((prev) => prev.filter((m) => m.uid !== targetUid));
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert(error instanceof Error ? error.message : 'Failed to remove member.');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateRole = async (targetUid: string, newRole: PinRole) => {
    setIsUpdating(targetUid);
    try {
      await updateFarmMember(targetUid, { role: newRole });
      setMembers((prev) =>
        prev.map((m) =>
          m.uid === targetUid
            ? {
                ...m,
                role: newRole,
                modules: newRole === 'admin' ? [...farmEnabledModules] : m.modules,
              }
            : m
        )
      );
    } catch (error) {
      console.error('Failed to update role:', error);
      alert(error instanceof Error ? error.message : 'Failed to update role.');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleToggleMemberModule = async (member: FarmMember, moduleId: FarmModuleId) => {
    if (member.role === 'admin') return;
    const has = member.modules?.includes(moduleId);
    const next = has
      ? (member.modules || []).filter((m) => m !== moduleId)
      : [...(member.modules || []), moduleId];
    if (next.length === 0) {
      alert('Keep at least one module, or remove their access instead.');
      return;
    }
    setIsUpdating(member.uid);
    try {
      await updateFarmMember(member.uid, { modules: next });
      setMembers((prev) =>
        prev.map((m) => (m.uid === member.uid ? { ...m, modules: next } : m))
      );
    } catch (error) {
      console.error('Failed to update modules:', error);
      alert(error instanceof Error ? error.message : 'Failed to update modules.');
    } finally {
      setIsUpdating(null);
    }
  };

  return {
    farm,
    members,
    isLoadingOrg,
    isSavingOrg,
    copySuccess,
    editName,
    setEditName,
    isEditingName,
    setIsEditingName,
    isUpdating,
    teamError,
    loadMembers,
    handleCopyId,
    handleUpdateName,
    handleRemoveMember,
    handleUpdateRole,
    handleToggleMemberModule,
  };
}
