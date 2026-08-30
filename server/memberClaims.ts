/**
 * Custom claims for invite-PIN / farm members.
 *
 * `admin` on the token is **platform** only (`scripts/setAdminClaim.ts`).
 * Farm-role admin is `role: 'admin'` plus `farmId` — never a global key.
 */

export type MemberClaimsInput = {
  farmId: string;
  role: string;
  modules: string[];
  authEpoch: number;
  pinAuth?: boolean;
};

export type ExistingClaims = {
  admin?: unknown;
  platformAdmin?: unknown;
  pinAuth?: unknown;
  role?: unknown;
  farmId?: unknown;
};

/**
 * True when existing claims were minted as platform admin, not farm-role admin.
 *
 * Pre-F2 `setAdminClaim` wrote only `{ admin: true }` (no `role`, no `pinAuth`).
 * Farm-role claims always carry `role`.
 */
export function resolvePlatformAdminClaim(existing?: object | null): boolean {
  if (!existing) return false;
  const claims = existing as ExistingClaims;
  if (claims.platformAdmin === true) return true;
  return (
    claims.admin === true && claims.pinAuth !== true && claims.role == null
  );
}

export function claimsForMember(
  input: MemberClaimsInput,
  existing?: ExistingClaims | null
): {
  pinAuth: boolean;
  admin: boolean;
  platformAdmin: boolean;
  farmId: string;
  role: string;
  modules: string[];
  authEpoch: number;
} {
  const platformAdmin = resolvePlatformAdminClaim(existing);
  return {
    pinAuth: input.pinAuth !== false,
    admin: platformAdmin,
    platformAdmin,
    farmId: input.farmId,
    role: input.role,
    modules: input.modules,
    authEpoch: input.authEpoch,
  };
}
