/**
 * Client helpers for invite-PIN authentication (no Google OAuth).
 */
import type { FarmModuleId, FarmRole } from '../../shared/auth/farmModules';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { apiUrl } from './apiBase';
import { isByoFirebase } from './byoFirebaseConfig';
import {
  createByoFarmAccount,
  createByoInvitePin,
  listByoFarmMembers,
  listByoInvitePins,
  redeemByoInvitePin,
  removeByoFarmMember,
  revokeByoInvitePin,
  updateByoFarmMember,
} from './byoFirebaseAuth';

export type PinRole = FarmRole;

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      res.ok
        ? 'Empty response from server'
        : `Auth API error (${res.status}). Keep npm run dev running and rebuild the Android app if needed.`
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.trimStart().startsWith('<!')) {
      throw new Error(
        'Auth API hit the app shell instead of the server. Keep npm run dev on, then rebuild with npm run build:android (emulator uses http://10.0.2.2:3000).'
      );
    }
    throw new Error(`Auth API returned non-JSON (${res.status}): ${text.slice(0, 160)}`);
  }
}

export type NearbyFarm = {
  farmId: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  showNearby: boolean;
};

export async function createFarmAccount(
  farmName: string,
  displayName: string,
  opts?: { lat?: number; lng?: number; showNearby?: boolean; enrollmentCode?: string }
): Promise<{
  token: string;
  farmId: string;
  role: PinRole;
  uid: string;
  modules: FarmModuleId[];
  authEpoch: number;
  recoveryPin: string;
}> {
  if (isByoFirebase()) {
    return createByoFarmAccount(farmName, displayName);
  }
  const res = await fetch(apiUrl('/api/auth/create-farm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmName,
      displayName,
      lat: opts?.lat,
      lng: opts?.lng,
      showNearby: opts?.showNearby !== false,
      // Cloud farms are gated — see server/enrollmentCodes.ts.
      enrollmentCode: opts?.enrollmentCode || '',
    }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(String(data.error || 'Failed to create farm'));
  }
  return data as {
    token: string;
    farmId: string;
    role: PinRole;
    uid: string;
    modules: FarmModuleId[];
    authEpoch: number;
    recoveryPin: string;
  };
}

export async function fetchNearbyFarms(
  lat: number,
  lng: number,
  radiusKm = 3
): Promise<NearbyFarm[]> {
  if (isByoFirebase()) return [];
  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radiusKm: String(radiusKm),
  });
  const res = await fetch(apiUrl(`/api/auth/nearby-farms?${qs}`));
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to find nearby farms'));
  return (data.farms as NearbyFarm[]) || [];
}

export async function updateFarmDiscovery(input: {
  lat?: number;
  lng?: number;
  showNearby?: boolean;
}): Promise<void> {
  if (isByoFirebase()) {
    throw new Error(
      'Nearby discovery is per Firebase project and is not offered on your own project. Share the farm ID and an invite PIN instead.'
    );
  }
  const res = await fetch(apiUrl('/api/auth/update-farm-discovery'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to update farm location'));
}

/** Owner sets which modules this farm offers (worker grants are a subset). */
export async function updateFarmModules(modules: FarmModuleId[]): Promise<FarmModuleId[]> {
  if (isByoFirebase()) {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const snap = await getDoc(doc(db, 'users', user.uid));
    const farmId = snap.data()?.farmId;
    if (typeof farmId !== 'string' || !farmId) throw new Error('No farm on this account.');
    await updateDoc(doc(db, 'farms', farmId), { enabledModules: modules });
    return modules;
  }
  const res = await fetch(apiUrl('/api/auth/update-farm-modules'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ modules }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to update farm modules'));
  return (data.enabledModules as FarmModuleId[]) || modules;
}

export async function redeemInvitePin(
  pin: string,
  displayName: string,
  expectedFarmId?: string
): Promise<{
  token: string;
  farmId: string;
  role: PinRole;
  uid: string;
  modules?: FarmModuleId[];
  authEpoch?: number;
}> {
  if (isByoFirebase()) {
    return redeemByoInvitePin(pin, displayName, expectedFarmId);
  }
  const res = await fetch(apiUrl('/api/auth/redeem-pin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, displayName, expectedFarmId }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(String(data.error || 'Failed to redeem invite PIN'));
  }
  return data as {
    token: string;
    farmId: string;
    role: PinRole;
    uid: string;
    modules?: FarmModuleId[];
    authEpoch?: number;
  };
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const idToken = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

export async function createInvitePin(input: {
  role: PinRole;
  label: string;
  modules: FarmModuleId[];
  maxUses?: number | null;
  expiresInDays?: number | null;
}): Promise<{
  code: string;
  pinId: string;
  role: PinRole;
  label: string;
  modules: FarmModuleId[];
  expiresAt: string | null;
}> {
  if (isByoFirebase()) return createByoInvitePin(input);
  const res = await fetch(apiUrl('/api/auth/create-pin'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to create PIN'));
  return data as {
    code: string;
    pinId: string;
    role: PinRole;
    label: string;
    modules: FarmModuleId[];
    expiresAt: string | null;
  };
}

export async function listInvitePins(): Promise<
  Array<{
    pinId: string;
    label: string;
    role: PinRole;
    active: boolean;
    maxUses: number | null;
    useCount: number;
    expiresAt: string | null;
    createdAt: string;
    codeHint: string | null;
    modules: FarmModuleId[];
    lastRedeemedAt: string | null;
    lastRedeemedDisplayName: string | null;
  }>
> {
  if (isByoFirebase()) return listByoInvitePins();
  const res = await fetch(apiUrl('/api/auth/pins'), { headers: await authHeaders() });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to list PINs'));
  return (data.pins as never[]) || [];
}

export async function revokeInvitePin(pinId: string): Promise<void> {
  if (isByoFirebase()) return revokeByoInvitePin(pinId);
  const res = await fetch(apiUrl('/api/auth/revoke-pin'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ pinId }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to revoke PIN'));
}

export type FarmMember = {
  uid: string;
  displayName: string;
  email: string | null;
  role: PinRole;
  farmId: string;
  modules: FarmModuleId[];
  authEpoch?: number;
  accessRevoked?: boolean;
  authMethod: string | null;
  createdAt: string | null;
};

export async function listFarmMembers(): Promise<FarmMember[]> {
  if (isByoFirebase()) return listByoFarmMembers();
  const res = await fetch(apiUrl('/api/auth/members'), { headers: await authHeaders() });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to list members'));
  return (data.members as FarmMember[]) || [];
}

export async function updateFarmMember(
  uid: string,
  input: { role?: PinRole; modules?: FarmModuleId[] }
): Promise<void> {
  if (isByoFirebase()) return updateByoFarmMember(uid, input);
  const res = await fetch(apiUrl('/api/auth/update-member'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ uid, ...input }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to update member'));
}

export async function removeFarmMember(uid: string): Promise<void> {
  if (isByoFirebase()) return removeByoFarmMember(uid);
  const res = await fetch(apiUrl('/api/auth/remove-member'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ uid }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to remove member'));
}
