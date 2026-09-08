export type TokenClaims = {
  uid: string;
  farmId?: string;
  authEpoch?: number;
};

export type StoredUser = {
  farmId?: string;
  accessRevoked?: boolean;
  authEpoch?: number;
};

export function membershipAllowsAccess(claims: TokenClaims, stored: StoredUser | null): boolean {
  if (stored?.accessRevoked === true) return false;
  if (
    stored &&
    typeof stored.authEpoch === 'number' &&
    typeof claims.authEpoch === 'number' &&
    claims.authEpoch < stored.authEpoch
  ) {
    return false;
  }
  if (typeof claims.farmId === 'string' && claims.farmId !== '') return true;
  return typeof stored?.farmId === 'string' && stored.farmId !== '';
}
