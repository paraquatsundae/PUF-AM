import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  setDoc, 
  getDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import { 
  Shield, 
  Users, 
  UserMinus, 
  Ban, 
  CheckCircle, 
  Search, 
  Mail, 
  Calendar,
  Lock,
  Unlock,
  Trash2,
  Plus,
  X,
  Loader2,
  AlertCircle,
  BarChart3,
  TrendingUp,
  DollarSign,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { calculateEstimatedCost, COST_ESTIMATES, trackMetric } from '../services/metricsService';

interface AccessList {
  [email: string]: boolean;
}

export function Admin() {
  const { user, userData, isPlatformAdmin } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [whitelist, setWhitelist] = useState<AccessList>({});
  const [blacklist, setBlacklist] = useState<AccessList>({});
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'whitelist' | 'blacklist' | 'usage'>('users');
  const [globalMetrics, setGlobalMetrics] = useState<any>(null);
  const [dailyMetrics, setDailyMetrics] = useState<any[]>([]);
  const [userMetrics, setUserMetrics] = useState<Record<string, any>>({});

  useEffect(() => {
    // Track initial reads for Admin dashboard
    trackMetric('read', 4).catch(console.error); // 4 initial listeners/gets

    // Real-time Users
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snap) => {
      const usersList = snap.docs.map(doc => doc.data() as UserData);
      setUsers(usersList);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to users:", error);
      setLoading(false);
    });

    // Real-time Whitelist
    const unsubscribeWhitelist = onSnapshot(collection(db, 'whitelist'), (snap) => {
      const whitelistMap: AccessList = {};
      snap.docs.forEach(doc => { whitelistMap[doc.id] = true; });
      setWhitelist(whitelistMap);
    });

    // Real-time Blacklist
    const unsubscribeBlacklist = onSnapshot(collection(db, 'blacklist'), (snap) => {
      const blacklistMap: AccessList = {};
      snap.docs.forEach(doc => { blacklistMap[doc.id] = true; });
      setBlacklist(blacklistMap);
    });

    // Real-time Config
    const unsubscribeConfig = onSnapshot(doc(db, 'config', 'accessControl'), (snap) => {
      if (snap.exists()) {
        setWhitelistEnabled(snap.data().whitelistEnabled);
      }
    });

    // Real-time Global Metrics
    const unsubscribeGlobal = onSnapshot(doc(db, 'metrics_global', 'all'), (snap) => {
      if (snap.exists()) {
        setGlobalMetrics(snap.data());
      }
    });

    // Real-time Daily Metrics (Last 14 days)
    const dailyQuery = query(collection(db, 'metrics_daily'), orderBy('__name__', 'desc'));
    const unsubscribeDaily = onSnapshot(dailyQuery, (snap) => {
      const dailyList = snap.docs.map(doc => ({
        date: doc.id,
        ...doc.data()
      })).reverse();
      setDailyMetrics(dailyList);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeWhitelist();
      unsubscribeBlacklist();
      unsubscribeConfig();
      unsubscribeGlobal();
      unsubscribeDaily();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'usage' && users.length > 0) {
      const unsubscribes = users.map(u => 
        onSnapshot(doc(db, 'metrics_users', u.uid), (snap) => {
          if (snap.exists()) {
            setUserMetrics(prev => ({ ...prev, [u.uid]: snap.data() }));
          }
        })
      );
      return () => unsubscribes.forEach(unsub => unsub());
    }
  }, [activeTab, users]);

  const toggleWhitelistMode = async () => {
    try {
      const newValue = !whitelistEnabled;
      await setDoc(doc(db, 'config', 'accessControl'), { whitelistEnabled: newValue }, { merge: true });
    } catch (error) {
      console.error("Error toggling whitelist mode:", error);
    }
  };

  const addToWhitelist = async (email: string) => {
    if (!email) return;
    const lowerEmail = email.toLowerCase();
    try {
      // If blacklisted, remove from blacklist first
      if (blacklist[lowerEmail]) {
        await deleteDoc(doc(db, 'blacklist', lowerEmail));
      }
      await setDoc(doc(db, 'whitelist', lowerEmail), { addedAt: new Date().toISOString() });
      setNewEmail('');
    } catch (error) {
      console.error("Error adding to whitelist:", error);
    }
  };

  const removeFromWhitelist = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'whitelist', email.toLowerCase()));
    } catch (error) {
      console.error("Error removing from whitelist:", error);
    }
  };

  const addToBlacklist = async (email: string) => {
    if (!email) return;
    const lowerEmail = email.toLowerCase();
    try {
      // If whitelisted, remove from whitelist first
      if (whitelist[lowerEmail]) {
        await deleteDoc(doc(db, 'whitelist', lowerEmail));
      }
      await setDoc(doc(db, 'blacklist', lowerEmail), { addedAt: new Date().toISOString() });
      setNewEmail('');
    } catch (error) {
      console.error("Error adding to blacklist:", error);
    }
  };

  const removeFromBlacklist = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'blacklist', email.toLowerCase()));
    } catch (error) {
      console.error("Error removing from blacklist:", error);
    }
  };

  const deleteUser = async (uid: string) => {
    if (!window.confirm("Are you sure you want to delete this user's data? This will not delete their Google account, but they will lose all farm data.")) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
      setUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const updateUserRole = async (uid: string, newRole: 'admin' | 'farmer' | 'viewer') => {
    try {
      await setDoc(doc(db, 'users', uid), { role: newRole }, { merge: true });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error("Error updating user role:", error);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );


  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
          <p className="text-slate-500 mt-2">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-600" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage users and access control</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">Whitelist Mode</span>
          <button
            onClick={toggleWhitelistMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${whitelistEnabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${whitelistEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-slate-500">Total Users</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{users.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-slate-500">Whitelisted</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{Object.keys(whitelist).length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
              <Ban className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-slate-500">Blacklisted</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{Object.keys(blacklist).length}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-4 text-sm font-bold transition-colors border-b-2 ${activeTab === 'users' ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            User Directory
          </button>
          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-6 py-4 text-sm font-bold transition-colors border-b-2 ${activeTab === 'whitelist' ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Whitelist
          </button>
          <button
            onClick={() => setActiveTab('blacklist')}
            className={`px-6 py-4 text-sm font-bold transition-colors border-b-2 ${activeTab === 'blacklist' ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Blacklist
          </button>
          <button
            onClick={() => setActiveTab('usage')}
            className={`px-6 py-4 text-sm font-bold transition-colors border-b-2 ${activeTab === 'usage' ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Usage Analytics
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'usage' && (
            <div className="space-y-8">
              {/* Usage KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Weather</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{globalMetrics?.totalWeatherCalls || 0}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Est. Cost: ${((globalMetrics?.totalWeatherCalls || 0) * COST_ESTIMATES.weather).toFixed(4)}</p>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                      <Activity className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Firestore Ops</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {(globalMetrics?.totalFirestoreReads || 0) + (globalMetrics?.totalFirestoreWrites || 0)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    R: {globalMetrics?.totalFirestoreReads || 0} | W: {globalMetrics?.totalFirestoreWrites || 0}
                  </p>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Est. Cost</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">
                    ${calculateEstimatedCost(globalMetrics || {}).total.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Combined API & DB</p>
                </div>
              </div>

              {/* Usage Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Daily Usage Trend
                </h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyMetrics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          borderRadius: '12px', 
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Bar dataKey="totalWeatherCalls" name="Weather" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* User Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600" />
                    Usage by User (Lifetime)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Weather</th>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Firestore Ops</th>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.map(u => {
                        const metrics = userMetrics[u.uid] || {};
                        const costs = calculateEstimatedCost(metrics);
                        return (
                          <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <img src={u.photoURL || `https://ui-avatars.com/api/?name=${u.email}`} className="w-8 h-8 rounded-full" alt="" />
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{u.displayName}</p>
                                  <p className="text-[10px] text-slate-500">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-slate-600">{metrics.totalWeatherCalls || 0}</td>
                            <td className="px-6 py-4 text-center text-sm text-slate-600">
                              {(metrics.totalFirestoreReads || 0) + (metrics.totalFirestoreWrites || 0)}
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-bold text-slate-900">${costs.total.toFixed(4)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-4 font-bold text-xs text-slate-400 uppercase tracking-widest">User</th>
                      <th className="pb-4 font-bold text-xs text-slate-400 uppercase tracking-widest">Role</th>
                      <th className="pb-4 font-bold text-xs text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="pb-4 font-bold text-xs text-slate-400 uppercase tracking-widest">Joined</th>
                      <th className="pb-4 font-bold text-xs text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center">
                          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
                          <p className="text-slate-500">Loading users...</p>
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          No users found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => {
                        const isWhitelisted = !!whitelist[user.email.toLowerCase()];
                        const isBlacklisted = !!blacklist[user.email.toLowerCase()];

                        return (
                          <tr key={user.uid} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`}
                                  className="w-10 h-10 rounded-full bg-slate-100"
                                  alt=""
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <p className="font-bold text-slate-900">{user.displayName || 'Unnamed User'}</p>
                                  <p className="text-xs text-slate-500">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <select
                                value={user.role}
                                onChange={(e) => updateUserRole(user.uid, e.target.value as any)}
                                disabled={user.uid === userData?.uid}
                                className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest outline-none border-none cursor-pointer transition-colors ${
                                  user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                  user.role === 'farmer' ? 'bg-emerald-100 text-emerald-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}
                              >
                                <option value="admin">Admin</option>
                                <option value="farmer">Farmer</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-2">
                                {isWhitelisted && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider">
                                    <CheckCircle className="w-3 h-3" /> Whitelisted
                                  </span>
                                )}
                                {isBlacklisted && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 uppercase tracking-wider">
                                    <Ban className="w-3 h-3" /> Blacklisted
                                  </span>
                                )}
                                {!isWhitelisted && !isBlacklisted && (
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Standard</span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 text-sm text-slate-500">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => isWhitelisted ? removeFromWhitelist(user.email.toLowerCase()) : addToWhitelist(user.email)}
                                  className={`p-2 rounded-lg transition-all ${isWhitelisted ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                  title={isWhitelisted ? "Remove from Whitelist" : "Add to Whitelist"}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => isBlacklisted ? removeFromBlacklist(user.email.toLowerCase()) : addToBlacklist(user.email)}
                                  className={`p-2 rounded-lg transition-all ${isBlacklisted ? 'text-rose-600 bg-rose-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                                  title={isBlacklisted ? "Remove from Blacklist" : "Add to Blacklist"}
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteUser(user.uid)}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Delete Data"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(activeTab === 'whitelist' || activeTab === 'blacklist') && (
            <div className="space-y-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="Enter email address..."
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <button
                  onClick={() => activeTab === 'whitelist' ? addToWhitelist(newEmail) : addToBlacklist(newEmail)}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add to {activeTab === 'whitelist' ? 'Whitelist' : 'Blacklist'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys((activeTab === 'whitelist' ? whitelist : blacklist) || {}).map((email) => (
                  <div key={email} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl group">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${activeTab === 'whitelist' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {activeTab === 'whitelist' ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{email}</span>
                    </div>
                    <button
                      onClick={() => activeTab === 'whitelist' ? removeFromWhitelist(email) : removeFromBlacklist(email)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Object.keys((activeTab === 'whitelist' ? whitelist : blacklist) || {}).length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-100 rounded-2xl">
                    No emails in the {activeTab}.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
