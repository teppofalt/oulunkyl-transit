import { describe, expect, it } from "vitest";

import {
  BASE_ROWS_PER_DIRECTION,
  ROWS_PER_STEP,
  groupByDirection,
  hasHiddenDepartures,
  horizonForMode,
  isStale,
  rowsPerDirection,
  selectMonitoredTrips,
  tripSignature,
} from "../boardLogic";
import { EMPTY_MOVEMENT, type Departure } from "../types";

const NOW = Date.UTC(2026, 7, 16, 9, 0, 0);
const SERVICE_DAY = Math.floor(Date.UTC(2026, 7, 16, 0, 0, 0) / 1000) - 3 * 3600;

function departure(minutesAhead: number, overrides: Partial<Departure> = {}): Departure {
  const arrival = NOW + minutesAhead * 60_000;
  return {
    id: `d${minutesAhead}${overrides.direction ?? ""}`,
    mode: "TRAM",
    line: "15",
    direction: "KEILANIEMI",
    headsign: "Keilaniemi",
    scheduledArrival: arrival,
    realtimeArrival: null,
    effectiveArrival: arrival,
    delaySeconds: null,
    realtimeAvailable: false,
    realtimeState: null,
    cancelled: false,
    platformCode: null,
    stopId: "HSL:1284401",
    digitransitTripId: `trip-${minutesAhead}-${overrides.direction ?? "K"}`,
    digitransitRouteId: "HSL:1015",
    directionId: 0,
    serviceDay: SERVICE_DAY,
    tripStartSeconds: 8 * 3600 + 45 * 60,
    tripStartServiceDay: SERVICE_DAY,
    scheduledArrivalSeconds: 9 * 3600,
    movement: EMPTY_MOVEMENT,
    fintrafficTrainNumber: null,
    fintrafficDepartureDate: null,
    fintrafficMatchConfidence: "NONE",
    ...overrides,
  };
}

describe("board modes", () => {
  it("uses a 60-minute live horizon and a 24-hour timetable horizon", () => {
    expect(horizonForMode("LIVE")).toBe(60);
    expect(horizonForMode("DAY")).toBe(24 * 60);
  });

  it("reveals more rows per 'Näytä myöhemmät' press without changing the horizon", () => {
    expect(rowsPerDirection("LIVE", 0)).toBe(BASE_ROWS_PER_DIRECTION);
    expect(rowsPerDirection("LIVE", 2)).toBe(BASE_ROWS_PER_DIRECTION + 2 * ROWS_PER_STEP);
    expect(rowsPerDirection("DAY", 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("detects when departures are hidden behind the row limit", () => {
    const grouped = groupByDirection([departure(2), departure(5), departure(9), departure(12)]);
    expect(grouped.KEILANIEMI).toHaveLength(4);
    expect(hasHiddenDepartures(grouped, 3)).toBe(true);
    expect(hasHiddenDepartures(grouped, 4)).toBe(false);
  });
});

describe("HFP monitoring selection", () => {
  const board = [departure(3), departure(20), departure(45), departure(58)];

  it("monitors only trips inside the 30-minute horizon in live mode", () => {
    const trips = selectMonitoredTrips(board, NOW, { mode: "LIVE", visible: true });
    expect(trips.map((t) => t.tripId)).toEqual(["trip-3-K", "trip-20-K"]);
  });

  it("creates no monitoring for the 24-hour timetable dataset", () => {
    expect(selectMonitoredTrips(board, NOW, { mode: "DAY", visible: true })).toEqual([]);
  });

  it("creates no monitoring while the page is hidden", () => {
    expect(selectMonitoredTrips(board, NOW, { mode: "LIVE", visible: false })).toEqual([]);
  });

  it("drops departures that are already in the past", () => {
    const trips = selectMonitoredTrips([departure(-5), departure(4)], NOW, {
      mode: "LIVE",
      visible: true,
    });
    expect(trips.map((t) => t.tripId)).toEqual(["trip-4-K"]);
  });

  it("skips cancelled trips", () => {
    const trips = selectMonitoredTrips([departure(4, { cancelled: true })], NOW, {
      mode: "LIVE",
      visible: true,
    });
    expect(trips).toEqual([]);
  });

  it("caps the monitored trip count", () => {
    const many = Array.from({ length: 30 }, (_, i) => departure(i % 25));
    const trips = selectMonitoredTrips(many, NOW, { mode: "LIVE", visible: true });
    expect(trips.length).toBeLessThanOrEqual(12);
  });

  it("produces a stable signature so reconciliation is not repeated", () => {
    const a = selectMonitoredTrips(board, NOW, { mode: "LIVE", visible: true });
    const b = selectMonitoredTrips(board, NOW + 1_000, { mode: "LIVE", visible: true });
    expect(tripSignature(a)).toBe(tripSignature(b));
  });
});

describe("staleness", () => {
  it("marks missing and old data as stale but not fresh data", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale(NOW - 5_000, NOW)).toBe(false);
    expect(isStale(NOW - 5 * 60_000, NOW)).toBe(true);
  });
});
