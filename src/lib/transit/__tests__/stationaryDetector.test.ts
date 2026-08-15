import { describe, expect, it } from "vitest";

import {
  addObservation,
  createState,
  evaluate,
  severityFor,
  stationaryFromHistory,
  type DetectorState,
  type Observation,
} from "../stationaryDetector";
import { STATIONARY } from "../config";

const T0 = Date.UTC(2026, 7, 15, 5, 0, 0);
const AT_STATION = { lat: 60.2286, lon: 24.9682 };
const ON_TRACK = { lat: 60.2401, lon: 24.9723 };

function feed(
  seconds: number,
  point: { lat: number; lon: number },
  speed = 0,
  stepSeconds = 5,
): DetectorState {
  let state = createState();
  for (let t = 0; t <= seconds; t += stepSeconds) {
    const observation: Observation = { ts: T0 + t * 1000, speed, lat: point.lat, lon: point.lon };
    state = addObservation(state, observation, observation.ts);
  }
  return state;
}

describe("stationary severity thresholds", () => {
  it("119 s -> no label, 120 s -> INFO, 239 s -> INFO, 240 s -> WARNING", () => {
    expect(severityFor(119)).toBe("NONE");
    expect(severityFor(120)).toBe("INFO");
    expect(severityFor(239)).toBe("INFO");
    expect(severityFor(240)).toBe("WARNING");
  });
});

describe("stationary detection", () => {
  it("does not report a stationary label under two minutes", () => {
    const state = feed(90, ON_TRACK);
    const { info } = evaluate(state, T0 + 90_000);
    expect(info.movementStatus).toBe("STATIONARY");
    expect(info.stationarySeverity).toBe("NONE");
  });

  it("reports INFO at two minutes and WARNING at four", () => {
    const twoMin = evaluate(feed(120, ON_TRACK), T0 + 120_000).info;
    expect(twoMin.stationarySeverity).toBe("INFO");
    expect(twoMin.stationaryLocation).toBe("ON_TRACK");

    const fourMin = evaluate(feed(240, ON_TRACK), T0 + 240_000).info;
    expect(fourMin.stationarySeverity).toBe("WARNING");
    expect(Math.floor((fourMin.stationarySeconds ?? 0) / 60)).toBe(4);
  });

  it("distinguishes a stop at the station from a stop on the track", () => {
    const info = evaluate(feed(150, AT_STATION), T0 + 150_000).info;
    expect(info.stationaryLocation).toBe("AT_STATION");
  });

  it("clears the stationary state when the vehicle starts moving again", () => {
    let state = feed(200, ON_TRACK);
    for (let t = 205; t <= 215; t += 5) {
      state = addObservation(state, { ts: T0 + t * 1000, speed: 9, ...ON_TRACK }, T0 + t * 1000);
    }
    const info = evaluate(state, T0 + 215_000).info;
    expect(info.movementStatus).toBe("MOVING");
    expect(info.stationarySeconds).toBeNull();
  });

  it("tolerates GPS jitter within the displacement limit", () => {
    let state = createState();
    for (let t = 0; t <= 200; t += 5) {
      const jitter = (t % 10 === 0 ? 1 : -1) * 0.00008; // ~9 m
      state = addObservation(
        state,
        { ts: T0 + t * 1000, speed: 0.3, lat: ON_TRACK.lat + jitter, lon: ON_TRACK.lon },
        T0 + t * 1000,
      );
    }
    const info = evaluate(state, T0 + 200_000).info;
    expect(info.movementStatus).toBe("STATIONARY");
    expect(info.stationarySeverity).toBe("INFO");
  });

  it("marks a stale stream instead of counting the outage as stationary", () => {
    const state = feed(120, ON_TRACK);
    const later = T0 + 120_000 + (STATIONARY.staleAfterSeconds + 60) * 1000;
    const info = evaluate(state, later).info;
    expect(info.movementStatus).toBe("STALE");
    expect(info.stationarySeconds).toBeNull();
  });
});

describe("historical stationary calculation", () => {
  it("derives stationary seconds from a continuous history", () => {
    const points: Observation[] = [];
    for (let t = 0; t <= 420; t += 10) {
      points.push({ ts: T0 + t * 1000, speed: t < 0 ? 10 : 0, ...ON_TRACK });
    }
    const result = stationaryFromHistory(points, T0 + 420_000);
    expect(result.seconds).toBeGreaterThanOrEqual(400);
    expect(result.incomplete).toBe(false);
  });

  it("does not count a long GPS gap as confirmed stationary", () => {
    const points: Observation[] = [
      { ts: T0, speed: 0, ...ON_TRACK },
      { ts: T0 + 600_000, speed: 0, ...ON_TRACK },
      { ts: T0 + 610_000, speed: 0, ...ON_TRACK },
    ];
    const result = stationaryFromHistory(points, T0 + 610_000);
    expect(result.incomplete).toBe(true);
    expect(result.seconds).toBeLessThanOrEqual(10);
  });
});
