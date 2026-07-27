import type { SeatMapDefinition } from '../../src/types/seatmap.js';
import { countSeats } from '../../src/types/seatmap.js';

/**
 * Invented seat layouts modelled on the real thing. Row counts, cabin splits
 * and exit-row placement follow how these airframes are actually configured,
 * which is what makes the seat map feel like an aircraft rather than a grid.
 */
export interface AircraftSeed {
  model: string;
  seatMap: SeatMapDefinition;
  /** Nautical-mile ceiling — used to assign airframes to routes sensibly. */
  rangeNm: number;
}

const a320neo: SeatMapDefinition = {
  model: 'Airbus A320neo',
  cabins: [
    {
      cabin: 'BUSINESS',
      rowStart: 1,
      rowEnd: 3,
      layout: 'AB|EF',
      priceMultiplier: 2.8,
      label: 'Business',
    },
    {
      cabin: 'PREMIUM',
      rowStart: 4,
      rowEnd: 7,
      layout: 'ABC|DEF',
      priceMultiplier: 1.55,
      label: 'Premium',
    },
    {
      cabin: 'ECONOMY',
      rowStart: 8,
      rowEnd: 30,
      layout: 'ABC|DEF',
      priceMultiplier: 1.0,
      label: 'Economy',
    },
  ],
  exitRows: [12, 13],
  missingRows: [],
};

const b737max8: SeatMapDefinition = {
  model: 'Boeing 737 MAX 8',
  cabins: [
    {
      cabin: 'BUSINESS',
      rowStart: 1,
      rowEnd: 3,
      layout: 'AB|EF',
      priceMultiplier: 2.7,
      label: 'Business',
    },
    {
      cabin: 'PREMIUM',
      rowStart: 4,
      rowEnd: 6,
      layout: 'ABC|DEF',
      priceMultiplier: 1.5,
      label: 'Premium',
    },
    {
      cabin: 'ECONOMY',
      rowStart: 7,
      rowEnd: 29,
      layout: 'ABC|DEF',
      priceMultiplier: 1.0,
      label: 'Economy',
    },
  ],
  exitRows: [16, 17],
  missingRows: [],
};

const b787_9: SeatMapDefinition = {
  model: 'Boeing 787-9 Dreamliner',
  cabins: [
    {
      cabin: 'BUSINESS',
      rowStart: 1,
      rowEnd: 6,
      layout: 'AC|DG|HK',
      priceMultiplier: 3.4,
      label: 'Business',
    },
    {
      cabin: 'PREMIUM',
      rowStart: 10,
      rowEnd: 14,
      layout: 'ABC|DEF|GHK',
      priceMultiplier: 1.7,
      label: 'Premium',
    },
    {
      cabin: 'ECONOMY',
      rowStart: 20,
      rowEnd: 42,
      layout: 'ABC|DEF|GHK',
      priceMultiplier: 1.0,
      label: 'Economy',
    },
  ],
  exitRows: [20, 30],
  missingRows: [],
};

const a350_900: SeatMapDefinition = {
  model: 'Airbus A350-900',
  cabins: [
    {
      cabin: 'BUSINESS',
      rowStart: 1,
      rowEnd: 7,
      layout: 'AC|DG|HK',
      priceMultiplier: 3.6,
      label: 'Business',
    },
    {
      cabin: 'PREMIUM',
      rowStart: 11,
      rowEnd: 15,
      layout: 'ABC|DEF|GHK',
      priceMultiplier: 1.75,
      label: 'Premium',
    },
    {
      cabin: 'ECONOMY',
      rowStart: 21,
      rowEnd: 45,
      layout: 'ABC|DEF|GHK',
      priceMultiplier: 1.0,
      label: 'Economy',
    },
  ],
  exitRows: [21, 32],
  missingRows: [],
};

export const AIRCRAFT: AircraftSeed[] = [
  { model: a320neo.model, seatMap: a320neo, rangeNm: 3400 },
  { model: b737max8.model, seatMap: b737max8, rangeNm: 3550 },
  { model: b787_9.model, seatMap: b787_9, rangeNm: 7635 },
  { model: a350_900.model, seatMap: a350_900, rangeNm: 8100 },
];

/** Total seats per airframe, derived rather than hand-typed so it can't drift. */
export function totalSeatsFor(seed: AircraftSeed): number {
  return countSeats(seed.seatMap);
}
