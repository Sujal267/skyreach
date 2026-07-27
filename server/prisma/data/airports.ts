/**
 * Real airports — real IATA/ICAO codes and real coordinates.
 *
 * The codes and positions are genuine so the map reads as legitimate and so
 * route lines land where a viewer expects them to. The *schedules* built on top
 * of these (see seed.ts) are entirely invented, and the case study says so.
 */
export interface AirportSeed {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
}

export const AIRPORTS: AirportSeed[] = [
  {
    iata: 'JFK',
    icao: 'KJFK',
    name: 'John F. Kennedy International',
    city: 'New York',
    country: 'United States',
    lat: 40.6413,
    lon: -73.7781,
    timezone: 'America/New_York',
  },
  {
    iata: 'LHR',
    icao: 'EGLL',
    name: 'Heathrow',
    city: 'London',
    country: 'United Kingdom',
    lat: 51.47,
    lon: -0.4543,
    timezone: 'Europe/London',
  },
  {
    iata: 'CDG',
    icao: 'LFPG',
    name: 'Charles de Gaulle',
    city: 'Paris',
    country: 'France',
    lat: 49.0097,
    lon: 2.5479,
    timezone: 'Europe/Paris',
  },
  {
    iata: 'DXB',
    icao: 'OMDB',
    name: 'Dubai International',
    city: 'Dubai',
    country: 'United Arab Emirates',
    lat: 25.2532,
    lon: 55.3657,
    timezone: 'Asia/Dubai',
  },
  {
    iata: 'SIN',
    icao: 'WSSS',
    name: 'Changi',
    city: 'Singapore',
    country: 'Singapore',
    lat: 1.3644,
    lon: 103.9915,
    timezone: 'Asia/Singapore',
  },
  {
    iata: 'BLR',
    icao: 'VOBL',
    name: 'Kempegowda International',
    city: 'Bengaluru',
    country: 'India',
    lat: 13.1986,
    lon: 77.7066,
    timezone: 'Asia/Kolkata',
  },
  {
    iata: 'FRA',
    icao: 'EDDF',
    name: 'Frankfurt am Main',
    city: 'Frankfurt',
    country: 'Germany',
    lat: 50.0379,
    lon: 8.5622,
    timezone: 'Europe/Berlin',
  },
  {
    iata: 'SFO',
    icao: 'KSFO',
    name: 'San Francisco International',
    city: 'San Francisco',
    country: 'United States',
    lat: 37.6213,
    lon: -122.379,
    timezone: 'America/Los_Angeles',
  },
];

/**
 * Routes we actually schedule. Distances are great-circle nautical miles,
 * used to derive both block time and a believable base fare.
 */
export interface RouteSeed {
  from: string;
  to: string;
  /** Flights per day on this route. */
  frequency: number;
  /** Base fare in integer cents for the cheapest economy seat. */
  baseFareCents: number;
  featured?: boolean;
}

export const ROUTES: RouteSeed[] = [
  { from: 'JFK', to: 'LHR', frequency: 3, baseFareCents: 44_900, featured: true },
  { from: 'LHR', to: 'JFK', frequency: 3, baseFareCents: 46_500 },
  { from: 'JFK', to: 'CDG', frequency: 2, baseFareCents: 48_200, featured: true },
  { from: 'CDG', to: 'JFK', frequency: 2, baseFareCents: 49_000 },
  { from: 'LHR', to: 'DXB', frequency: 2, baseFareCents: 52_400, featured: true },
  { from: 'DXB', to: 'LHR', frequency: 2, baseFareCents: 51_800 },
  { from: 'DXB', to: 'BLR', frequency: 2, baseFareCents: 21_500, featured: true },
  { from: 'BLR', to: 'DXB', frequency: 2, baseFareCents: 22_100 },
  { from: 'SIN', to: 'BLR', frequency: 1, baseFareCents: 28_900 },
  { from: 'BLR', to: 'SIN', frequency: 1, baseFareCents: 29_400 },
  { from: 'FRA', to: 'SIN', frequency: 1, baseFareCents: 68_000 },
  { from: 'SIN', to: 'FRA', frequency: 1, baseFareCents: 69_500 },
  { from: 'SFO', to: 'JFK', frequency: 3, baseFareCents: 18_900 },
  { from: 'JFK', to: 'SFO', frequency: 3, baseFareCents: 19_400 },
  { from: 'LHR', to: 'FRA', frequency: 2, baseFareCents: 12_600 },
  { from: 'FRA', to: 'LHR', frequency: 2, baseFareCents: 12_900 },
  { from: 'CDG', to: 'DXB', frequency: 1, baseFareCents: 47_300 },
  { from: 'SFO', to: 'SIN', frequency: 1, baseFareCents: 82_000 },
];

/** Great-circle distance in nautical miles. */
export function distanceNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Block time from distance: cruise at ~460kt plus 35 minutes of taxi, climb
 * and descent. Close enough to real timetables that nothing looks off.
 */
export function blockMinutes(nm: number): number {
  return Math.round((nm / 460) * 60 + 35);
}
