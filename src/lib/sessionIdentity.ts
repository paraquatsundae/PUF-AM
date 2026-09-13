/**
 * Who the chrome should name. Mist sessions have no Firebase `User` — Auth
 * puts the operator on `userData` and leaves `user` null. The sidebar used to
 * fall through to the workshop-mode label in that case, so a Freenet owner
 * looked like a workshop user.
 */
export function sessionDisplayName(
  user: { displayName?: string | null; email?: string | null } | null | undefined,
  userData: { displayName?: string | null; email?: string | null } | null | undefined,
): string {
  const name =
    userData?.displayName?.trim() ||
    user?.displayName?.trim() ||
    userData?.email?.trim() ||
    user?.email?.trim();
  return name || 'Signed in';
}
