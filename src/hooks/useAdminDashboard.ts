import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import type { UserData } from '../contexts/AuthContext';
import { db } from '../firebase';
import { trackMetric } from '../services/metricsService';

export type AdminAccessList = Record<string, boolean>;
export type AdminTab = 'ops' | 'users' | 'whitelist' | 'blacklist' | 'usage';

export function useAdminDashboard() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [whitelist, setWhitelist] = useState<AdminAccessList>({});
  const [blacklist, setBlacklist] = useState<AdminAccessList>({});
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('ops');
  const [globalMetrics, setGlobalMetrics] = useState<Record<string, unknown> | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<Array<Record<string, unknown> & { date: string }>>([]);
  const [userMetrics, setUserMetrics] = useState<Record<string, unknown>>({});

  useEffect(() => {
    trackMetric('read', 4).catch(console.error);

    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(
      usersQuery,
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserData));
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to users:', error);
        setLoading(false);
      }
    );

    const unsubscribeWhitelist = onSnapshot(collection(db, 'whitelist'), (snap) => {
      const whitelistMap: AdminAccessList = {};
      snap.docs.forEach((d) => {
        whitelistMap[d.id] = true;
      });
      setWhitelist(whitelistMap);
    });

    const unsubscribeBlacklist = onSnapshot(collection(db, 'blacklist'), (snap) => {
      const blacklistMap: AdminAccessList = {};
      snap.docs.forEach((d) => {
        blacklistMap[d.id] = true;
      });
      setBlacklist(blacklistMap);
    });

    const unsubscribeConfig = onSnapshot(doc(db, 'config', 'accessControl'), (snap) => {
      if (snap.exists()) {
        setWhitelistEnabled(snap.data().whitelistEnabled);
      }
    });

    const unsubscribeGlobal = onSnapshot(doc(db, 'metrics_global', 'all'), (snap) => {
      if (snap.exists()) {
        setGlobalMetrics(snap.data() as Record<string, unknown>);
      }
    });

    const dailyQuery = query(collection(db, 'metrics_daily'), orderBy('__name__', 'desc'));
    const unsubscribeDaily = onSnapshot(dailyQuery, (snap) => {
      const dailyList = snap.docs
        .map((d) => ({
          date: d.id,
          ...d.data(),
        }))
        .reverse();
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
    if (activeTab !== 'usage') return;
    let cancelled = false;
    void getDocs(collection(db, 'metrics_users'))
      .then((snap) => {
        if (cancelled) return;
        const next: Record<string, unknown> = {};
        snap.docs.forEach((d) => {
          next[d.id] = d.data();
        });
        setUserMetrics(next);
      })
      .catch((error) => {
        console.error('Error loading user metrics:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const toggleWhitelistMode = async () => {
    try {
      await setDoc(doc(db, 'config', 'accessControl'), { whitelistEnabled: !whitelistEnabled }, { merge: true });
    } catch (error) {
      console.error('Error toggling whitelist mode:', error);
    }
  };

  const addToWhitelist = async (email: string) => {
    if (!email) return;
    const lowerEmail = email.toLowerCase();
    try {
      if (blacklist[lowerEmail]) {
        await deleteDoc(doc(db, 'blacklist', lowerEmail));
      }
      await setDoc(doc(db, 'whitelist', lowerEmail), { addedAt: new Date().toISOString() });
      setNewEmail('');
    } catch (error) {
      console.error('Error adding to whitelist:', error);
    }
  };

  const removeFromWhitelist = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'whitelist', email.toLowerCase()));
    } catch (error) {
      console.error('Error removing from whitelist:', error);
    }
  };

  const addToBlacklist = async (email: string) => {
    if (!email) return;
    const lowerEmail = email.toLowerCase();
    try {
      if (whitelist[lowerEmail]) {
        await deleteDoc(doc(db, 'whitelist', lowerEmail));
      }
      await setDoc(doc(db, 'blacklist', lowerEmail), { addedAt: new Date().toISOString() });
      setNewEmail('');
    } catch (error) {
      console.error('Error adding to blacklist:', error);
    }
  };

  const removeFromBlacklist = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'blacklist', email.toLowerCase()));
    } catch (error) {
      console.error('Error removing from blacklist:', error);
    }
  };

  const deleteUser = async (uid: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this user's data? This will not delete their Google account, but they will lose all farm data."
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', uid));
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const updateUserRole = async (uid: string, newRole: 'admin' | 'farmer' | 'viewer') => {
    try {
      await setDoc(doc(db, 'users', uid), { role: newRole }, { merge: true });
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u)));
    } catch (error) {
      console.error('Error updating user role:', error);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return {
    users,
    whitelist,
    blacklist,
    whitelistEnabled,
    loading,
    searchTerm,
    setSearchTerm,
    newEmail,
    setNewEmail,
    activeTab,
    setActiveTab,
    globalMetrics,
    dailyMetrics,
    userMetrics,
    filteredUsers,
    toggleWhitelistMode,
    addToWhitelist,
    removeFromWhitelist,
    addToBlacklist,
    removeFromBlacklist,
    deleteUser,
    updateUserRole,
  };
}
