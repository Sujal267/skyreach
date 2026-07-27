import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { ApiError } from '../lib/http.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route for ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
}

/**
 * Single exit point for every error. Known failure shapes are translated into
 * stable codes the client can branch on; anything unrecognised becomes a plain
 * 500 with no internal detail leaked.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { message: err.message, code: err.code, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }
    res.status(400).json({
      error: { message: 'Please check the highlighted fields', code: 'VALIDATION', details },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = unique constraint. The only one users can trigger by hand here
    // is signing up with an email that already exists.
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { message: 'That value is already in use', code: 'DUPLICATE' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
      return;
    }
  }

  console.error('[error]', err);
  res.status(500).json({
    error: {
      message: 'Something went wrong on our end',
      code: 'INTERNAL',
      ...(isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}
