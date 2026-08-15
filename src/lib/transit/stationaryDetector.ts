/**
 * Stationary detector — pure module, no UI or network concerns.
 *
 * Inputs: timestamped speed + GPS observations for a single vehicle.
 * Output: movement status, stationary start, duration and severity.
 *
 * Design rules:
 *  - never rely on a single `speed === 0` sample
 *  - a data outage is NOT confirmed stationary time
 *  - prefer uncertainty over false precision
 */

import { STATIONARY, OULUNKYLA_COORDS } from "./config";
import { distanceMeters } from "./timeUtils";
import type { MovementInfo, StationaryLocation, StationarySeverity } from "./types";

export type Observation = {
  /** Epoch ms of the observation. */
  ts: number;
  /** Metres per second, when reported. */
  speed: number | null;
  lat: number | null;
  lon: number | null;
  /** True when the operator reports the vehicle standing at a stop/station. */
  atStop?: boolean | null;
};

export type DetectorState = {
  observations: Observation[];
  /** Confirmed stationary start (epoch ms), null when moving/unknown. */
  stationarySince: number | null;
  /** Seconds of stationary time inherited from external history. */
  historySeconds: number;
  historyIncomplete: boolean;
  lastMovementAt: number | null;
};

export function createState(): DetectorState {
  return {
    observations: [],
    stationarySince: null,
    historySeconds: 0,
    historyIncomplete: false,
    lastMovementAt: null,
  };
}

export function severityFor(stationarySeconds: number | null): StationarySeverity {
  if (stationarySeconds === null) return "NONE";
  if (stationarySeconds >= STATIONARY.warningThresholdSeconds) return "WARNING";
  if (stationarySeconds >= STATIONARY.infoThresholdSeconds) return "INFO";
  return "NONE";
}

function trim(observations: Observation[], nowMs: number): Observation[] {
  const cutoff = nowMs - (STATIONARY.observationWindowSeconds * 4 + 60) * 1000;
  return observations.filter((o) => o.ts >= cutoff).slice(-200);
}

/** Add one observation to the state (mutation-free). */
export function addObservation(
  state: DetectorState,
  observation: Observation,
  nowMs: number = observation.ts,
): DetectorState {
  const observations = trim([...state.observations, observation], nowMs).sort(
    (a, b) => a.ts - b.ts,
  );
  return { ...state, observations };
}

function isMovingSample(o: Observation): boolean {
  return o.speed !== null && o.speed > STATIONARY.speedThresholdMps;
}

function windowSamples(observations: Observation[], fromMs: number): Observation[] {
  return observations.filter((o) => o.ts >= fromMs);
}

function maxDisplacement(samples: Observation[]): number {
  const points = samples.filter(
    (s): s is Observation & { lat: number; lon: number } => s.lat !== null && s.lon !== null,
  );
  if (points.length < 2) return 0;
  let max = 0;
  for (const p of points) {
    const d = distanceMeters(
      { lat: points[0]!.lat, lon: points[0]!.lon },
      { lat: p.lat, lon: p.lon },
    );
    if (d > max) max = d;
  }
  return max;
}

function decideLocation(samples: Observation[]): StationaryLocation {
  const points = samples.filter(
    (s): s is Observation & { lat: number; lon: number } => s.lat !== null && s.lon !== null,
  );
  if (points.length < STATIONARY.minObservationsForLocation) return "UNKNOWN";
  const last = points[points.length - 1]!;
  if (samples.some((s) => s.atStop)) return "AT_STATION";
  const d = distanceMeters(OULUNKYLA_COORDS, { lat: last.lat, lon: last.lon });
  return d <= STATIONARY.stationRadiusMeters ? "AT_STATION" : "ON_TRACK";
}

/**
 * Evaluate the current movement state.
 * `historySeconds` (from Fintraffic) is merged without double counting: the
 * displayed duration is max(live duration, history + live overlap-free part).
 */
