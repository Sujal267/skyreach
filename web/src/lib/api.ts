import type {
  Airport,
  Booking,
  ConfirmBookingResponse,
  CreateBookingResponse,
  FlightDetailResponse,
  PopularRoute,
  SearchResponse,
  Seat,
  SingleAircraftResponse,
  TrafficResponse,
  User,
} from './types';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'ERROR',
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the user could resolve this by choosing something else. */
  get isConflict() {
    return this.status === 409;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Internal: prevents the refresh retry from recursing. */
  _retried?: boolean;
}

/**
 * Silent refresh, deduplicated.
 *
 * A page that fires four requests at once with an expired access token would
 * otherwise trigger four parallel refreshes — and because refresh tokens
 * rotate, three of those would present an already-spent token and trip the
 * reuse detection, logging the user out. Sharing one in-flight promise is what
 * makes rotation and concurrency coexist.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this one all see the
      // same result before a fresh attempt becomes possible.
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, _retried, headers, ...rest } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    // Sends the httpOnly auth cookies cross-origin.
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !_retried && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) {
      return request<T>(path, { ...options, _retried: true });
    }
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.message ?? `Request failed (${res.status})`,
      err?.code ?? 'ERROR',
      err?.details,
    );
  }

  return payload as T;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export const auth = {
  signup: (body: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => request<{ user: User }>('/api/auth/signup', { method: 'POST', body }),

  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body }),

  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User }>('/api/auth/me'),
};

// ── Flights ─────────────────────────────────────────────────────────────────

export const flights = {
  airports: () => request<{ airports: Airport[] }>('/api/flights/airports'),

  popular: () => request<{ routes: PopularRoute[] }>('/api/flights/popular'),

  search: (params: {
    from: string;
    to: string;
    date: string;
    passengers?: number;
    cabin?: string;
  }) => {
    const qs = new URLSearchParams({
      from: params.from,
      to: params.to,
      date: params.date,
      passengers: String(params.passengers ?? 1),
      ...(params.cabin ? { cabin: params.cabin } : {}),
    });
    return request<SearchResponse>(`/api/flights/search?${qs}`);
  },

  detail: (id: string) => request<FlightDetailResponse>(`/api/flights/${id}`),
};

// ── Seats ───────────────────────────────────────────────────────────────────

export const seats = {
  hold: (seatId: string) =>
    request<{ seat: Seat; holdMinutes: number }>(`/api/seats/${seatId}/hold`, {
      method: 'POST',
    }),

  release: (seatId: string) =>
    request<void>(`/api/seats/${seatId}/hold`, { method: 'DELETE' }),
};

// ── Bookings ────────────────────────────────────────────────────────────────

export const bookings = {
  create: (body: { seatId: string; passengerName: string; passengerEmail: string }) =>
    request<CreateBookingResponse>('/api/bookings', { method: 'POST', body }),

  confirm: (id: string, body: { cardLast4?: string } = {}) =>
    request<ConfirmBookingResponse>(`/api/bookings/${id}/confirm`, {
      method: 'POST',
      body,
    }),

  list: () => request<{ bookings: Booking[] }>('/api/bookings'),

  get: (id: string) => request<{ booking: Booking }>(`/api/bookings/${id}`),

  cancel: (id: string) =>
    request<{
      booking: Booking;
      refund: { simulated: boolean; amountCents: number; message: string };
    }>(`/api/bookings/${id}/cancel`, { method: 'PATCH' }),
};

// ── Live traffic ────────────────────────────────────────────────────────────

export const live = {
  traffic: (opts: { bbox?: [number, number, number, number]; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.bbox) qs.set('bbox', opts.bbox.join(','));
    if (opts.limit) qs.set('limit', String(opts.limit));
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<TrafficResponse>(`/api/live-traffic${suffix}`);
  },

  aircraft: (icao24: string) =>
    request<SingleAircraftResponse>(`/api/live-traffic/${icao24}`),
};

export { API_BASE };
