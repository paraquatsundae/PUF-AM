import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  Mail, 
  UserPlus, 
  Settings, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Trash2, 
  Edit2,
  Database,
  RefreshCw,
  CloudRain,
  Key,
  Link as LinkIcon,
  Cpu,
  Activity,
  Save,
  Clock,
  ShieldCheck,
  Building2,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, UserData } from '../contexts/AuthContext';
import { mapApi } from '../services/api';
import { SafetyManagement } from '../components/SafetyManagement';
import { clsx } from 'clsx';

export function FarmManagement() {
  const { userData, user } = useAuth();
  const farmId = userData?.farmId;
  const isAdmin = userData?.role === 'admin';
  
  const [activeTab, setActiveTab] = useState<'team' | 'integrations' | 'settings' | 'safety'>('team');

  // --- Organization State ---
  const [farm, setFarm] = useState<any>(null);
  const [members, setMembers] = useState<UserData[]>([]);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [editName, setEditName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'farmer' | 'viewer'>('farmer');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Load Organization Data
  useEffect(() => {
    if (!farmId) return;
    const loadOrgData = async () => {
      setIsLoadingOrg(true);
      try {
        const [farmData, membersData] = await Promise.all([
          mapApi.getFarm(farmId),
          mapApi.getMembers(farmId)
        ]);
        setFarm(farmData);
        setMembers(membersData);
        setEditName(farmData?.name || '');
      } catch (error) {
        console.error("Failed to load organization data:", error);
      } finally {
        setIsLoadingOrg(false);
      }
    };
    loadOrgData();
  }, [farmId]);

  // --- Handlers ---
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
      console.error("Failed to update farm name:", error);
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmId || !inviteEmail.trim() || !user?.email) return;
    setIsInviting(true);
    setInviteStatus(null);
    try {
      await mapApi.createInvitation(inviteEmail.trim(), farmId, inviteRole, user.email);
      setInviteStatus({ type: 'success', message: `Invitation sent to ${inviteEmail}` });
      setInviteEmail('');
    } catch (error) {
      setInviteStatus({ type: 'error', message: 'Failed to send invitation.' });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (targetUid: string) => {
    if (!window.confirm("Remove this member from the organization? They will be reverted to their own private farm ID.")) return;
    setIsUpdating(targetUid);
    try {
      await mapApi.removeMember(targetUid);
      setMembers(prev => prev.filter(m => m.uid !== targetUid));
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert("Failed to remove member. Check console for details.");
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateRole = async (targetUid: string, newRole: 'admin' | 'farmer' | 'viewer') => {
    setIsUpdating(targetUid);
    try {
      await mapApi.updateMemberRole(targetUid, newRole);
      setMembers(prev => prev.map(m => m.uid === targetUid ? { ...m, role: newRole } : m));
    } catch (error) {
      console.error("Failed to update role:", error);
      alert("Failed to update role.");
    } finally {
      setIsUpdating(null);
    }
  };

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
                <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Team Members</h2>
                  </div>
                  <span className="px-4 py-1.5 bg-slate-50 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-100">{members.length} Members</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <div key={member.uid} className="p-10 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 rounded-[20px] bg-slate-100 overflow-hidden border-2 border-white shadow-sm">
                          {member.photoURL ? (
                            <img src={member.photoURL} alt={member.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <Users className="w-7 h-7" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{member.displayName || 'Anonymous User'}</p>
                          <p className="text-sm text-slate-400 font-medium">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        {isAdmin && member.uid !== userData?.uid ? (
                          <div className="flex items-center gap-3">
                            <select
                              value={member.role}
                              onChange={(e) => handleUpdateRole(member.uid, e.target.value as any)}
                              disabled={isUpdating === member.uid}
                              className={clsx(
                                "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border outline-none cursor-pointer disabled:opacity-50",
                                member.role === 'admin' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-slate-50 text-slate-500 border-slate-100"
                              )}
                            >
                              <option value="admin">Admin</option>
                              <option value="farmer">Farmer</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button 
                              onClick={() => handleRemoveMember(member.uid)}
                              disabled={isUpdating === member.uid}
                              className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all disabled:opacity-50"
                            >
                              {isUpdating === member.uid ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                            </button>
                          </div>
                        ) : (
                          <span className={clsx(
                            "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                            member.role === 'admin' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-slate-50 text-slate-500 border-slate-100"
                          )}>
                            {member.role}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-8">
              {isAdmin && (
                <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-10 opacity-10">
                    <UserPlus className="w-32 h-32" />
                  </div>
                  <div className="relative z-10">
                    <div className="bg-amber-500 w-14 h-14 rounded-[20px] flex items-center justify-center mb-8 shadow-lg shadow-amber-500/20">
                      <UserPlus className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3 tracking-tight">Invite Team</h3>
                    <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium">Add collaborators to your farm organization with specific access levels.</p>
                    
                    <form onSubmit={handleSendInvite} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email Address</label>
                        <input 
                          type="email" 
                          value={inviteEmail} 
                          onChange={(e) => setInviteEmail(e.target.value)} 
                          placeholder="colleague@example.com" 
                          className="w-full bg-white/5 border border-white/10 rounded-[20px] px-6 py-4 text-sm outline-none focus:border-amber-500 transition-all font-medium"
                          required 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Access Role</label>
                        <select 
                          value={inviteRole} 
                          onChange={(e) => setInviteRole(e.target.value as any)} 
                          className="w-full bg-white/5 border border-white/10 rounded-[20px] px-6 py-4 text-sm outline-none focus:border-amber-500 appearance-none font-medium"
                        >
                          <option value="farmer" className="bg-slate-900">Farmer (Edit Access)</option>
                          <option value="viewer" className="bg-slate-900">Viewer (Read Only)</option>
                        </select>
                      </div>

                      {inviteStatus && (
                        <div className={clsx(
                          "p-4 rounded-[20px] text-xs font-bold flex items-center gap-3",
                          inviteStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}>
                          <AlertCircle className="w-4 h-4" />
                          {inviteStatus.message}
                        </div>
                      )}

                      <button 
                        type="submit" 
                        disabled={isInviting || !inviteEmail} 
                        className="w-full py-5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-[20px] font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-500/10 active:scale-95 flex items-center justify-center gap-3"
                      >
                        {isInviting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                        Send Invitation
                      </button>
                    </form>
                  </div>
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
