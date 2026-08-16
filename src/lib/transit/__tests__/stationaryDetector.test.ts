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
const POINT = { lat: 60.2401, lon: 24.9723 };

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
  it("maps durations to NONE / INFO / WARNING", () => {
    expect(severityFor(119)).toBe("NONE");
    expect(severityFor(120)).toBe("INFO");
    expect(severityFor(239)).toBe("INFO");
    expect(severityFor(240)).toBe("WARNING");
    expect(severityFor(300)).toBe("WARNING");
  });
});

describe("stationary detection", () => {
  it("reports NONE at 119 s and INFO at 120 s", () => {
    const short = evaluate(feed(119, POINT), T0 + 119_000).info;
    expect(short.movementStatus).toBe("STATIONARY");
    expect(short.stationarySeverity).toBe("NONE");

    const info = evaluate(feed(120, POINT), T0 + 120_000).info;
    expect(info.stationarySeverity).toBe("INFO");
  });

  it("reports INFO at 239 s and WARNING at 240 s and 300 s", () => {
    expect(evaluate(feed(239, POINT), T0 + 239_000).info.stationarySeverity).toBe("INFO");
    expect(evaluate(feed(240, POINT), T0 + 240_000).info.stationarySeverity).toBe("WARNING");
    const long = evaluate(feed(300, POINT), T0 + 300_000).info;
    expect(long.stationarySeverity).toBe("WARNING");
    expect(Math.floor((long.stationarySeconds ?? 0) / 60)).toBe(5);
  });

  it("does not classify a single zero-speed observation as stationary", () => {
    const state = addObservation(createState(), { ts: T0, speed: 0, ...POINT }, T0);
    const info = evaluate(state, T0).info;
    expect(info.movementStatus).toBe("UNKNOWN");
    expect(info.stationarySeconds).toBeNull();
  });

  it("tolerates small GPS jitter without calling it movement", () => {
    let state = createState();
    for (let t = 0; t <= 200; t += 5) {
      const jitter = (t % 10 === 0 ? 1 : -1) * 0.00008; // ~9 m
      state = addObservation(
        state,
        { ts: T0 + t * 1000, speed: 0.3, lat: POINT.lat + jitter, lon: POINT.lon },
        T0 + t * 1000,
      );
    }
    const info = evaluate(state, T0 + 200_000).info;
    expect(info.movementStatus).toBe("STATIONARY");
    expect(info.stationarySeverity).toBe("INFO");
  });

  it("clears the stationary state after sustained movement", () => {
    let state = feed(200, POINT);
    for (let t = 205; t <= 215; t += 5) {
      state = addObservation(state, { ts: T0 + t * 1000, speed: 9, ...POINT }, T0 + t * 1000);
    }
    const info = evaluate(state, T0 + 215_000).info;
    expect(info.movementStatus).toBe("MOVING");
    expect(info.stationarySeconds).toBeNull();
  });

  it("does not clear the stationary state from one anomalous observation", () => {
    let state = feed(200, POINT);
    // Single jumped, fast sample.
    state = addObservation(
      state,
      { ts: T0 + 205_000, speed: 14, lat: POINT.lat + 0.01, lon: POINT.lon },
      T0 + 205_000,
    );
    const info = evaluate(state, T0 + 205_000).info;
    expect(info.movementStatus).toBe("STATIONARY");
    expect(info.stationarySeverity).toBe("INFO");
  });

  it("requires sustained movement for recovery (2 s of movement is not enough)", () => {
    let state = feed(200, POINT);
    state = addObservation(state, { ts: T0 + 202_000, speed: 6, ...POINT }, T0 + 202_000);
    const info = evaluate(state, T0 + 202_000).info;
    expect(info.movementStatus).toBe("STATIONARY");
  });

  it("marks a stale stream instead of counting the outage as stationary", () => {
    const state = feed(120, POINT);
    const later = T0 + 120_000 + (STATIONARY.staleAfterSeconds + 60) * 1000;
    const info = evaluate(state, later).info;
    expect(info.movementStatus).toBe("STALE");
    expect(info.stationarySeconds).toBeNull();
  });

  it("does not accumulate stationary time across a data gap", () => {
    let state = feed(60, POINT);
    const resumeAt = T0 + 60_000 + 10 * 60_000; // 10 min outage
    for (let t = 0; t <= 40; t += 5) {
      state = addObservation(
        state,
        { ts: resumeAt + t * 1000, speed: 0, ...POINT },
        resumeAt + t * 1000,
      );
    }
    const info = evaluate(state, resumeAt + 40_000).info;
    expect(info.movementStatus).toBe("STATIONARY");
    expect(info.stationarySeconds).toBeLessThanOrEqual(45);
    expect(info.stationarySeverity).toBe("NONE");
  });
});

describe("historical stationary calculation", () => {
  it("derives stationary seconds from a continuous history", () => {
    const points: Observation[] = [];
    for (let t = 0; t <= 420; t += 10) {
      points.push({ ts: T0 + t * 1000, speed: 0, ...POINT });
    }
    const result = stationaryFromHistory(points, T0 + 420_000);
    expect(result.seconds).toBeGreaterThanOrEqual(400);
    expect(result.incomplete).toBe(false);
  });

  it("does not count a long GPS gap as confirmed stationary", () => {
    const points: Observation[] = [
      { ts: T0, speed: 0, ...POINT },
      { ts: T0 + 600_000, speed: 0, ...POINT },
      { ts: T0 + 610_000, speed: 0, ...POINT },
    ];
    const result = stationaryFromHistory(points, T0 + 610_000);
    expect(result.incomplete).toBe(true);
    expect(result.seconds).toBeLessThanOrEqual(10);
  });
});
