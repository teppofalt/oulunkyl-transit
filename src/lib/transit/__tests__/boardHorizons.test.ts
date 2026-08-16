import { describe, expect, it } from "vitest";

import { horizonForMode, selectMonitoredTrips, uiTickForMode } from "../boardLogic";
import { HFP_MONITORING_HORIZON_MINUTES, UI_TICK_MS } from "../config";
import type { Departure } from "../types";

const NOW = Date.UTC(2026, 7, 15, 5, 0, 0);

function departure(minutes: number, index: number): Departure {
  return {
    id: `dep-${index}`,
    digitransitTripId: `trip-${index}`,
    direction: "HELSINKI",
    mode: "RAIL",
    lineLabel: "K",
    routeGtfsId: "HSL:3001K",
    gtfsDirectionId: 0,
    headsign: "Helsinki",
    scheduledArrival: NOW + minutes * 60_000,
    effectiveArrival: NOW + minutes * 60_000,
    delaySeconds: 0,
    realtime: true,
    cancelled: false,
    serviceDay: NOW / 1000,
    tripStartSeconds: 8 * 3600,
    movement: undefined,
  } as unknown as Departure;
}

describe("board horizons", () => {
  it("uses 60 / 180 / 1440 minute horizons", () => {
    expect(horizonForMode("LIVE")).toBe(60);
    expect(horizonForMode("EXTENDED")).toBe(180);
    expect(horizonForMode("DAY")).toBe(1440);
  });

  it("keeps HFP monitoring at 30 minutes in the extended 180-minute mode", () => {
    expect(HFP_MONITORING_HORIZON_MINUTES).toBe(30);
    const departures = [departure(5, 1), departure(29, 2), departure(45, 3), departure(120, 4)];
    const monitored = selectMonitoredTrips(departures, NOW, { mode: "EXTENDED", visible: true });
    expect(monitored.length).toBeGreaterThan(0);
    expect(monitored.length).toBeLessThanOrEqual(2);
  });

  it("disables HFP monitoring in the 24 h timetable mode", () => {
    const monitored = selectMonitoredTrips([departure(5, 1)], NOW, { mode: "DAY", visible: true });
    expect(monitored).toHaveLength(0);
  });

  it("slows the UI tick in long timetable modes", () => {
    expect(uiTickForMode("LIVE")).toBe(UI_TICK_MS);
    expect(uiTickForMode("EXTENDED")).toBeGreaterThanOrEqual(UI_TICK_MS);
    expect(uiTickForMode("DAY")).toBeGreaterThan(uiTickForMode("EXTENDED"));
  });
});
