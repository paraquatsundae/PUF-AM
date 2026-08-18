/**
 * Client-side farm create / invite PIN for a bring-your-own Firebase project.
 *
 * Custom tokens can only be minted by a credential that belongs to the target
 * project. Uploading their service-account key to PUFworks Cloud Run is a
 * liability, so BYO farms use email+password derived from PIN + name and write
 * `farms/{id}/join_tickets/{sha256}` that the rules let a signed-in client read.
 *
 * @see Plans/FIREBASE_BILLING.md §3.2 #1 (c)
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  defaultModulesWithoutCropPacks,
  type FarmModuleId,
  type FarmRole,
} from '../../shared/auth/farmModules';
import {
  BYO_JOIN_TICKETS,
  byoAuthCredentials,
  canRedeemJoinTicket,
  generatePinCode,
  hashPin,
  newFarmId,
  pinCodeHint,
} from '../../shared/auth/byoPin';
import { auth, db } from '../firebase';
import { BILLING_ACK_TEXT, byoProjectId, readStoredByoFirebase } from './byoFirebaseConfig';
import { signOut } from 'firebase/auth';

type PinRole = FarmRole;

export const BYO_SESSION_TOKEN = 'byo-session';

type JoinTicketDoc = {
  farmId: string;
  role: PinRole;
  label: string;
  active: boolean;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  modules: FarmModuleId[];
  codeHint: string;
  lastRedeemedAt?: string | null;
  lastRedeemedBy?: string | null;
  lastRedeemedDisplayName?: string | null;
};

async function signInByoAccount(pin: string, displayName: string): Promise<User> {
  const { email, password } = await byoAuthCredentials(pin, displayName);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') throw err;
    const created = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName.trim()) {
      await updateProfile(created.user, { displayName: displayName.trim() });
    }
    return created.user;
  }
}

function ticketRef(farmId: string, pinHash: string) {
  return doc(db, 'farms', farmId, BYO_JOIN_TICKETS, pinHash);
}

async function writeJoinTicket(
  farmId: string,
  pin: string,
  fields: Omit<JoinTicketDoc, 'codeHint' | 'createdAt' | 'useCount' | 'active'>
): Promise<string> {
  const pinHash = await hashPin(pin);
  const now = new Date().toISOString();
  const record: JoinTicketDoc = {
    ...fields,
    farmId,
    active: true,
    useCount: 0,
    createdAt: now,
    codeHint: pinCodeHint(pin),
  };
  await setDoc(ticketRef(farmId, pinHash), record);
  return pinHash;
}

export async function createByoFarmAccount(
  farmName: string,
  displayName: string
): Promise<{
  token: string;
  farmId: string;
  role: PinRole;
  uid: string;
  modules: FarmModuleId[];
  authEpoch: number;
  recoveryPin: string;
}> {
  const name = farmName.trim();
  const person = displayName.trim();
  if (name.length < 2) throw new Error('Enter a farm name (at least 2 characters).');
  if (person.length < 2) throw new Error('Enter your name (at least 2 characters).');

  const recoveryPin = generatePinCode(8);
  const user = await signInByoAccount(recoveryPin, person);
  const uid = user.uid;
  const farmId = newFarmId();
  const modules = defaultModulesWithoutCropPacks();
  const now = new Date().toISOString();
  const stored = readStoredByoFirebase();

  await setDoc(doc(db, 'farms', farmId), {
    id: farmId,
    name: name.slice(0, 120),
    ownerUid: uid,
    createdAt: now,
    enabledModules: modules,
    cloudKind: 'byo',
    firebaseProjectId: byoProjectId(),
    billingAckText: stored?.billingAck.text ?? BILLING_ACK_TEXT,
    billingAckAt: stored?.billingAck.at ?? now,
  });

  await setDoc(
    doc(db, 'farms', farmId, 'settings', 'farm'),
    {
      irrigationSystemType: 'micro',
      farmName: name.slice(0, 120),
      farmProfile: {
        enterprises: [],
        livestockEnabled: false,
        defaultSpeciesId: '',
      },
    },
    { merge: true }
  );

  await setDoc(doc(db, 'users', uid), {
    uid,
    email: user.email,
    displayName: person,
    role: 'admin',
    farmId,
    modules,
    authEpoch: 1,
    accessRevoked: false,
    subscriptionTier: 'free',
    hasAgreedToTerms: true,
    agreedToTermsAt: now,
    createdAt: now,
    authMethod: 'byo_pin',
  });

  await setDoc(doc(db, 'users_public', uid), {
    uid,
    displayName: person,
    role: 'admin',
    farmId,
  });

  await writeJoinTicket(farmId, recoveryPin, {
    farmId,
    role: 'admin',
    label: 'Owner recovery',
    maxUses: null,
    expiresAt: null,
    createdBy: uid,
    modules,
  });

  return {
    token: BYO_SESSION_TOKEN,
    farmId,
    role: 'admin',
    uid,
    modules,
    authEpoch: 1,
    recoveryPin,
  };
}

export async function redeemByoInvitePin(
  pin: string,
  displayName: string,
  expectedFarmId?: string
): Promise<{
  token: string;
  farmId: string;
  role: PinRole;
  uid: string;
  modules: FarmModuleId[];
  authEpoch: number;
}> {
  const farmId = expectedFarmId?.trim();
  if (!farmId) {
    throw new Error('Enter the farm ID from whoever set up this Firebase project.');
  }
  const person = displayName.trim();
  if (person.length < 2) throw new Error('Enter your name (at least 2 characters).');

  const pinHash = await hashPin(pin);
  // Ticket get is allowed without auth so a typo does not create an orphan account.
  const snap = await getDoc(ticketRef(farmId, pinHash));
  if (!snap.exists()) {
    throw new Error('That PIN is not for this farm. Check the farm ID and the code.');
  }
  const ticket = snap.data() as JoinTicketDoc;
  const allowed = canRedeemJoinTicket(ticket);
  if (!allowed.ok) {
    throw new Error(allowed.reason);
  }

  const user = await signInByoAccount(pin, person);
  const uid = user.uid;
  const now = new Date().toISOString();
  const modules = ticket.role === 'admin' ? defaultModulesWithoutCropPacks() : ticket.modules || [];

  const existing = await getDoc(doc(db, 'users', uid));
  if (!existing.exists()) {
    await setDoc(doc(db, 'users', uid), {
      uid,
      email: user.email,
      displayName: person,
      role: ticket.role,
      farmId,
      modules,
      authEpoch: 1,
      accessRevoked: false,
      subscriptionTier: 'free',
      hasAgreedToTerms: true,
      agreedToTermsAt: now,
      createdAt: now,
      authMethod: 'byo_pin',
    });
    await setDoc(doc(db, 'users_public', uid), {
      uid,
      displayName: person,
      role: ticket.role,
      farmId,
    });
  } else {
    const data = existing.data();
    if (data.accessRevoked) {
      await signOut(auth);
      throw new Error('Access to this farm has been removed.');
    }
    if (data.farmId && data.farmId !== farmId) {
      await signOut(auth);
      throw new Error('This name + PIN belongs to a different farm on this project.');
    }
  }

  await updateDoc(ticketRef(farmId, pinHash), {
    useCount: (ticket.useCount || 0) + 1,
    lastRedeemedAt: now,
    lastRedeemedBy: uid,
    lastRedeemedDisplayName: person,
  });

  return {
    token: BYO_SESSION_TOKEN,
    farmId,
    role: ticket.role,
    uid,
    modules,
    authEpoch: 1,
  };
}

async function callerFarmId(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const snap = await getDoc(doc(db, 'users', user.uid));
  const farmId = snap.data()?.farmId;
  if (typeof farmId !== 'string' || !farmId) throw new Error('No farm on this account.');
  return farmId;
}

export async function createByoInvitePin(input: {
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
  const farmId = await callerFarmId();
  const user = auth.currentUser!;
  const code = generatePinCode(8);
  const expiresAt =
    input.expiresInDays != null
      ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
      : null;
  const pinId = await writeJoinTicket(farmId, code, {
    farmId,
    role: input.role,
    label: input.label,
    maxUses: input.maxUses ?? null,
    expiresAt,
    createdBy: user.uid,
    modules: input.modules,
  });
  return {
    code,
    pinId,
    role: input.role,
    label: input.label,
    modules: input.modules,
    expiresAt,
  };
}

export async function listByoInvitePins(): Promise<
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
  const farmId = await callerFarmId();
  const snaps = await getDocs(collection(db, 'farms', farmId, BYO_JOIN_TICKETS));
  return snaps.docs.map((d) => {
    const data = d.data() as JoinTicketDoc;
    return {
      pinId: d.id,
      label: data.label,
      role: data.role,
      active: data.active,
      maxUses: data.maxUses,
      useCount: data.useCount,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
      codeHint: data.codeHint ?? null,
      modules: data.modules || [],
      lastRedeemedAt: data.lastRedeemedAt ?? null,
      lastRedeemedDisplayName: data.lastRedeemedDisplayName ?? null,
    };
  });
}

export async function revokeByoInvitePin(pinId: string): Promise<void> {
  const farmId = await callerFarmId();
  await updateDoc(ticketRef(farmId, pinId), { active: false });
}

export async function listByoFarmMembers(): Promise<
  Array<{
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
  }>
> {
  const farmId = await callerFarmId();
  const snaps = await getDocs(query(collection(db, 'users'), where('farmId', '==', farmId)));
  return snaps.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      displayName: String(data.displayName || ''),
      email: typeof data.email === 'string' ? data.email : null,
      role: data.role as PinRole,
      farmId,
      modules: (data.modules as FarmModuleId[]) || [],
      authEpoch: typeof data.authEpoch === 'number' ? data.authEpoch : undefined,
      accessRevoked: Boolean(data.accessRevoked),
      authMethod: typeof data.authMethod === 'string' ? data.authMethod : null,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : null,
    };
  });
}

export async function updateByoFarmMember(
  uid: string,
  input: { role?: PinRole; modules?: FarmModuleId[] }
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.role) patch.role = input.role;
  if (input.modules) patch.modules = input.modules;
  await updateDoc(doc(db, 'users', uid), patch);
  if (input.role) await updateDoc(doc(db, 'users_public', uid), { role: input.role });
}

export async function removeByoFarmMember(uid: string): Promise<void> {
  const farmId = await callerFarmId();
  await updateDoc(doc(db, 'users', uid), {
    farmId: null,
    accessRevoked: true,
    revokedFromFarmId: farmId,
    revokedAt: new Date().toISOString(),
  });
}
