/**
 * OpenSky Network client — the ONLY real, live data source in this product.
 *
 * Two things this module exists to protect, both worth stating plainly:
 *
 *  1. The client secret never reaches a browser. Every OpenSky call originates
 *     here, server-side. The frontend talks to our own /api/live-traffic.
 *
 *  2. The daily credit budget is finite (4,000/day unauthenticated). We poll
 *     once on a timer and serve every client from one in-process cache, so the
 *     cost is a fixed handful of credits per day no matter how many people are
 *     looking at the map. A thousand visitors and one visitor cost the same.
 */

const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/** OpenSky's state-vector array, decoded into something with names. */
export interface AircraftState {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  lon: number;
  lat: number;
  /** Barometric altitude, metres. */
  altitude: number | null;
  onGround: boolean;
  /** Ground speed, m/s. */
  velocity: number | null;
  /** Heading, degrees clockwise from north. */
  heading: number | null;
  /** Vertical rate, m/s. Positive = climbing. */
  verticalRate: number | null;
  lastContact: number;
}

/** Raw OpenSky state vector — positional array, hence the index constants. */
type RawState = (number | string | boolean | null)[];

const I = {
  icao24: 0,
  callsign: 1,
  originCountry: 2,
  lastContact: 4,
  lon: 5,
  lat: 6,
  baroAltitude: 7,
  onGround: 8,
  velocity: 9,
  trueTrack: 10,
  verticalRate: 11,
  geoAltitude: 13,
} as const;

function decode(raw: RawState): AircraftState | null {
  const lon = raw[I.lon];
  const lat = raw[I.lat];
  const icao24 = raw[I.icao24];

  // Position is optional in OpenSky's feed. An aircraft without one is not
  // something we can draw, so it is dropped here rather than downstream.
  if (typeof lon !== 'number' || typeof lat !== 'number' || typeof icao24 !== 'string') {
    return null;
  }

  const num = (v: number | string | boolean | null | undefined): number | null =>
    typeof v === 'number' ? v : null;

  const callsign = raw[I.callsign];
  const originCountry = raw[I.originCountry];

  return {
    icao24,
    callsign: typeof callsign === 'string' ? callsign.trim() || null : null,
    originCountry: typeof originCountry === 'string' ? originCountry : '',
    lon,
    lat,
    // Barometric is what ATC and every altimeter reference; geometric is the
    // fallback when the transponder does not report it.
    altitude: num(raw[I.baroAltitude]) ?? num(raw[I.geoAltitude]),
    onGround: raw[I.onGround] === true,
    velocity: num(raw[I.velocity]),
    heading: num(raw[I.trueTrack]),
    verticalRate: num(raw[I.verticalRate]),
    lastContact: num(raw[I.lastContact]) ?? 0,
  };
}

// ── OAuth2 client-credentials ────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  // Anonymous access is allowed, just on a smaller credit budget. Running
  // without credentials is a supported mode, not an error.
  if (!clientId || !clientSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[opensky] token request failed: ${res.status}. Falling back to anonymous.`);
      return null;
    }

    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return cachedToken.value;
  } catch (err) {
    console.warn('[opensky] token request errored, falling back to anonymous:', err);
    return null;
  }
}

// ── Fetching ─────────────────────────────────────────────────────────────────

export interface FetchOptions {
  /** [lamin, lomin, lamax, lomax] — omit for global coverage. */
  bbox?: [number, number, number, number];
  icao24?: string[];
}

/**
 * One raw call to OpenSky. Callers should almost never use this directly —
 * go through the cache in live-traffic.ts, which is what keeps the credit
 * budget flat.
 */
export async function fetchStates(opts: FetchOptions = {}): Promise<AircraftState[]> {
  const url = new URL(STATES_URL);

  if (opts.bbox) {
    const [lamin, lomin, lamax, lomax] = opts.bbox;
    url.searchParams.set('lamin', String(lamin));
    url.searchParams.set('lomin', String(lomin));
    url.searchParams.set('lamax', String(lamax));
    url.searchParams.set('lomax', String(lomax));
  }
  for (const hex of opts.icao24 ?? []) {
    url.searchParams.append('icao24', hex.toLowerCase());
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) {
    throw new OpenSkyRateLimitError('OpenSky rate limit reached');
  }
  if (!res.ok) {
    throw new Error(`OpenSky responded ${res.status}`);
  }

  const json = (await res.json()) as { time: number; states: RawState[] | null };
  return (json.states ?? []).map(decode).filter((s): s is AircraftState => s !== null);
}

export class OpenSkyRateLimitError extends Error {
  readonly rateLimited = true;
}

/** Single aircraft by ICAO24 hex. Returns null when it is not currently tracked. */
export async function fetchAircraft(icao24: string): Promise<AircraftState | null> {
  const states = await fetchStates({ icao24: [icao24] });
  return states[0] ?? null;
}
