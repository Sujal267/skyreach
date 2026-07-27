# SkyReach

A full-stack flight booking platform where the map isn't decoration — you can watch your booked
flight's real-world counterpart move across the world in real time.

```
web/     Next.js 14 (App Router) · TypeScript · Tailwind · MapLibre GL · Framer Motion
server/  Node · Express · Prisma · PostgreSQL
```

---

## What is real and what is not

This matters more than any feature, so it is the first thing in the README rather than a
disclaimer at the bottom.

| Real | Invented |
|---|---|
| Aircraft positions, altitudes, headings, speeds — live ADS-B from the [OpenSky Network](https://opensky-network.org/) | Flight numbers, schedules, seat maps, fares |
| Airport IATA/ICAO codes and coordinates | Every booking, and the "airline" itself |
| Seat-hold concurrency, JWT refresh rotation, the whole booking state machine | Payment — simulated in-browser, no processor, no card transmitted |

OpenSky reports where aircraft *are*. It has no concept of a commercial flight — no schedule, no
seats, no price — so it could not power a booking flow even in principle. That is why there are
two data sources, and why they are never mixed.

---

## Running it

### 1. Database

You need a PostgreSQL connection string. [Neon](https://neon.tech) free tier is what this was
built against.

```bash
cd server
cp .env.example .env      # then paste your DATABASE_URL into .env
```

### 2. Server

```bash
cd server
npm install
npx prisma migrate dev --name init    # create the schema
npm run seed                          # ~500 flights, ~90k seats, live ICAO24 lookup
npm run dev                           # http://localhost:4000
```

The seed queries OpenSky for aircraft that are airborne *right now* and attaches three of them to
flights departing today. That is what makes the confirmation page show a genuinely moving
aeroplane. If OpenSky is unreachable it seeds without them and the app correctly falls back to
static route maps.

### 3. Web

```bash
cd web
npm install
npm run dev                           # http://localhost:3000
```

`web/.env.local` needs `NEXT_PUBLIC_API_URL=http://localhost:4000`.

### Demo account

`demo@skyreach.app` / `skyreach123`

---

## The three problems worth talking about

### Seat-hold concurrency

Two people click seat 14C in the same second. Exactly one must win, and the loser must find out
immediately — not at the payment step.

The naive read-then-write is a textbook race: both reads see AVAILABLE, both write, the seat sells
twice. The fix is to never read-then-write. The availability condition lives *inside* the WHERE
clause:

```sql
UPDATE "Seat" SET status='HELD', "heldUntil"=$2, "heldBy"=$3
WHERE id = $1 AND (status='AVAILABLE' OR ("status"='HELD' AND "heldUntil" < now()))
```

Postgres executes that atomically under a row lock and returns how many rows it changed: 1 for the
winner, 0 for everyone else. That count *is* the answer — no transaction, no advisory lock, no
retry loop. See `server/src/routes/seats.ts`.

Holds are soft. `heldUntil` lapses on its own, and every read path treats a lapsed hold as
available, so the cleanup cron is housekeeping rather than something correctness depends on.

### Why OpenSky is proxied, never called from the browser

Two reasons. The client secret must never reach a browser. And the free credit budget is finite —
so the server polls once every 15 seconds into one in-process cache, and every visitor is served
from it. A thousand concurrent users and one user cost exactly the same. See
`server/src/services/liveTraffic.ts`.

### Making 15-second polls look continuous

Moving markers once per poll gives you a map that twitches every 15 seconds and sits frozen in
between — the single thing that makes a live map look fake.

So between polls the client dead-reckons: an aircraft reporting a heading and a ground speed will,
to a good approximation, keep doing exactly that. Each marker advances along its own heading at
its own speed every frame. When the next poll lands, the prediction error is *eased* away over
1.8s rather than snapped, so motion is smooth and self-correcting rather than smooth and drifting.
Prediction stops entirely after 45 seconds without data — a marker that stops is honest, one that
confidently flies somewhere it isn't is not. See `web/src/components/map/interpolate.ts`.

At 500+ aircraft the rendering is a single MapLibre `symbol` layer over a GeoJSON source, on the
WebGL canvas. One `maplibregl.Marker` per aircraft would mean 500 DOM nodes and 500 CSS transforms
per frame, which cannot hold 30fps. There is no DOM element per aircraft anywhere in the codebase.

---

## Auth

Email/password, JWT in httpOnly cookies. Access tokens last 15 minutes; refresh tokens last 7 days
and **rotate on every use**.

Refresh tokens are opaque random strings, not JWTs, and only their SHA-256 hash is stored — a
database dump yields nothing usable. Presenting an already-spent token means either a replay or a
stolen token being used alongside the real one; we cannot tell which, so we assume the worst and
revoke that user's entire token family. See `server/src/lib/tokens.ts`.

One client-side subtlety: a page firing four requests at once with an expired token would trigger
four parallel refreshes, three of which would present a spent token and trip that exact reuse
detection. `web/src/lib/api.ts` shares a single in-flight refresh promise so rotation and
concurrency coexist.

---

## Money

Every monetary value is an integer count of cents — in the database, over the wire, and in
component state. `web/src/lib/format.ts` is the only place a value becomes a decimal, and only for
display. `grep -rn "price" --include=*.ts` and check: no floats.

---

## Accessibility

- Seat map is a real `role="grid"` with two-dimensional arrow-key navigation and roving tabindex,
  so it is one tab stop rather than 180. Each seat's accessible name states number, cabin, price
  and availability.
- Airport autocomplete is a WAI-ARIA combobox driven by `aria-activedescendant` — arrow keys move
  the highlight without moving focus, so each option is announced.
- Focus rings are restyled, never removed.
- `prefers-reduced-motion` is honoured in CSS *and* in JavaScript. Page transitions become
  opacity-only, staggers collapse, and — the one that CSS cannot reach — live map markers jump
  directly to each new position instead of interpolating.

---

## API

```
POST   /api/auth/signup | login | refresh | logout
GET    /api/auth/me

GET    /api/flights/airports
GET    /api/flights/popular
GET    /api/flights/search?from=&to=&date=&passengers=&cabin=
GET    /api/flights/:id

POST   /api/seats/:id/hold          (auth)
DELETE /api/seats/:id/hold          (auth)

POST   /api/bookings                (auth) → PENDING booking
POST   /api/bookings/:id/confirm    (auth) → CONFIRMED, seat BOOKED
GET    /api/bookings                (auth)
GET    /api/bookings/:id            (auth)
PATCH  /api/bookings/:id/cancel     (auth)

GET    /api/live-traffic            (public, cached)
GET    /api/live-traffic/:icao24    (public, cached)
```

---

## What would change for a real commercial version

- Real airline inventory through a GDS (Amadeus, Sabre) instead of a seeded schedule
- Stripe Payment Element with a signature-verified `payment_intent.succeeded` webhook driving the
  PENDING → CONFIRMED transition. A client asserting "I paid" is not evidence of payment; the
  confirm endpoint here exists only because payment is explicitly out of scope for this demo
- Seat maps from the operator's actual configuration rather than invented layouts
- The cleanup cron moved out of the API process into its own scheduled worker
