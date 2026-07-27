import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once, at boot, and fails loudly. A server that
 * starts with a missing JWT secret and only discovers it on the first login
 * is a worse outcome than one that refuses to start.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Neon connection string)'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),

  OPENSKY_CLIENT_ID: z.string().optional(),
  OPENSKY_CLIENT_SECRET: z.string().optional(),
  LIVE_TRAFFIC_POLL_SECONDS: z.coerce.number().int().min(5).default(15),

  SEAT_HOLD_MINUTES: z.coerce.number().int().positive().default(10),
  BOOKING_EXPIRY_MINUTES: z.coerce.number().int().positive().default(15),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ Invalid environment configuration:\n');
  for (const issue of parsed.error.issues) {
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n   Copy server/.env.example to server/.env and fill it in.\n');
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';

/** Origins allowed to make credentialed cross-site requests. */
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * SameSite=none is meaningless without Secure, and browsers silently drop the
 * cookie. Catching it here beats debugging "login works locally but not in prod".
 */
if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
  console.warn(
    '[config] COOKIE_SAMESITE=none requires COOKIE_SECURE=true — browsers will reject these cookies.',
  );
}
