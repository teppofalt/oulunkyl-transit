/**
 * Pure board-assembly logic, kept outside React so the lifecycle and mode rules
 * are directly testable.
 */

import {
  HFP_MAX_MONITORED_TRIPS,
  HFP_MONITORING_HORIZON_MINUTES,
  LIVE_HORIZON_MINUTES,
  FULL_HORIZON_MINUTES,
  PASSED_GRACE_SECONDS,
  STALE_DATA_MS,
} from "./config";
import { buildMonitoredTrip, type MonitoredTrip } from "./hfpService";
import type { Departure, DirectionGroup } from "./types";

/** LIVE = now → +60 min with realtime + HFP. DAY = 24 h timetable browser. */
export type BoardMode = "LIVE" | "DAY";

export const DIRECTION_ORDER: DirectionGroup[] = [
  "HELSINKI",
  "NORTH",
  "KEILANIEMI",
  "ITAKESKUS",
];

export function horizonForMode(mode: BoardMode): number {
  return mode === "DAY" ? FULL_HORIZON_MINUTES : LIVE_HORIZON_MINUTES;
}

/** Rows shown per direction before "Näytä myöhemmät" is used. */
export const BASE_ROWS_PER_DIRECTION = 3;
/** Additional rows revealed per press. */
export const ROWS_PER_STEP = 3;

export function rowsPerDirection(mode: BoardMode, steps: number): number {
  if (mode === "DAY") return Number.POSITIVE_INFINITY;
  return BASE_ROWS_PER_DIRECTION + steps * ROWS_PER_STEP;
}

export function groupByDirection(departures: Departure[]): Record<DirectionGroup, Departure[]> {
  const map: Record<DirectionGroup, Departure[]> = {
    HELSINKI: [],
    NORTH: [],
    KEILANIEMI: [],
    ITAKESKUS: [],
  };
  for (const departure of departures) map[departure.direction].push(departure);
  return map;
}

/** True when more departures exist than are currently rendered. */
export function hasHiddenDepartures(
  grouped: Record<DirectionGroup, Departure[]>,
  limit: number,
): boolean {
  return DIRECTION_ORDER.some((direction) => grouped[direction].length > limit);
}

/**
 * Trips eligible for HFP monitoring.
 *
 * Rules (battery/CPU): only in LIVE mode, only while the page is visible, only
 * inside the 30-minute monitoring horizon, never the 24 h dataset, and always
 * capped.
 */
export function selectMonitoredTrips(
  departures: Departure[],
  nowMs: number,
  opts: { mode: BoardMode; visible: boolean },
): MonitoredTrip[] {
  if (opts.mode !== "LIVE" || !opts.visible) return [];
  const limit = nowMs + HFP_MONITORING_HORIZON_MINUTES * 60_000;
  const floor = nowMs - PASSED_GRACE_SECONDS * 1000;
  return departures
    .filter((d) => !d.cancelled && d.effectiveArrival >= floor && d.effectiveArrival <= limit)
    .slice(0, HFP_MAX_MONITORED_TRIPS)
    .map(buildMonitoredTrip)
    .filter((trip): trip is MonitoredTrip => trip !== null);
}

/** Stable signature used to avoid redundant subscription reconciliation. */
export function tripSignature(trips: MonitoredTrip[]): string {
  return trips.map((t) => `${t.tripId}@${t.topic}`).join("|");
}

/** Cached/last-successful data older than 2× the freshness budget is stale. */
export function isStale(fetchedAt: number | null, nowMs: number): boolean {
  if (fetchedAt === null) return true;
  return nowMs - fetchedAt > STALE_DATA_MS * 2;
}
