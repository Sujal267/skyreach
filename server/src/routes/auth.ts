import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
  signAccessToken,
} from '../lib/tokens.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const BCRYPT_ROUNDS = 12;

const signupSchema = z.object({
  email: z.string().email('Enter a valid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(200, 'That password is too long'),
  firstName: z.string().min(1, 'First name is required').max(60).trim(),
  lastName: z.string().min(1, 'Last name is required').max(60).trim(),
});

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Enter your password'),
});

/** Shape sent to the client. Never includes the password hash. */
function publicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: user.createdAt,
  };
}

authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const body = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
        firstName: body.firstName,
        lastName: body.lastName,
      },
    });

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = await issueRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });

    // Compare against a dummy hash when the user does not exist, so the
    // response time does not reveal which emails are registered.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(body.password, hash);

    if (!user || !ok) {
      throw ApiError.unauthorized('Email or password is incorrect', 'BAD_CREDENTIALS');
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = await issueRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({ user: publicUser(user) });
  }),
);

/**
 * Silent refresh. The web middleware calls this on any 401 and retries once.
 * Rotation happens inside rotateRefreshToken — see the note there on why
 * presenting a spent token nukes the whole session family.
 */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (typeof presented !== 'string' || !presented) {
      throw ApiError.unauthorized('No session to refresh', 'NO_REFRESH_TOKEN');
    }

    let rotated;
    try {
      rotated = await rotateRefreshToken(presented);
    } catch (err) {
      // A dead session should not leave stale cookies sitting in the browser.
      clearAuthCookies(res);
      throw err;
    }

    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user) {
      clearAuthCookies(res);
      throw ApiError.unauthorized('Account no longer exists', 'USER_GONE');
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    setAuthCookies(res, accessToken, rotated.token);

    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (typeof presented === 'string' && presented) {
      await revokeRefreshToken(presented);
    }
    clearAuthCookies(res);
    res.status(204).end();
  }),
);

/** Who am I — used to hydrate the client on first paint. */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw ApiError.unauthorized('Account no longer exists', 'USER_GONE');
    res.json({ user: publicUser(user) });
  }),
);
