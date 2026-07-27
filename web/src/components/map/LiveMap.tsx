'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { live } from '@/lib/api';
import type { LiveAircraft } from '@/lib/types';
import { useReducedMotion } from '@/lib/hooks';
import { FleetTracker, greatCircle } from './interpolate';
import { createAirportIcons, createFocusIcon, createTrafficIcons } from './planeIcon';

/**
 * ── The one map component ───────────────────────────────────────────────────
 *
 * Built once and reused by the home hero, the confirmation page and the
 * dashboard modal, rather than three near-identical implementations that drift
 * apart. Three modes:
 *
 *   ambient — global live traffic, dimmed, non-interactive. Home page texture.
 *   track   — one booked aircraft, followed. The confirmation hero moment.
 *   route   — static great-circle line. Flights that have not departed yet.
 *
 * Performance note that drives the whole design: at 500+ aircraft we render a
 * single MapLibre `symbol` layer over a GeoJSON source, on the WebGL canvas.
 * The obvious alternative — one `maplibregl.Marker` per aircraft — creates 500
 * DOM nodes and 500 CSS transforms per frame, and cannot hold 30fps. There is
 * no DOM element per aircraft anywhere in this file.
 */

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CARTO_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const SOURCE_TRAFFIC = 'sr-traffic';
const SOURCE_FOCUS = 'sr-focus';
const SOURCE_ROUTE = 'sr-route';
const SOURCE_AIRPORTS = 'sr-airports';

/** ~25fps for the source update. Beyond this the GPU is idle and the CPU is not. */
const FRAME_INTERVAL_MS = 40;

export type MapMode = 'ambient' | 'track' | 'route';

export interface LiveMapProps {
  mode: MapMode;
  className?: string;

  /** track mode — the ICAO24 hex to follow. */
  icao24?: string | null;

  /** route + track modes — endpoints for the route line. */
  origin?: { lat: number; lon: number; iata: string };
  destination?: { lat: number; lon: number; iata: string };

  /** Basemap. Dark unless told otherwise; the light one is for route maps. */
  theme?: 'dark' | 'light';

  interactive?: boolean;
  /** ambient mode — dim the whole canvas so foreground UI stays readable. */
  dim?: number;
  initialZoom?: number;
  initialCenter?: [number, number];

  /** Cap the ambient fleet. Omit to render everything OpenSky reports. */
  maxAircraft?: number;

  onAircraftUpdate?: (aircraft: LiveAircraft | null) => void;
  onTrafficCount?: (count: number) => void;
}

