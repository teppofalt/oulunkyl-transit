import { describe, expect, it } from "vitest";

import {
  addObservation,
  createState,
  evaluate,
  type DetectorState,
  type Observation,
} from "../stationaryDetector";
import { STATIONARY } from "../config";

const T0 = Date.UTC(2026, 7, 15, 5, 0, 0);
const POINT = { lat: 60.2401, lon: 24.9723 };

function feed(
  state: DetectorState,
  seconds: number,
  make: (t: number) => Omit<Observation, "ts">,
  startAt = T0,
  stepSeconds = 5,
): DetectorState {
  let next = state;
  for (let t = 0; t <= seconds; t += stepSeconds) {
    const ts = startAt + t * 1000;
    next = addObservation(next, { ts, ...make(t) }, ts);
  }
  return next;
}

describe("GPS evidence is required for STATIONARY", () => {
  it("never reports stationary from zero-speed observations without coordinates", () => {
    const seconds = 5 * 60;
    const state = feed(createState(), seconds, () => ({ speed: 0, lat: null, lon: null }));
    const info = evaluate(state, T0 + seconds * 1000).info;
    expect(info.movementStatus).not.toBe("STATIONARY");
    expect(info.stationarySeconds).toBeNull();
    expect(info.stationarySeverity).toBe("NONE");
  });

  it("never reports stationary from odometer-only (ODO) samples", () => {
    // The parser drops coordinates for non-GPS sources, so ODO data reaches the
    // detector without lat/lon.
    const seconds = 6 * 60;
    const state = feed(createState(), seconds, () => ({ speed: 0.1, lat: null, lon: null }));
    const info = evaluate(state, T0 + seconds * 1000).info;
    expect(info.movementStatus).not.toBe("STATIONARY");
    expect(info.stationarySeverity).toBe("NONE");
  });

  it("can still prove MOVING from speed-only data", () => {
    const state = feed(createState(), 30, () => ({ speed: 12, lat: null, lon: null }));
    expect(evaluate(state, T0 + 30_000).info.movementStatus).toBe("MOVING");
  });

  it("keeps working with trusted GPS data across the severity boundaries", () => {
    const slow = () => ({ speed: 0, ...POINT });
    expect(evaluate(feed(createState(), 119, slow), T0 + 119_000).info.stationarySeverity).toBe(
      "NONE",
    );
    expect(evaluate(feed(createState(), 120, slow), T0 + 120_000).info.stationarySeverity).toBe(
      "INFO",
    );
    expect(evaluate(feed(createState(), 239, slow), T0 + 239_000).info.stationarySeverity).toBe(
      "INFO",
    );
    const warn = evaluate(feed(createState(), 240, slow), T0 + 240_000).info;
    expect(warn.movementStatus).toBe("STATIONARY");
    expect(warn.stationarySeverity).toBe("WARNING");
  });
});

describe("unobserved time never increases confirmed stationary duration", () => {
  const slow = () => ({ speed: 0, ...POINT });

  it("freezes at ~200 s over a 40 s data gap (no INFO → WARNING jump)", () => {
    const state = feed(createState(), 200, slow);
    const atGap = evaluate(state, T0 + 200_000);
    expect(atGap.info.stationarySeconds).toBeGreaterThanOrEqual(195);

    const later = evaluate(atGap.state, T0 + 240_000).info;
    expect(later.stationarySeconds).toBeLessThanOrEqual(205);
    expect(later.stationarySeverity).toBe("INFO");
  });

  it("keeps 235 s below the warning threshold after a 30 s silence", () => {
    const state = feed(createState(), 235, slow);
    const seen = evaluate(state, T0 + 235_000);
    const later = evaluate(seen.state, T0 + 265_000).info;
    expect(later.stationarySeconds).toBeLessThan(STATIONARY.warningThresholdSeconds);
    expect(later.stationarySeverity).toBe("INFO");
  });

  it("marks a long outage STALE instead of counting it", () => {
    const state = feed(createState(), 200, slow);
    const later = T0 + 200_000 + (STATIONARY.staleAfterSeconds + 30) * 1000;
    const info = evaluate(state, later).info;
    expect(info.movementStatus).toBe("STALE");
    expect(info.stationarySeconds).toBeNull();
  });

  it("does not bridge the gap when observations resume", () => {
    let state = feed(createState(), 200, slow);
    const resumeAt = T0 + 200_000 + 10 * 60_000;
    state = feed(state, 40, slow, resumeAt);
    const info = evaluate(state, resumeAt + 40_000).info;
    expect(info.stationarySeconds ?? 0).toBeLessThanOrEqual 
      ? expect(info.stationarySeconds ?? 0).toBeLessThanOrEqual(60)
      : undefined;
    expect(info.stationarySeverity).toBe("NONE");
  });
});
