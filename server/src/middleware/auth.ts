import type { NextFunction, Request, Response } from 'express';

import { ACCESS_COOKIE, verifyAccessToken } from '../lib/tokens.js';
import { ApiError } from '../lib/http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

function readAccessToken(req: Request): string | null {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;

  // Bearer fallback exists purely so the API is curl-testable during
  // development, as the build order calls for. Cookies are the real path.
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

/** Hard gate. Rejects the request when there is no valid session. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readAccessToken(req);
  if (!token) {
    next(ApiError.unauthorized());
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Soft gate. Attaches the user when a valid session exists and otherwise does
 * nothing — used by endpoints that behave differently for signed-in visitors
 * but must still serve anonymous ones (e.g. seat holds keyed to a session).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readAccessToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: payload.email };
    } catch {
      // An expired token on an optional route is simply "not signed in".
    }
  }
  next();
}
