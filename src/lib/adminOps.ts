import { getAuth } from 'firebase/auth';

import { apiUrl } from './apiBase';

export type AdminOpsFarm = {
  farmId: string;
  name: string;
  ownerUid: string | null;
  createdAt: string | null;
  enabledModules: string[];
};

export type AdminOpsPin = {
  pinId: string;
  farmId: string;
  label: string;
  role: string;
  active: boolean;
  useCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string | null;
  codeHint: string | null;
  lastRedeemedAt: string | null;
  lastRedeemedDisplayName: string | null;
};

export type AdminOpsEnrollmentUse = {
  hashPrefix: string;
  farmId: string | null;
  farmName: string | null;
  reservedAt: string | null;
  usedAt: string | null;
};

export type AdminOpsSnapshot = {
  farms: AdminOpsFarm[];
  pins: AdminOpsPin[];
  enrollment: {
    configuredCount: number;
    unusedCount: number;
    uses: AdminOpsEnrollmentUse[];
  };
};

export async function fetchAdminOpsSnapshot(): Promise<AdminOpsSnapshot> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Sign in as platform admin to load ops.');
  const token = await user.getIdToken();
  const res = await fetch(apiUrl('/api/admin/ops'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<AdminOpsSnapshot>;
  if (!res.ok) {
    throw new Error(body.error || `Ops snapshot failed (${res.status})`);
  }
  return {
    farms: body.farms ?? [],
    pins: body.pins ?? [],
    enrollment: body.enrollment ?? { configuredCount: 0, unusedCount: 0, uses: [] },
  };
}
