import type { LiveAircraft } from '@/lib/types';
import { altitudeBand } from './planeIcon';

/**
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * The server polls OpenSky every 15 seconds. Moving markers to their new
 * coordinates once per poll produces a map that twitches every 15s and sits
 * frozen in between — the single thing that makes a live map look fake.
 *
 * So between polls we dead-reckon: an aircraft reporting a heading and a
 * ground speed is, to a very good approximation, going to keep doing exactly
 * that for the next few seconds. Advancing each marker along its own heading
 * at its own speed, every animation frame, produces continuous motion that is
 * also broadly *correct* — it is the same technique ATC displays use to fill
 * the gap between radar sweeps.
 *
 * When a fresh poll lands, the reported position will differ slightly from
 * where we predicted. Snapping to it would reintroduce the twitch, so the
 * correction is eased in over `CORRECTION_MS` instead. The result is motion
 * that is smooth and self-correcting rather than smooth and drifting.
 */

const EARTH_RADIUS_M = 6_371_000;

/** How long to blend a prediction error away once real data arrives. */
const CORRECTION_MS = 1_800;

/**
 * Stop predicting if the feed goes quiet. An aircraft dead-reckoned for
 * minutes on stale data is fiction, and it is better for a marker to stop
 * than to confidently fly somewhere it is not.
 */
const MAX_EXTRAPOLATION_MS = 45_000;

export interface TrackedAircraft {
  id: string;
  callsign: string | null;
  /** Where the marker is drawn right now. */
  lat: number;
  lon: number;
  /** Last position the server actually reported, and when we received it. */
  reportedLat: number;
  reportedLon: number;
  reportedAt: number;
  /** Offset still to be eased away, in degrees. */
  correctionLat: number;
  correctionLon: number;
  correctionStart: number;
  hdg: number;
  spd: number;
  alt: number;
  band: 'low' | 'cruise' | 'high';
}

/** Metres travelled on `hdg` for `seconds`, expressed as a lat/lon delta. */
function advance(lat: number, lon: number, hdg: number, speedMps: number, seconds: number) {
  const metres = speedMps * seconds;
  if (metres === 0) return { lat, lon };

  const rad = (hdg * Math.PI) / 180;
  const dNorth = metres * Math.cos(rad);
  const dEast = metres * Math.sin(rad);

  const dLat = (dNorth / EARTH_RADIUS_M) * (180 / Math.PI);
  // Longitude degrees shrink toward the poles, hence the cos(lat) term.
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLon =
    Math.abs(cosLat) < 1e-6
      ? 0
      : (dEast / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);

  return { lat: lat + dLat, lon: lon + dLon };
}

/** Ease-out cubic — corrections arrive fast then settle, never overshooting. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Holds the tracked fleet and advances it. Deliberately a plain class rather
 * than React state: this updates ~25 times a second and must never trigger a
 * re-render — the only thing it touches is the MapLibre GeoJSON source.
 */
export class FleetTracker {
  private fleet = new Map<string, TrackedAircraft>();

  /** Merge a fresh server snapshot into the tracked fleet. */
  update(aircraft: LiveAircraft[], now = performance.now()): void {
    const seen = new Set<string>();

    for (const a of aircraft) {
      seen.add(a.id);
      const existing = this.fleet.get(a.id);

      if (!existing) {
        this.fleet.set(a.id, {
          id: a.id,
          callsign: a.callsign,
          lat: a.lat,
          lon: a.lon,
          reportedLat: a.lat,
          reportedLon: a.lon,
          reportedAt: now,
          correctionLat: 0,
          correctionLon: 0,
          correctionStart: now,
          hdg: a.hdg,
          spd: a.spd,
          alt: a.alt,
          band: altitudeBand(a.alt),
        });
        continue;
      }

      // Difference between where we predicted it and where it actually is.
      // Eased away rather than snapped — see the note at the top of the file.
      existing.correctionLat = a.lat - existing.lat;
      existing.correctionLon = a.lon - existing.lon;
      existing.correctionStart = now;

      existing.callsign = a.callsign;
      existing.reportedLat = a.lat;
      existing.reportedLon = a.lon;
      existing.reportedAt = now;
      existing.hdg = a.hdg;
      existing.spd = a.spd;
      existing.alt = a.alt;
      existing.band = altitudeBand(a.alt);
    }

    // Aircraft that dropped out of the feed — landed, or left the viewport.
    for (const id of this.fleet.keys()) {
      if (!seen.has(id)) this.fleet.delete(id);
    }
  }

  /**
   * Advance every marker to `now`. Called once per animation frame.
   * `reducedMotion` skips prediction entirely: markers sit on their last
   * reported position and jump on each poll, as the accessibility spec requires.
   */
  step(now: number, reducedMotion: boolean): void {
    for (const craft of this.fleet.values()) {
      if (reducedMotion) {
        craft.lat = craft.reportedLat;
        craft.lon = craft.reportedLon;
        continue;
      }

      const elapsedMs = now - craft.reportedAt;
      if (elapsedMs > MAX_EXTRAPOLATION_MS) {
        craft.lat = craft.reportedLat;
        craft.lon = craft.reportedLon;
        continue;
      }

      // Predict forward from the last *reported* fix, not from the previous
      // frame — errors would otherwise compound frame over frame.
      const predicted = advance(
        craft.reportedLat,
        craft.reportedLon,
        craft.hdg,
        craft.spd,
        elapsedMs / 1000,
      );

      const correctionAge = now - craft.correctionStart;
      const remaining =
        correctionAge >= CORRECTION_MS ? 0 : 1 - easeOut(correctionAge / CORRECTION_MS);

      craft.lat = predicted.lat - craft.correctionLat * remaining;
      craft.lon = predicted.lon - craft.correctionLon * remaining;
    }
  }

  /**
   * Current fleet as GeoJSON for the MapLibre source.
   * Only the properties the layer's style expressions actually read are
   * emitted — every extra field is per-feature cost at 500+ markers.
   */
  toGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Point> {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

    for (const [, a] of this.fleet) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        properties: { id: a.id, hdg: a.hdg, band: a.band, callsign: a.callsign },
      });
    }

    return { type: 'FeatureCollection', features };
  }

  get size(): number {
    return this.fleet.size;
  }

  get(id: string): TrackedAircraft | undefined {
    return this.fleet.get(id);
  }

  clear(): void {
    this.fleet.clear();
  }
}

/**
 * Great-circle path between two points, as a line of `steps` segments.
 * A straight line in Mercator is not the route an aircraft flies — the arc is
 * what makes a JFK→LHR line bend north the way a real map shows it.
 */
export function greatCircle(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  steps = 96,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lon);
  const lat2 = toRad(to.lat);
  const lon2 = toRad(to.lon);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  // Coincident points have no arc to draw.
  if (d === 0 || !Number.isFinite(d)) {
    return [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ];
  }

  const points: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }

  return unwrapAntimeridian(points);
}

/**
 * Keep longitudes continuous across ±180°. Without this a Pacific route draws
 * a line straight back across the entire map instead of over the date line.
 */
function unwrapAntimeridian(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let offset = 0;

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const delta = points[i][0] - points[i - 1][0];
      if (delta > 180) offset -= 360;
      else if (delta < -180) offset += 360;
    }
    out.push([points[i][0] + offset, points[i][1]]);
  }

  return out;
}
