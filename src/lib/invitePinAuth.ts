/**
 * Client helpers for invite-PIN authentication (no Google OAuth).
 */
import { auth } from '../firebase';
import { apiUrl } from './apiBase';

export type PinRole = 'admin' | 'farmer' | 'viewer';

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

export async function redeemInvitePin(
  pin: string,
  displayName: string
): Promise<{
  token: string;
  farmId: string;
  role: PinRole;
  uid: string;
}> {
  const res = await fetch(apiUrl('/api/auth/redeem-pin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, displayName }),
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
  maxUses?: number | null;
  expiresInDays?: number | null;
}): Promise<{ code: string; pinId: string; role: PinRole; label: string; expiresAt: string | null }> {
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
  }>
> {
  const res = await fetch(apiUrl('/api/auth/pins'), { headers: await authHeaders() });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to list PINs'));
  return (data.pins as never[]) || [];
}

export async function revokeInvitePin(pinId: string): Promise<void> {
  const res = await fetch(apiUrl('/api/auth/revoke-pin'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ pinId }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error || 'Failed to revoke PIN'));
}
