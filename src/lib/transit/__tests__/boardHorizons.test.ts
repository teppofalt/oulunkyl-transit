import { describe, expect, it } from "vitest";

import { horizonForMode, selectMonitoredTrips, uiTickForMode } from "../boardLogic";
import { HFP_MONITORING_HORIZON_MINUTES, UI_TICK_MS } from "../config";
import { EMPTY_MOVEMENT, type Departure } from "../types";

const NOW = Date.UTC(2026, 7, 16, 9, 0, 0);
const SERVICE_DAY = Math.floor(Date.UTC(2026, 7, 16, 0, 0, 0) / 1000) - 3 * 3600;

function departure(minutesAhead: number): Departure {
  const arrival = NOW + minutesAhead * 60_000;
  return {
    id: `d${minutesAhead}`,
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
    digitransitTripId: `trip-${minutesAhead}`,
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
  };
}

describe("board horizons", () => {
  it("uses 60 / 180 / 1440 minute horizons", () => {
    expect(horizonForMode("LIVE")).toBe(60);
    expect(horizonForMode("EXTENDED")).toBe(180);
    expect(horizonForMode("DAY")).toBe(1440);
  });

  it("keeps HFP monitoring at 30 minutes in the extended 180-minute mode", () => {
    expect(HFP_MONITORING_HORIZON_MINUTES).toBe(30);
    const departures = [departure(5), departure(29), departure(45), departure(120)];
    const monitored = selectMonitoredTrips(departures, NOW, { mode: "EXTENDED", visible: true });
    expect(monitored.length).toBeGreaterThan(0);
    expect(monitored.length).toBeLessThanOrEqual(2);
  });

  it("disables HFP monitoring in the 24 h timetable mode", () => {
    const monitored = selectMonitoredTrips([departure(5)], NOW, { mode: "DAY", visible: true });
    expect(monitored).toHaveLength(0);
  });

  it("slows the UI tick in long timetable modes", () => {
    expect(uiTickForMode("LIVE")).toBe(UI_TICK_MS);
    expect(uiTickForMode("EXTENDED")).toBeGreaterThanOrEqual(UI_TICK_MS);
    expect(uiTickForMode("DAY")).toBeGreaterThan(uiTickForMode("EXTENDED"));
  });
});