export function evaluate(state: DetectorState, nowMs: number): {
  state: DetectorState;
  info: MovementInfo;
} {
  const observations = trim(state.observations, nowMs);
  const latest = observations[observations.length - 1];

  if (!latest) {
    return {
      state: { ...state, observations },
      info: {
        movementStatus: "UNKNOWN",
        stationarySince: null,
        stationarySeconds: null,
        stationarySeverity: "NONE",
        stationaryLocation: "UNKNOWN",
        historyIncomplete: state.historyIncomplete,
        hfpVehicleId: null,
      },
    };
  }

  const ageSeconds = (nowMs - latest.ts) / 1000;
  if (ageSeconds > STATIONARY.staleAfterSeconds) {
    // Data outage: freeze, do not accumulate stationary time.
    return {
      state: { ...state, observations },
      info: {
        movementStatus: "STALE",
        stationarySince: state.stationarySince,
        stationarySeconds: null,
        stationarySeverity: "NONE",
        stationaryLocation: "UNKNOWN",
        historyIncomplete: true,
        hfpVehicleId: null,
      },
    };
  }

  const recovery = windowSamples(observations, nowMs - STATIONARY.movementRecoverySeconds * 1000);
  const sustainedMovement =
    recovery.length > 0 && recovery.every(isMovingSample) && recovery.some(isMovingSample);

  let stationarySince = state.stationarySince;
  let historySeconds = state.historySeconds;

  if (sustainedMovement) {
    // Vehicle is moving again: clear stationary state and inherited history.
    return {
      state: { ...state, observations, stationarySince: null, historySeconds: 0, lastMovementAt: nowMs },
      info: {
        movementStatus: "MOVING",
        stationarySince: null,
        stationarySeconds: null,
        stationarySeverity: "NONE",
        stationaryLocation: "UNKNOWN",
        historyIncomplete: false,
        hfpVehicleId: null,
      },
    };
  }

  const windowStart = nowMs - STATIONARY.observationWindowSeconds * 1000;
  const window = windowSamples(observations, windowStart);
  const spanSeconds = window.length > 1 ? (latest.ts - window[0]!.ts) / 1000 : 0;
  const allSlow = window.length > 0 && window.every((o) => !isMovingSample(o));
  const displacementOk = maxDisplacement(window) <= STATIONARY.maxDisplacementMeters;

  const confirmed =
    allSlow &&
    displacementOk &&
    (spanSeconds >= STATIONARY.observationWindowSeconds || historySeconds > 0 || stationarySince !== null);

  if (!confirmed) {
    if (!allSlow || !displacementOk) {
      stationarySince = null;
      historySeconds = 0;
    } else if (stationarySince === null) {
      // Slow but not yet long enough to confirm; remember the candidate start.
      stationarySince = window[0]?.ts ?? latest.ts;
    }
    const liveSeconds =
      stationarySince !== null ? Math.max(0, (nowMs - stationarySince) / 1000) : 0;
    const total = Math.max(liveSeconds, historySeconds ? historySeconds + liveSeconds : 0);
    const severity = severityFor(total >= STATIONARY.infoThresholdSeconds ? total : null);
    return {
      state: { ...state, observations, stationarySince, historySeconds },
      info: {
        movementStatus: allSlow && displacementOk ? "STATIONARY" : "MOVING",
        stationarySince,
        stationarySeconds: total > 0 ? Math.floor(total) : null,
        stationarySeverity: severity,
        stationaryLocation: severity === "NONE" ? "UNKNOWN" : decideLocation(window),
        historyIncomplete: state.historyIncomplete,
        hfpVehicleId: null,
      },
    };
  }

  if (stationarySince === null) stationarySince = window[0]!.ts;
  const liveSeconds = Math.max(0, (nowMs - stationarySince) / 1000);
  const totalSeconds = historySeconds > 0 ? historySeconds + liveSeconds : liveSeconds;
  const severity = severityFor(totalSeconds);

  return {
    state: { ...state, observations, stationarySince, historySeconds },
    info: {
      movementStatus: "STATIONARY",
      stationarySince,
      stationarySeconds: Math.floor(totalSeconds),
      stationarySeverity: severity,
      stationaryLocation: severity === "NONE" ? "UNKNOWN" : decideLocation(window),
      historyIncomplete: state.historyIncomplete,
      hfpVehicleId: null,
    },
  };
}

/**
 * Seed the detector with stationary time observed before the app was opened.
 * `incomplete` marks history with gaps; the caller must not present a precise
 * duration in that case.
 */
export function seedHistory(
  state: DetectorState,
  seconds: number,
  incomplete: boolean,
  stationarySinceMs: number | null,
): DetectorState {
  return {
    ...state,
    historySeconds: Math.max(0, Math.floor(seconds)),
    historyIncomplete: incomplete,
    stationarySince: state.stationarySince ?? stationarySinceMs,
  };
}

/**
 * Compute confirmed stationary seconds from a historical position series
 * (e.g. Fintraffic train locations). Gaps longer than
 * STATIONARY.maxHistoryGapSeconds break the chain and mark the result
 * incomplete instead of inventing stationary time.
 */
export function stationaryFromHistory(
  history: Observation[],
  nowMs: number,
): { seconds: number; incomplete: boolean; since: number | null } {
  const sorted = [...history].sort((a, b) => a.ts - b.ts);
  if (sorted.length < 2) return { seconds: 0, incomplete: true, since: null };

  let since: number | null = null;
  let incomplete = false;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const sample = sorted[i]!;
    if (isMovingSample(sample)) break;
    const next = sorted[i + 1];
    if (next && (next.ts - sample.ts) / 1000 > STATIONARY.maxHistoryGapSeconds) {
      incomplete = true;
      break;
    }
    const reference = sorted[sorted.length - 1]!;
    if (
      sample.lat !== null &&
      sample.lon !== null &&
      reference.lat !== null &&
      reference.lon !== null &&
      distanceMeters(
        { lat: sample.lat, lon: sample.lon },
        { lat: reference.lat, lon: reference.lon },
      ) > STATIONARY.maxDisplacementMeters
    ) {
      break;
    }
    since = sample.ts;
  }

  const last = sorted[sorted.length - 1]!;
  if ((nowMs - last.ts) / 1000 > STATIONARY.maxHistoryGapSeconds) incomplete = true;

  if (since === null) return { seconds: 0, incomplete, since: null };
  const seconds = Math.max(0, (last.ts - since) / 1000);
  return { seconds: Math.floor(seconds), incomplete, since };
}
