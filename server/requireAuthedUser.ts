/**
 * Bearer gate for routes that spend a server-held secret rather than acting on
 * one farm's own data — the DPIRD key and the Admin SDK writes behind
 * `/api/weather/*`.
 *
 * Those routes were open because the client called them with a bare `fetch`,
 * which made the proxy a credentialed one anyone could drive. The check lives
 * here rather than inline so a weather route added later is gated by importing
 * one function, the same reasoning `apiFetch` uses for the client side.
 *
 * Answers the request itself and returns null, so callers read as:
 *
 *     const caller = await requireAuthedUser(req, res);
 *     if (!caller) return;
 */
import type { Request, Response } from 'express';

import { verifyBearer } from './accessPinAuth.ts';
import { isAdminSdkReady } from './firebaseAdmin.ts';

export type AuthedCaller = Awaited<ReturnType<typeof verifyBearer>>;

export async function requireAuthedUser(
  req: Request,
  res: Response
): Promise<AuthedCaller | null> {
  // A workshop tree with no service account cannot verify anyone. 503 says
  // "this server is not set up" rather than 401's "your credential is wrong".
  if (!isAdminSdkReady()) {
    res.status(503).json({ error: 'Firebase Admin is not configured on this server.' });
    return null;
  }

  try {
    return await verifyBearer(req);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    res.status(typeof status === 'number' ? status : 401).json({
      error: error instanceof Error ? error.message : 'Not authorised',
    });
    return null;
  }
}
