/**
 * Wire types — the exact shapes the Express API returns.
 * Kept hand-written rather than generated so the client stays readable, and
 * deliberately narrow: if a field is not here, the UI does not depend on it.
 */

export type Cabin = 'ECONOMY' | 'PREMIUM' | 'BUSINESS';
export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type LiveStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'DELAYED'
  | 'IN_AIR'
  | 'LANDED'
  | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface Airport {
  id: string;
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface PopularRoute {
  key: string;
  origin: Airport;
  destination: Airport;
  lowestPriceCents: number;
  departuresToday: number;
  seatsAvailable: number;
}

export interface FlightSummary {
  id: string;
  flightNumber: string;
  origin: Airport;
  destination: Airport;
  aircraft: { id: string; model: string; totalSeats: number };
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  basePriceCents: number;
  fromPriceCents: number;
  delayMinutes: number;
  isTracked: boolean;
  seatsLeft: number;
  cabinAvailability: Partial<Record<Cabin, { count: number; fromCents: number }>>;
}

export interface SearchResponse {
  origin: Airport;
  destination: Airport;
  date: string;
  passengers: number;
  count: number;
  results: FlightSummary[];
}

// ── Seat map ────────────────────────────────────────────────────────────────

export interface CabinSection {
  cabin: Cabin;
  rowStart: number;
  rowEnd: number;
  /** Column letters with `|` marking an aisle, e.g. "ABC|DEF". */
  layout: string;
  priceMultiplier: number;
  label: string;
}

export interface SeatMapDefinition {
  model: string;
  cabins: CabinSection[];
  exitRows: number[];
  missingRows?: number[];
}

export interface Seat {
  id: string;
  seatNumber: string;
  cabin: Cabin;
  status: SeatStatus;
  priceCents: number;
  heldByYou: boolean;
  holdExpiresAt: string | null;
}

export interface FlightDetail {
  id: string;
  flightNumber: string;
  origin: Airport;
  destination: Airport;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  basePriceCents: number;
  delayMinutes: number;
  isTracked: boolean;
  aircraft: {
    id: string;
    model: string;
    totalSeats: number;
    seatMap: SeatMapDefinition;
  };
}

export interface FlightDetailResponse {
  flight: FlightDetail;
  seats: Seat[];
}

// ── Bookings ────────────────────────────────────────────────────────────────

export interface BookingFlight {
  id: string;
  flightNumber: string;
  departAt: string;
  arriveAt: string;
  delayMinutes: number;
  trackingIcao24: string | null;
  aircraft: { model: string };
  origin: Pick<Airport, 'iata' | 'city' | 'name' | 'lat' | 'lon' | 'timezone'>;
  destination: Pick<Airport, 'iata' | 'city' | 'name' | 'lat' | 'lon' | 'timezone'>;
}

export interface Booking {
  id: string;
  bookingRef: string;
  status: BookingStatus;
  passengerName: string;
  passengerEmail: string;
  totalCents: number;
  paymentRef: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  seat: { id: string; seatNumber: string; cabin: Cabin; priceCents: number };
  flight: BookingFlight;
  liveStatus: LiveStatus;
  trackable: boolean;
}

export interface PriceBreakdown {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export interface CreateBookingResponse {
  booking: Booking;
  breakdown: PriceBreakdown;
  payment: { intentRef: string; simulated: boolean; expiresInMinutes: number };
}

export interface ConfirmBookingResponse {
  booking: Booking;
  receipt?: { simulated: boolean; cardLast4: string; paidAt: string | null };
  alreadyConfirmed?: boolean;
}

// ── Live traffic ────────────────────────────────────────────────────────────

export interface LiveAircraft {
  id: string;
  callsign: string | null;
  /** Degrees. */
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

export interface TrafficResponse {
  fetchedAt: number;
  stale: boolean;
  source: 'opensky' | 'unavailable';
  pollSeconds: number;
  count: number;
  aircraft: LiveAircraft[];
}

export interface SingleAircraftResponse {
  icao24: string;
  aircraft: LiveAircraft | null;
  airborne: boolean;
  fetchedAt: number;
}
