import React, { useState } from 'react';
import { 
  Users, 
  Copy, 
  CheckCircle2, 
  Loader2, 
  Trash2, 
  Edit2,
  Database,
  ShieldCheck,
  Building2,
  Settings2,
  KeyRound,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { SafetyManagement } from '../components/SafetyManagement';
import { InvitePinManager } from '../components/InvitePinManager';
import { FarmDiscoveryCard } from '../components/FarmDiscoveryCard';
import { FarmModulesCard } from '../components/FarmModulesCard';
import { useFarmManagementOrg } from '../hooks/useFarmManagementOrg';
import { type FarmMember, type PinRole } from '../lib/invitePinAuth';
import { MODULE_LABELS } from '../../shared/auth/farmModules';
import { clsx } from 'clsx';

function memberSubtitle(member: FarmMember): string {
  if (member.authMethod === 'invite_pin' || member.email?.endsWith('@sentinut.local')) {
    return 'Invite PIN account';
  }
  return member.email || 'Account';
}

export function FarmManagement() {
  const { userData, farmEnabledModules } = useAuth();
  const farmId = userData?.farmId;
  const isAdmin = userData?.role === 'admin';
  
  const [activeTab, setActiveTab] = useState<'team' | 'integrations' | 'settings' | 'safety'>('team');
  const {
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
  } = useFarmManagementOrg(farmId, isAdmin, farmEnabledModules);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-10">
      {/* Header */}
      <div className="bg-white p-8 sm:p-10 rounded-[40px] shadow-sm border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 hidden sm:block">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Organization:</span>
            <span className="text-amber-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Verified
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div className="bg-amber-500 p-4 rounded-[24px] text-white shadow-lg shadow-amber-200">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                {isEditingName ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-3xl font-bold text-slate-900 border-b-2 border-amber-500 outline-none bg-transparent py-1"
                      autoFocus
                    />
                    <button onClick={handleUpdateName} disabled={isSavingOrg} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all">
                      <CheckCircle2 className="w-7 h-7" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{farm?.name || 'My Farm'}</h1>
                    <span className="sm:hidden text-amber-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Verified
                    </span>
                    {isAdmin && (
                      <button onClick={() => setIsEditingName(true)} className="p-2 text-slate-300 hover:text-amber-600 transition-colors">
                        <Edit2 className="w-5 h-5" />
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="text-slate-500 font-medium">Manage your farm organization, team, and data integrations.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 bg-slate-50 px-6 py-3 rounded-[24px] border border-slate-100">
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Farm ID</p>
                <p className="text-xs font-mono text-slate-600 font-bold">{farmId}</p>
              </div>
              <button onClick={handleCopyId} className="p-2.5 text-slate-400 hover:text-amber-600 transition-all">
                {copySuccess ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-12 p-1.5 bg-slate-50 rounded-[28px] w-fit border border-slate-100 max-w-full overflow-x-auto no-scrollbar">
          {[ 
            { id: 'team', label: 'Team & Access', icon: Users },
            { id: 'integrations', label: 'Data Integrations', icon: Database },
            { id: 'settings', label: 'Farm Settings', icon: Settings2 },
            { id: 'safety', label: 'Safety', icon: ShieldCheck }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                "flex items-center gap-2 px-8 py-3 rounded-[22px] text-xs font-black uppercase tracking-widest transition-all",
                activeTab === tab.id 
                  ? "bg-white text-amber-600 shadow-sm border border-slate-200/50" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'team' && (
          <motion.div 
            key="team"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10"
          >
            <div className="lg:col-span-8 space-y-8">
              <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-white gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Team Members</h2>
                  </div>
                  <span className="px-4 py-1.5 bg-slate-50 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-100 shrink-0">
                    {isLoadingOrg ? '…' : `${members.length} Members`}
                  </span>
                </div>
                {teamError && (
                  <div className="px-10 py-4 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{teamError}</div>
                )}
                <div className="divide-y divide-slate-100">
                  {!isLoadingOrg && members.length === 0 && (
                    <div className="p-10 text-sm text-slate-500">
                      No members yet. Create an invite PIN and have staff sign in with their name + code.
                    </div>
                  )}
                  {members.map((member) => (
                    <div
                      key={member.uid}
                      className="p-8 sm:p-10 flex flex-col gap-4 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 rounded-[20px] bg-slate-100 overflow-hidden border-2 border-white shadow-sm flex items-center justify-center text-slate-300">
                            <Users className="w-7 h-7" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-lg">
                              {member.displayName || 'Anonymous User'}
                            </p>
                            <p className="text-sm text-slate-400 font-medium">{memberSubtitle(member)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          {isAdmin && member.uid !== userData?.uid ? (
                            <div className="flex items-center gap-3">
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(member.uid, e.target.value as PinRole)}
                                disabled={isUpdating === member.uid}
                                className={clsx(
                                  'px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border outline-none cursor-pointer disabled:opacity-50',
                                  member.role === 'admin'
                                    ? 'bg-amber-50 text-amber-600 border-amber-100'
                                    : 'bg-slate-50 text-slate-500 border-slate-100'
                                )}
                              >
                                <option value="admin">Admin</option>
                                <option value="farmer">Farmer</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member.uid)}
                                disabled={isUpdating === member.uid}
                                title="Remove access"
                                className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all disabled:opacity-50"
                              >
                                {isUpdating === member.uid ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-5 h-5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span
                              className={clsx(
                                'px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border',
                                member.role === 'admin'
                                  ? 'bg-amber-50 text-amber-600 border-amber-100'
                                  : 'bg-slate-50 text-slate-500 border-slate-100'
                              )}
                            >
                              {member.role}
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin && member.uid !== userData?.uid && member.role !== 'admin' && (
                        <div className="pl-0 sm:pl-20 flex flex-wrap gap-2">
                          {farmEnabledModules.map((id) => {
                            const on = member.modules?.includes(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                disabled={isUpdating === member.uid}
                                onClick={() => void handleToggleMemberModule(member, id)}
                                className={clsx(
                                  'px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors disabled:opacity-50',
                                  on
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-white text-slate-400 border-slate-200'
                                )}
                              >
                                {MODULE_LABELS[id]}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {member.role === 'admin' && (
                        <p className="pl-0 sm:pl-20 text-[11px] text-slate-400">
                          Admins get every module enabled for this farm.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-8">
              {isAdmin ? (
                <>
                  <FarmModulesCard />
                  <FarmDiscoveryCard />
                  <InvitePinManager onCreated={() => void loadMembers()} />
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-semibold">
                    <KeyRound className="w-4 h-4 text-emerald-600" />
                    Team access
                  </div>
                  <p className="text-sm text-slate-500">
                    Ask a farm admin to create an invite PIN if you need to add another person to this farm.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'integrations' && (
          <motion.div 
            key="integrations"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-10"
          >
            <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 p-10 flex flex-col items-center justify-center text-center min-h-[400px]">
              <div className="w-20 h-20 bg-slate-50 text-slate-400 rounded-[32px] flex items-center justify-center shadow-sm border border-slate-100 mb-6">
                <Database className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">Integrations</h2>
              <p className="text-slate-500 max-w-md mx-auto font-medium leading-relaxed">
                The DPIRD weather API integration is active. Other external API integrations (BOM, FarmBot) have been removed.
              </p>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10"
          >
            <div className="lg:col-span-8 space-y-8">
              <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 p-10">
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">General Farm Settings</h2>
                </div>
                
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-8 rounded-[32px] border border-slate-100 bg-slate-50/30 group hover:border-amber-500/30 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-[20px] border border-slate-100 flex items-center justify-center shadow-sm">
                        <ShieldCheck className="w-7 h-7 text-amber-500" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-lg">Subscription Plan</p>
                        <p className="text-sm text-slate-400 font-medium">Current tier: <span className="text-amber-600 font-bold">{userData?.subscriptionTier || 'Free'}</span></p>
                      </div>
                    </div>
                    <button className="text-amber-600 font-black text-xs uppercase tracking-widest hover:bg-amber-50 px-6 py-3 rounded-[18px] transition-all border border-transparent hover:border-amber-100">Upgrade Plan</button>
                  </div>

                  <div className="flex items-center justify-between p-8 rounded-[32px] border border-slate-100 bg-slate-50/30 group hover:border-slate-300 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-[20px] border border-slate-100 flex items-center justify-center shadow-sm">
                        <Database className="w-7 h-7 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-lg">Data Governance</p>
                        <p className="text-sm text-slate-400 font-medium">Download all farm records in CSV or JSON format.</p>
                      </div>
                    </div>
                    <button className="bg-slate-900 text-white px-8 py-4 rounded-[20px] text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">Export Data</button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'safety' && farmId && (
          <motion.div 
            key="safety"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-10"
          >
            <SafetyManagement farmId={farmId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
