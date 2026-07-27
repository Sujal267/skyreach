import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Errors the client is allowed to see. Anything thrown that is *not* an
 * ApiError is treated as a bug and reported as a generic 500 — internal
 * messages and stack traces never cross the wire.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Stable, machine-readable discriminator the UI can branch on. */
    readonly code: string = 'ERROR',
    /** Field-level detail for form validation. */
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: Record<string, string[]>) {
    return new ApiError(400, message, code, details);
  }
  static unauthorized(message = 'Not authenticated', code = 'UNAUTHENTICATED') {
    return new ApiError(401, message, code);
  }
  static forbidden(message = 'Not allowed', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }
  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }
  static conflict(message: string, code = 'CONFLICT') {
    return new ApiError(409, message, code);
  }
  static tooManyRequests(message = 'Slow down', code = 'RATE_LIMITED') {
    return new ApiError(429, message, code);
  }
}

/**
 * Express 4 does not catch rejected promises from async handlers — an
 * unhandled rejection there hangs the request forever. Every async route in
 * this codebase is wrapped in this.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
