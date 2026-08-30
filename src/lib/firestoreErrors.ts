/**
 * Firestore error bus — keep out of AuthContext (Plans/CODEBASE_HEALTH.md).
 */
import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: { providerId: string; displayName: string | null; email: string | null; photoUrl: string | null }[];
  };
}

/** Soft-fail predicate for callers that return empty/null instead of throwing. */
export function isBenignFirestoreFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'failed-precondition' ||
    msg.includes('permission') ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('INTERNAL ASSERTION FAILED') ||
    msg.includes('the client is offline')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isBenignFirestoreFailure(error)) {
    console.warn(`[Firestore] Soft failure (${operationType}) ${path}:`, error);
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
