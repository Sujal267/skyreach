import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { corsOrigins, env, isProd } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { optionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { flightsRouter } from './routes/flights.js';
import { seatsRouter } from './routes/seats.js';
import { bookingsRouter } from './routes/bookings.js';
import { liveTrafficRouter } from './routes/liveTraffic.js';
import { startLiveTrafficPolling, stopLiveTrafficPolling } from './services/liveTraffic.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { startFlightSupplyJob } from './jobs/flightSupply.js';

const app = express();

// Behind Fly/Railway's proxy, so Express must trust X-Forwarded-* to get the
// protocol right — otherwise Secure cookies are never set in production.
app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests and curl send no Origin header at all.
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed`));
    },
    // Required for the httpOnly auth cookies to travel cross-origin.
    credentials: true,
  }),
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Attaches req.user when a session exists. Routes that *require* one still
// declare requireAuth themselves — this only makes the identity available.
app.use(optionalAuth);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'skyreach-api', env: env.NODE_ENV });
});

app.use('/api/auth', authRouter);
app.use('/api/flights', flightsRouter);
app.use('/api/seats', seatsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/live-traffic', liveTrafficRouter);

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await prisma.$connect();
    console.log('[db] connected');
  } catch (err) {
    console.error(
      '\n❌ Could not reach the database. Check DATABASE_URL in server/.env.\n',
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  startLiveTrafficPolling();
  startCleanupJob();
  startFlightSupplyJob();

  const server = app.listen(env.PORT, () => {
    console.log(`\n🛫 SkyReach API on http://localhost:${env.PORT}`);
    console.log(`   CORS: ${corsOrigins.join(', ')}`);
    console.log(`   Mode: ${env.NODE_ENV}${isProd ? '' : ' (payments simulated)'}\n`);
  });

  // Finish in-flight requests before dying, so a deploy does not 502 anyone.
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] shutting down…`);
    stopLiveTrafficPolling();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void start();
