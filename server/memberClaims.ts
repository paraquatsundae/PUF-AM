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
};

/**
 * True when existing claims were minted as platform admin, not farm-role admin.
 *
 * Pre-F2 `setAdminClaim` wrote only `{ admin: true }` (no `role`, no `pinAuth`).
 * Farm-role claims always carry `role`.
 */
export function resolvePlatformAdminClaim(existing?: ExistingClaims | null): boolean {
  if (!existing) return false;
  if (existing.platformAdmin === true) return true;
  return (
    existing.admin === true && existing.pinAuth !== true && existing.role == null
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
