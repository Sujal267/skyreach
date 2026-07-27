import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../lib/http.js';
import { getAircraft, getSnapshotInBounds } from '../services/liveTraffic.js';
import { env } from '../config/env.js';

export const liveTrafficRouter = Router();

const boundsSchema = z.object({
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, 'bbox must be lamin,lomin,lamax,lomax')
    .optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

// ── GET /api/live-traffic ────────────────────────────────────────────────────

/**
 * Public and cheap. Always answers from the in-process cache — a request here
 * never reaches OpenSky, so this endpoint's cost is bounded by the poll timer
 * rather than by traffic.
 */
liveTrafficRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = boundsSchema.parse(req.query);

    const bbox = q.bbox
      ? (q.bbox.split(',').map(Number) as [number, number, number, number])
      : undefined;

    const snapshot = getSnapshotInBounds(bbox, q.limit);

    // Let the browser reuse the response until the next server poll is due.
    res.set('Cache-Control', `public, max-age=${Math.floor(env.LIVE_TRAFFIC_POLL_SECONDS / 2)}`);
    res.json({
      fetchedAt: snapshot.fetchedAt,
      stale: snapshot.stale,
      source: snapshot.source,
      pollSeconds: env.LIVE_TRAFFIC_POLL_SECONDS,
      count: snapshot.aircraft.length,
      aircraft: snapshot.aircraft,
    });
  }),
);

// ── GET /api/live-traffic/:icao24 ────────────────────────────────────────────

const icaoSchema = z.string().regex(/^[0-9a-fA-F]{6}$/, 'ICAO24 must be 6 hex characters');

liveTrafficRouter.get(
  '/:icao24',
  asyncHandler(async (req, res) => {
    const icao24 = icaoSchema.parse(req.params.icao24).toLowerCase();
    const aircraft = await getAircraft(icao24);

    res.set('Cache-Control', 'public, max-age=5');
    res.json({
      icao24,
      /** null is a legitimate answer: the aircraft is on the ground or untracked. */
      aircraft,
      airborne: aircraft !== null,
      fetchedAt: Date.now(),
    });
  }),
);
