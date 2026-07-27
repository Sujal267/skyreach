import { env } from '../config/env.js';
import {
  fetchAircraft,
  fetchStates,
  OpenSkyRateLimitError,
  type AircraftState,
} from './opensky.js';

/**
 * The credit budget in one place.
 *
 * Every client that wants the live map reads from `snapshot` below. Nothing
 * downstream of here can trigger an OpenSky call — one timer refreshes the
 * cache, everyone shares it. Visitor count and API spend are decoupled, which
 * is the entire reason this proxy exists rather than the browser calling
 * OpenSky directly.
 */

export interface TrafficSnapshot {
  /** Epoch millis the data was fetched. */
  fetchedAt: number;
  aircraft: LiveAircraft[];
  /** True when the last refresh failed and this is stale data being served on. */
  stale: boolean;
  source: 'opensky' | 'unavailable';
}

/** Shaped for the map: noisy OpenSky fields dropped, units left in SI. */
export interface LiveAircraft {
  id: string;
  callsign: string | null;
  lat: number;
  lon: number;
  /** Metres. */
  alt: number;
  /** Degrees clockwise from north. */
  hdg: number;
  /** Metres per second. */
  spd: number;
  /** Metres per second, positive climbing. */
  vr: number;
}

function shape(s: AircraftState): LiveAircraft {
  return {
    id: s.icao24,
    callsign: s.callsign,
    lat: Math.round(s.lat * 10000) / 10000,
    lon: Math.round(s.lon * 10000) / 10000,
    alt: Math.round(s.altitude ?? 0),
    hdg: Math.round(s.heading ?? 0),
    spd: Math.round(s.velocity ?? 0),
    vr: Math.round((s.verticalRate ?? 0) * 10) / 10,
  };
}

let snapshot: TrafficSnapshot = {
  fetchedAt: 0,
  aircraft: [],
  stale: true,
  source: 'unavailable',
};

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;
let consecutiveFailures = 0;

async function refresh(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const states = await fetchStates();

      // Aircraft on the ground are noise on a traffic map — hundreds of them
      // stacked motionless on the same apron pixel. Airborne only.
      const airborne = states.filter((s) => !s.onGround && s.altitude !== null && s.altitude > 150);

      snapshot = {
        fetchedAt: Date.now(),
        aircraft: airborne.map(shape),
        stale: false,
        source: 'opensky',
      };
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      // Keep serving the last good snapshot rather than emptying the map.
      // A map that briefly stops updating beats one that blinks out.
      snapshot = { ...snapshot, stale: true };

      const rateLimited = err instanceof OpenSkyRateLimitError;
      if (consecutiveFailures <= 3 || consecutiveFailures % 20 === 0) {
        console.warn(
          `[live-traffic] refresh failed (${consecutiveFailures}x)${rateLimited ? ' — rate limited' : ''}:`,
          err instanceof Error ? err.message : err,
        );
      }
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Back off when OpenSky is unhappy, rather than hammering it on a fixed timer. */
function nextDelayMs(): number {
  const base = env.LIVE_TRAFFIC_POLL_SECONDS * 1000;
  if (consecutiveFailures === 0) return base;
  return Math.min(base * 2 ** Math.min(consecutiveFailures, 5), 5 * 60_000);
}

function scheduleNext(): void {
  timer = setTimeout(async () => {
    await refresh();
    scheduleNext();
  }, nextDelayMs());
  // Do not keep the process alive purely for the poll timer.
  timer.unref?.();
}

export function startLiveTrafficPolling(): void {
  if (timer) return;
  console.log(
    `[live-traffic] polling OpenSky every ${env.LIVE_TRAFFIC_POLL_SECONDS}s (one shared cache)`,
  );
  void refresh().then(scheduleNext);
}

export function stopLiveTrafficPolling(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function getSnapshot(): TrafficSnapshot {
  return snapshot;
}

/** Optional viewport filter, applied to the cached snapshot — never a new fetch. */
export function getSnapshotInBounds(
  bbox?: [number, number, number, number],
  limit?: number,
): TrafficSnapshot {
  let aircraft = snapshot.aircraft;

  if (bbox) {
    const [lamin, lomin, lamax, lomax] = bbox;
    aircraft = aircraft.filter(
      (a) => a.lat >= lamin && a.lat <= lamax && a.lon >= lomin && a.lon <= lomax,
    );
  }
  if (limit && aircraft.length > limit) {
    aircraft = aircraft.slice(0, limit);
  }

  return { ...snapshot, aircraft };
}

// ── Single-aircraft tracking ─────────────────────────────────────────────────

const singleCache = new Map<string, { at: number; value: LiveAircraft | null }>();
const SINGLE_TTL_MS = 12_000;

/**
 * One aircraft by ICAO24, for the confirmation page's hero map.
 *
 * Tries the global snapshot first — it usually already contains the aircraft,
 * which costs zero credits. Only falls through to a targeted OpenSky query
 * when it does not, and caches that result briefly so a page left open does
 * not poll straight through to the upstream API.
 */
export async function getAircraft(icao24: string): Promise<LiveAircraft | null> {
  const key = icao24.toLowerCase();

  const cached = singleCache.get(key);
  if (cached && Date.now() - cached.at < SINGLE_TTL_MS) return cached.value;

  const fromSnapshot = snapshot.aircraft.find((a) => a.id === key);
  if (fromSnapshot && !snapshot.stale) {
    singleCache.set(key, { at: Date.now(), value: fromSnapshot });
    return fromSnapshot;
  }

  try {
    const state = await fetchAircraft(key);
    const value = state && !state.onGround ? shape(state) : null;
    singleCache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn(`[live-traffic] single lookup for ${key} failed:`, err);
    return fromSnapshot ?? null;
  }
}
