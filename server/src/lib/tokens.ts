import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';

import { env, isProd } from '../config/env.js';
import { prisma } from './prisma.js';
import { ApiError } from './http.js';

export const ACCESS_COOKIE = 'sr_access';
export const REFRESH_COOKIE = 'sr_refresh';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/**
 * Cookie policy. httpOnly is the whole point — a token readable by
 * `document.cookie` is a token an XSS payload can exfiltrate, and no amount of
 * short expiry fixes that.
 */
function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: maxAgeMs,
  } as const;
}

// ── Access tokens ────────────────────────────────────────────────────────────

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'skyreach',
    audience: 'skyreach-web',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'skyreach',
      audience: 'skyreach-web',
    }) as AccessTokenPayload;
  } catch {
    throw ApiError.unauthorized('Session expired', 'TOKEN_EXPIRED');
  }
}

// ── Refresh tokens ───────────────────────────────────────────────────────────

/**
 * Refresh tokens are opaque random strings, not JWTs, and only their SHA-256
 * hash is stored. A leaked database dump therefore yields nothing usable —
 * the same reasoning as never storing a password in plaintext.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return token;
}

/**
 * Rotation: every refresh consumes the presented token and issues a new one.
 *
 * Presenting an already-revoked token means either a replay or a stolen token
 * being used alongside the legitimate one. We cannot tell which, so we assume
 * the worst and revoke that user's entire token family — logging every session
 * out. That is the standard response to suspected refresh-token theft, and it
 * is why rotation is worth implementing rather than issuing long-lived tokens.
 */
export async function rotateRefreshToken(
  presented: string,
): Promise<{ userId: string; token: string }> {
  const tokenHash = hashToken(presented);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!record) {
    throw ApiError.unauthorized('Invalid session', 'REFRESH_INVALID');
  }

  if (record.revoked) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revoked: false },
      data: { revoked: true },
    });
    console.warn(
      `[auth] Reuse of a revoked refresh token for user ${record.userId}. All sessions revoked.`,
    );
    throw ApiError.unauthorized('Session revoked, please sign in again', 'REFRESH_REUSED');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Session expired', 'REFRESH_EXPIRED');
  }

  const token = crypto.randomBytes(48).toString('hex');

  // Consume and re-issue atomically, so a crash between the two can never
  // leave the old token still usable alongside its replacement.
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } }),
    prisma.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    }),
  ]);

  return { userId: record.userId, token };
}

export async function revokeRefreshToken(presented: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presented) },
    data: { revoked: true },
  });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
}

// ── Cookie plumbing ──────────────────────────────────────────────────────────

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(15 * 60_000));
  res.cookie(
    REFRESH_COOKIE,
    refreshToken,
    cookieOptions(env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  );
}

export function clearAuthCookies(res: Response): void {
  const opts = { ...cookieOptions(0), maxAge: undefined };
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}

/** Sweep expired and revoked tokens. Called by the cleanup job. */
export async function purgeStaleTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }],
    },
  });
  return count;
}
