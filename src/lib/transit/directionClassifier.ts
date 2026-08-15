/**
 * Direction classification based on actual trip/headsign/direction data.
 * Never keyed on commuter line letters, so new lines stopping at Oulunkylä
 * keep working.
 */

import type { DirectionGroup, RawStoptime, TransitMode } from "./types";
import { TRAM_LINE } from "./config";

/** Destinations that are (or lead to) Helsinki Central for commuter trains. */
const HELSINKI_DESTINATIONS = ["helsinki", "helsingfors", "keskusta", "central"];

/** Well-known northern destinations of commuter trains via Oulunkylä. */
const NORTH_DESTINATIONS = [
  "malmi",
  "malm",
  "tikkurila",
  "dickursby",
  "kerava",
  "kervo",
  "riihimäki",
  "riihimaki",
  "lahti",
  "hyvinkää",
  "hyvinkaa",
  "vantaankoski",
  "lentoasema",
  "airport",
  "flygplatsen",
  "myyrmäki",
  "myyrmaki",
  "kirkkonummi",
  "siuntio",
  "karjaa",
  "jokela",
  "järvenpää",
  "jarvenpaa",
  "korso",
  "koivukylä",
  "koivukyla",
  "hiekkaharju",
  "puistola",
  "tapanila",
  "pukinmäki",
  "pukinmaki",
];

const KEILANIEMI_DESTINATIONS = ["keilaniemi", "kägeludden", "kageludden", "otaniemi"];
const ITAKESKUS_DESTINATIONS = ["itäkeskus", "itakeskus", "östra centrum", "ostra centrum"];

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function matchesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function modeFromRoute(mode: string | null | undefined): TransitMode | null {
  const m = normalize(mode);
  if (m === "rail" || m === "train") return "TRAIN";
  if (m === "tram") return "TRAM";
  return null;
}

/**
 * Classify a stoptime into one of the four board groups.
 * Returns null when the departure does not belong on this board.
 */
export function classifyDirection(stoptime: RawStoptime): DirectionGroup | null {
  const route = stoptime.trip?.route ?? null;
  const mode = modeFromRoute(route?.mode);
  if (!mode) return null;

  const headsign = normalize(stoptime.headsign || stoptime.trip?.tripHeadsign);
  const longName = normalize(route?.longName);
  const directionId = stoptime.trip?.directionId ?? null;

  if (mode === "TRAM") {
    if (normalize(route?.shortName) !== TRAM_LINE) return null;
    if (matchesAny(headsign, KEILANIEMI_DESTINATIONS)) return "KEILANIEMI";
    if (matchesAny(headsign, ITAKESKUS_DESTINATIONS)) return "ITAKESKUS";
    // Fall back to route long name combined with directionId ("A - B").
    const [first, second] = longName.split(/\s*[-–]\s*/);
    if (directionId === 0 || directionId === 1) {
      const target = directionId === 0 ? second : first;
      if (matchesAny(normalize(target), KEILANIEMI_DESTINATIONS)) return "KEILANIEMI";
      if (matchesAny(normalize(target), ITAKESKUS_DESTINATIONS)) return "ITAKESKUS";
    }
    return null;
  }

  // Commuter trains.
  if (matchesAny(headsign, HELSINKI_DESTINATIONS)) return "HELSINKI";
  if (matchesAny(headsign, NORTH_DESTINATIONS)) return "NORTH";

  // Ring-rail trains ("Lentoasema kautta ..." etc.) and unknown headsigns:
  // use route long name plus directionId, which is derived from real trip data.
  const [first, second] = longName.split(/\s*[-–]\s*/);
  if (directionId === 0 || directionId === 1) {
    const target = normalize(directionId === 0 ? second : first);
    if (matchesAny(target, HELSINKI_DESTINATIONS)) return "HELSINKI";
    if (matchesAny(target, NORTH_DESTINATIONS)) return "NORTH";
  }
  return null;
}
