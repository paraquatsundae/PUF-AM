/**
 * Platform-admin removal of a directory user.
 *
 * The User Directory used to `deleteDoc` the profile from the browser. That
 * left the Firebase Auth session alive. This disables the account, revokes
 * refresh tokens, and stamps `accessRevoked` so an open app signs out and
 * API calls stop honouring the old ID token.
 */
import { getAdminAuth, getAdminDb } from './firebaseAdmin.ts';
import { existingClaimsFor } from './accessPinAuth.ts';

function missingAuthUser(error: unknown): boolean {
  return (error as { code?: string })?.code === 'auth/user-not-found';
}

export async function removeDirectoryUser(uid: string): Promise<void> {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  const priorEpoch =
    typeof snap.data()?.authEpoch === 'number' ? snap.data()!.authEpoch : 0;
  const authEpoch = priorEpoch + 1;
  const now = new Date().toISOString();

  if (snap.exists) {
    await userRef.set(
      {
        farmId: null,
        role: 'viewer',
        modules: [],
        accessRevoked: true,
        authEpoch,
        revokedAt: now,
      },
      { merge: true }
    );
  }

  await db.collection('users_public').doc(uid).delete().catch(() => undefined);

  const existing = await existingClaimsFor(uid);
  await auth
    .setCustomUserClaims(uid, {
      pinAuth: existing.pinAuth === true,
      admin: false,
      platformAdmin: false,
      farmId: null,
      role: 'viewer',
      modules: [],
      authEpoch,
      accessRevoked: true,
    })
    .catch((error: unknown) => {
      if (!missingAuthUser(error)) throw error;
    });

  await auth.revokeRefreshTokens(uid).catch((error: unknown) => {
    if (!missingAuthUser(error)) throw error;
  });

  await auth.updateUser(uid, { disabled: true }).catch((error: unknown) => {
    if (!missingAuthUser(error)) throw error;
  });
}
