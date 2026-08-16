/**
 * Timezone-safe time helpers.
 *
 * Digitransit returns `serviceDay` as epoch seconds for the start of the service
 * day plus GTFS seconds offsets that may exceed 24 h. Per the GTFS spec those
 * offsets are counted from "noon minus 12 hours" of the service day, which keeps
 * local clock times correct on the two daylight-saving transition days — plain
 * epoch addition would be one hour off on exactly those days.
 */

export const HELSINKI_TZ = "Europe/Helsinki";

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HELSINKI_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Helsinki UTC offset (ms) in effect at a given instant. */
function helsinkiOffsetMs(instant: number): number {
  const parts = partsFormatter.formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Epoch ms of local noon in Helsinki on the calendar date of `instant`. */
function helsinkiNoonMs(instant: number): number {
  const parts = partsFormatter.formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const naiveNoon = Date.UTC(get("year"), get("month") - 1, get("day"), 12, 0, 0);
  // Two passes settle the offset even when the guess lands on the other side of
  // a transition.
  let noon = naiveNoon - helsinkiOffsetMs(naiveNoon);
  noon = naiveNoon - helsinkiOffsetMs(noon);
  return noon;
}

/** Absolute epoch ms for a GTFS (serviceDay, secondsFromMidnight) pair. */
export function gtfsToEpochMs(serviceDay: number, secondsFromMidnight: number): number {
  const anchor = helsinkiNoonMs(serviceDay * 1000) - 12 * 3600 * 1000;
  return anchor + secondsFromMidnight * 1000;
}


const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HELSINKI_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const clockWithSecondsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HELSINKI_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** HH:MM in Europe/Helsinki. */
export function formatClock(epochMs: number): string {
  return clockFormatter.format(new Date(epochMs));
}

/** HH:MM:SS in Europe/Helsinki. */
export function formatClockWithSeconds(epochMs: number): string {
  return clockWithSecondsFormatter.format(new Date(epochMs));
}

/** YYYY-MM-DD in Europe/Helsinki (used for Fintraffic departureDate). */
export function helsinkiDateString(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HELSINKI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochMs));
  return parts;
}

/**
 * Minutes remaining until `targetMs`. Rounded up so a departure in 10 s reads
 * "1 min"; clamped at 0 so "-1 min" can never appear.
 */
export function minutesUntil(targetMs: number, nowMs: number): number {
  const diff = targetMs - nowMs;
  if (diff <= 0) return 0;
  return Math.ceil(diff / 60_000);
}

/** GTFS HH:MM:SS (may exceed 24 h) from seconds-from-service-day-start. */
export function gtfsSecondsToHms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** HFP / Fintraffic style HH:mm start time inside the operating day. */
export function gtfsSecondsToHhmm(seconds: number): string {
  const normalized = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(normalized / 3600);
  const m = Math.floor((normalized % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Distance in metres between two WGS84 points (haversine). */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