export default function LiveMap({
  mode,
  className,
  icao24,
  origin,
  destination,
  theme = 'dark',
  interactive = true,
  dim,
  initialZoom,
  initialCenter,
  maxAircraft,
  onAircraftUpdate,
  onTrafficCount,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const trackerRef = useRef(new FleetTracker());
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const styleReadyRef = useRef(false);

  const reducedMotion = useReducedMotion();
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Callbacks live in refs so changing them never tears down the map.
  const onAircraftUpdateRef = useRef(onAircraftUpdate);
  onAircraftUpdateRef.current = onAircraftUpdate;
  const onTrafficCountRef = useRef(onTrafficCount);
  onTrafficCountRef.current = onTrafficCount;

  // ── Map construction ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: theme === 'dark' ? CARTO_DARK : CARTO_LIGHT,
        center: initialCenter ?? [10, 30],
        zoom: initialZoom ?? 1.6,
        interactive,
        attributionControl: { compact: true },
        // The globe is prettier but costs frames; mercator holds 30fps at 500+.
        renderWorldCopies: true,
        maxZoom: 12,
        fadeDuration: 0,
      });
    } catch (err) {
      // No WebGL — a real condition on locked-down machines and old hardware.
      console.warn('[LiveMap] could not initialise WebGL:', err);
      setFailed(true);
      return;
    }

    mapRef.current = map;

    map.on('error', (e) => {
      // Tile 404s are noise; a style failure is not.
      if (e.error?.message?.includes('style')) setFailed(true);
    });

    map.on('load', () => {
      for (const icon of createTrafficIcons()) {
        if (!map.hasImage(icon.id)) {
          map.addImage(icon.id, icon.data, { pixelRatio: icon.pixelRatio });
        }
      }
      const focus = createFocusIcon();
      if (!map.hasImage(focus.id)) {
        map.addImage(focus.id, focus.data, { pixelRatio: focus.pixelRatio });
      }
      for (const icon of createAirportIcons()) {
        if (!map.hasImage(icon.id)) {
          map.addImage(icon.id, icon.data, { pixelRatio: icon.pixelRatio });
        }
      }

      const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

      // ── Route line ──────────────────────────────────────────────────────
      map.addSource(SOURCE_ROUTE, { type: 'geojson', data: empty });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: SOURCE_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#3D7AB5',
          'line-width': 7,
          'line-blur': 6,
          'line-opacity': 0.32,
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: SOURCE_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#3D7AB5',
          'line-width': 1.6,
          'line-opacity': 0.95,
        },
      });

      // ── Airports ────────────────────────────────────────────────────────
      map.addSource(SOURCE_AIRPORTS, { type: 'geojson', data: empty });
      map.addLayer({
        id: 'airport-dots',
        type: 'symbol',
        source: SOURCE_AIRPORTS,
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': 1,
          'icon-allow-overlap': true,
          'text-field': ['get', 'iata'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': theme === 'dark' ? '#F5F4F1' : '#0B0C10',
          'text-halo-color': theme === 'dark' ? '#0B0C10' : '#F5F4F1',
          'text-halo-width': 1.5,
        },
      });

      // ── Ambient traffic ─────────────────────────────────────────────────
      // One source, one layer, every aircraft. This is the 30fps requirement.
      map.addSource(SOURCE_TRAFFIC, { type: 'geojson', data: empty });
      map.addLayer({
        id: 'traffic-planes',
        type: 'symbol',
        source: SOURCE_TRAFFIC,
        layout: {
          'icon-image': [
            'match',
            ['get', 'band'],
            'low',
            'plane-low',
            'cruise',
            'plane-cruise',
            'plane-high',
          ],
          'icon-rotate': ['get', 'hdg'],
          'icon-rotation-alignment': 'map',
          // Overlap checks are per-feature work we cannot afford at this count,
          // and overlapping aircraft is what real traffic looks like anyway.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 5, 0.85, 9, 1.1],
        },
      });

      // ── Focused aircraft ────────────────────────────────────────────────
      map.addSource(SOURCE_FOCUS, { type: 'geojson', data: empty });
      map.addLayer({
        id: 'focus-halo',
        type: 'circle',
        source: SOURCE_FOCUS,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 16, 8, 34],
          'circle-color': '#3D7AB5',
          'circle-opacity': ['get', 'pulse'],
          'circle-blur': 0.7,
        },
      });
      map.addLayer({
        id: 'focus-plane',
        type: 'symbol',
        source: SOURCE_FOCUS,
        layout: {
          'icon-image': 'plane-focus',
          'icon-rotate': ['get', 'hdg'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': 1,
        },
      });

      styleReadyRef.current = true;
      setReady(true);
    });

    return () => {
      styleReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Rebuilding on theme change is correct — MapLibre cannot swap a style
    // and keep custom layers without re-adding all of them anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, interactive]);

  // ── Route line + airport dots ─────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !origin || !destination) return;

    const line = greatCircle(origin, destination);

    (map.getSource(SOURCE_ROUTE) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: {} },
      ],
    });

    (map.getSource(SOURCE_AIRPORTS) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] },
          properties: { icon: 'airport-origin', iata: origin.iata },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [destination.lon, destination.lat] },
          properties: { icon: 'airport-dest', iata: destination.iata },
        },
      ],
    });

    // Frame the whole route with room for the overlay cards.
    if (mode === 'route') {
      const bounds = new maplibregl.LngLatBounds();
      for (const c of line) bounds.extend(c as [number, number]);
      map.fitBounds(bounds, {
        padding: { top: 70, bottom: 70, left: 60, right: 60 },
        duration: reducedRef.current ? 0 : 900,
        maxZoom: 5,
      });
    }
  }, [ready, origin, destination, mode]);

  // ── Ambient traffic polling ───────────────────────────────────────────────

  const pollTraffic = useCallback(async () => {
    try {
      const res = await live.traffic(maxAircraft ? { limit: maxAircraft } : {});
      trackerRef.current.update(res.aircraft, performance.now());
      onTrafficCountRef.current?.(res.aircraft.length);
    } catch {
      // A missed poll is survivable — markers keep dead-reckoning on the last
      // good fix and the next poll corrects them.
    }
  }, [maxAircraft]);

  useEffect(() => {
    if (mode !== 'ambient' || !ready) return;

    void pollTraffic();
    const id = setInterval(() => {
      if (!document.hidden) void pollTraffic();
    }, 15_000);

    return () => clearInterval(id);
  }, [mode, ready, pollTraffic]);

  // ── Focused aircraft polling ──────────────────────────────────────────────

  const pollFocus = useCallback(async () => {
    if (!icao24) return;
    try {
      const res = await live.aircraft(icao24);
      onAircraftUpdateRef.current?.(res.aircraft);

      if (res.aircraft) {
        trackerRef.current.update([res.aircraft], performance.now());

        const map = mapRef.current;
        if (map && styleReadyRef.current) {
          // Smooth pan to follow. flyTo would zoom out and back in on every
          // poll, which reads as the map panicking rather than tracking.
          map.easeTo({
            center: [res.aircraft.lon, res.aircraft.lat],
            duration: reducedRef.current ? 0 : 1400,
            essential: true,
          });
        }
      }
    } catch {
      // Same reasoning as ambient: ride it out until the next poll.
    }
  }, [icao24]);

  useEffect(() => {
    if (mode !== 'track' || !ready || !icao24) return;

    void pollFocus();
    const id = setInterval(() => {
      if (!document.hidden) void pollFocus();
    }, 15_000);

    return () => clearInterval(id);
  }, [mode, ready, icao24, pollFocus]);

  // ── Animation loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!ready || mode === 'route') return;

    const tracker = trackerRef.current;

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);

      // Throttle the source write. The GPU redraws every frame regardless;
      // rebuilding a 500-feature GeoJSON object 60×/s is pure CPU waste.
      if (now - lastFrameRef.current < FRAME_INTERVAL_MS) return;
      lastFrameRef.current = now;

      const map = mapRef.current;
      if (!map || !styleReadyRef.current) return;

      tracker.step(now, reducedRef.current);

      if (mode === 'ambient') {
        (map.getSource(SOURCE_TRAFFIC) as maplibregl.GeoJSONSource | undefined)?.setData(
          tracker.toGeoJSON(),
        );
        return;
      }

      // track mode — one aircraft, plus a slow halo pulse that makes "this is
      // live data" legible without a caption.
      const craft = icao24 ? tracker.get(icao24) : undefined;
      const source = map.getSource(SOURCE_FOCUS) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      if (!craft) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      // 5s period, 0.10–0.34 opacity. Static when reduced motion is on.
      const pulse = reducedRef.current
        ? 0.22
        : 0.22 + 0.12 * Math.sin((now / 5000) * Math.PI * 2);

      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [craft.lon, craft.lat] },
            properties: { hdg: craft.hdg, pulse },
          },
        ],
      });
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [ready, mode, icao24]);

  // ── Fleet reset when the mode changes ─────────────────────────────────────

  useEffect(() => {
    trackerRef.current.clear();
  }, [mode, icao24]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-sunken ${className ?? ''}`}
        role="img"
        aria-label="Map unavailable"
      >
        <p className="px-6 text-center text-caption text-content-muted">
          Live map needs WebGL, which this browser has turned off.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={dim !== undefined ? { opacity: dim } : undefined}
        // The map is decoration in ambient mode and a data display otherwise;
        // either way it is not keyboard-operable content, so it is hidden from
        // assistive tech and the surrounding UI carries the information.
        aria-hidden="true"
      />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-sunken">
          <span className="text-caption text-content-muted">Loading map…</span>
        </div>
      )}
    </div>
  );
}
