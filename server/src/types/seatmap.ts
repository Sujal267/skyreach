/**
 * Seat map definition — the JSON stored on `Aircraft.seatMap`.
 *
 * This is a *layout* description, not seat inventory. Inventory lives in the
 * `Seat` table (one row per physical seat per flight) because status and price
 * are per-flight, not per-aircraft-type. The seed script expands a definition
 * into Seat rows; the client renders the fuselage from this same definition so
 * the visual grid and the database can never drift apart.
 */

export type CabinName = 'ECONOMY' | 'PREMIUM' | 'BUSINESS';

export interface CabinSection {
  cabin: CabinName;
  /** Inclusive row numbers, matching the numbers printed above real seats. */
  rowStart: number;
  rowEnd: number;
  /**
   * Column letters with `|` marking an aisle, e.g. "AB|CD" (2-2 business)
   * or "ABC|DEF" (3-3 economy). Column letters skip "I" as airlines do.
   */
  layout: string;
  /** Multiplied against `Flight.basePriceCents`, then rounded to integer cents. */
  priceMultiplier: number;
  label: string;
}

export interface SeatMapDefinition {
  model: string;
  /** Fuselage width in seat columns, used to size the SVG shell. */
  cabins: CabinSection[];
  /** Rows with extra legroom — flagged in the UI and priced up slightly. */
  exitRows: number[];
  /** Rows that physically do not exist (galley/lavatory gaps in the tube). */
  missingRows?: number[];
}

/** Column letters for a section, aisles stripped. "ABC|DEF" -> [A,B,C,D,E,F] */
export function columnsOf(layout: string): string[] {
  return layout.split('').filter((c) => c !== '|');
}

/** Total seats a definition expands to. Used to validate `Aircraft.totalSeats`. */
export function countSeats(def: SeatMapDefinition): number {
  const missing = new Set(def.missingRows ?? []);
  let total = 0;
  for (const section of def.cabins) {
    const cols = columnsOf(section.layout).length;
    for (let row = section.rowStart; row <= section.rowEnd; row++) {
      if (!missing.has(row)) total += cols;
    }
  }
  return total;
}

/** Exit rows carry a modest premium — real airlines charge for the legroom. */
export const EXIT_ROW_SURCHARGE_CENTS = 1500;

export function seatPriceCents(
  basePriceCents: number,
  section: CabinSection,
  row: number,
  exitRows: number[],
): number {
  const base = Math.round(basePriceCents * section.priceMultiplier);
  const surcharge = exitRows.includes(row) ? EXIT_ROW_SURCHARGE_CENTS : 0;
  return base + surcharge;
}
