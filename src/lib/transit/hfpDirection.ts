/**
 * Direction-id conversion between GTFS/Digitransit and HSL HFP.
 *
 *   Digitransit / GTFS directionId : 0 | 1
 *   HFP direction_id               : 1 | 2
 *
 * Mapping: 0 -> 1, 1 -> 2. Anything else is unknown and must not be guessed.
 * This is the single place where the conversion lives; never inline it in UI
 * or service code.
 */

export function toHfpDirection(gtfsDirectionId: number | null | undefined): number | null {
  if (gtfsDirectionId === 0) return 1;
  if (gtfsDirectionId === 1) return 2;
  return null;
}

export function toGtfsDirectionId(hfpDirection: number | null | undefined): number | null {
  if (hfpDirection === 1) return 0;
  if (hfpDirection === 2) return 1;
  return null;
}
