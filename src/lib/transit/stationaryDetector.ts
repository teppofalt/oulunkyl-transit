/**
 * Stationary detector — pure module, no UI or network concerns.
 *
 * Inputs: timestamped speed + GPS observations for a single vehicle.
 * Output: movement status, stationary start, duration and severity.
 *
 * Design rules:
 *  - never rely on a single `speed === 0` sample
 *  - never clear a stationary state from one anomalous GPS point
 *  - a data outage is NOT confirmed stationary time
 *  - prefer uncertainty over false precision
 *
 * Station-vs-track classification is intentionally NOT part of this phase.
 */

import { STATIONARY } from "./config";
import { distanceMeters } from "./timeUtils";
import { EMPTY_SUMMARY, type MovementSummary, type StationarySeverity } from "./types";

export type Observation = {
  /** Epoch ms of the observation. */
  ts: number;
  /** Metres per second, when reported. */
  speed: number | null;
  lat: number | null;
  lon: number | null;
};

export type DetectorState = {
  observations: Observation[];
  /** Confirmed stationary start (epoch ms), null when moving/unknown. */
  stationarySince: number | null;
  /** Seconds of stationary time inherited from external history. */
  historySeconds: number;
  historyIncomplete: boolean;
  lastMovementAt: number | null;
  /**
   * Timestamp of the last trusted GPS observation that actually confirmed the
   * vehicle standing still. Confirmed duration is measured up to this instant —
   * never up to wall-clock now — so unobserved time adds nothing.
   */
  lastReliableObservationAt: number | null;
  /** Frozen confirmed stationary seconds, only grown by real observations. */
  confirmedStationarySeconds: number;
};

export function createState(): DetectorState {
  return {
    observations: [],
    stationarySince: null,
    historySeconds: 0,
    historyIncomplete: false,
    lastMovementAt: null,
    lastReliableObservationAt: null,
    confirmedStationarySeconds: 0,
  };
}


export function severityFor(stationarySeconds: number | null): StationarySeverity {
  if (stationarySeconds === null) return "NONE";
  if (stationarySeconds >= STATIONARY.warningThresholdSeconds) return "WARNING";
  if (stationarySeconds >= STATIONARY.infoThresholdSeconds) return "INFO";
  return "NONE";
}

/** Small rolling history only: a few minutes, hard-capped sample count. */
function trim(observations: Observation[], nowMs: number): Observation[] {
  const cutoff = nowMs - STATIONARY.historyRetentionSeconds * 1000;
  return observations.filter((o) => o.ts >= cutoff).slice(-STATIONARY.maxObservations);
}

/** Add one observation to the state (mutation-free). */
export function addObservation(
  state: DetectorState,
  observation: Observation,
  nowMs: number = observation.ts,
): DetectorState {
  const observations = trim([...state.observations, observation], nowMs).sort((a, b) => a.ts - b.ts);
  return { ...state, observations };
}

function isMovingSample(o: Observation): boolean {
  return o.speed !== null && o.speed > STATIONARY.speedThresholdMps;
}

function windowSamples(observations: Observation[], fromMs: number): Observation[] {
  return observations.filter((o) => o.ts >= fromMs);
}

function positioned(samples: Observation[]) {
  return samples.filter(
    (s): s is Observation & { lat: number; lon: number } => s.lat !== null && s.lon !== null,
  );
}

/**
 * Displacement inside a sample set, ignoring one worst outlier when there are
 * enough points — a single bad GPS fix must not look like movement.
 */
function robustDisplacement(samples: Observation[]): number {
  const points = positioned(samples);
  if (points.length < 2) return 0;
  // Reference is the temporal median point, so one jumped fix (which is often
  // the newest sample) cannot dominate the result.
  const reference = points[Math.floor((points.length - 1) / 2)]!;
  const distances = points
    .map((p) => distanceMeters(reference, { lat: p.lat, lon: p.lon }))
    .sort((a, b) => a - b);
  const index = distances.length >= 4 ? distances.length - 2 : distances.length - 1;
  return distances[index] ?? 0;
}

/** Frozen stationary report: duration comes from observations, not the clock. */
function frozen(state: DetectorState, observations: Observation[]) {
  const confirmed = state.confirmedStationarySeconds;
  const stationary = state.stationarySince !== null && confirmed > 0;
  return {
    state: { ...state, observations },
    info: {
      ...EMPTY_SUMMARY,
      movementStatus: (stationary ? "STATIONARY" : "UNKNOWN") as MovementSummary["movementStatus"],
      stationarySince: state.stationarySince,
      stationarySeconds: stationary ? confirmed : null,
      stationarySeverity: stationary ? severityFor(confirmed) : "NONE",
      historyIncomplete: state.historyIncomplete,
    },
  };
}

/**
 * Evaluate the current movement state for one vehicle.
 *
 * Evidence rules:
 *  - STATIONARY requires trusted GPS coordinates: at least
 *    `minConfirmGpsSamples` positioned samples spanning `minConfirmSpanSeconds`,
 *    all slow, with a robust displacement inside `maxDisplacementMeters`.
 *  - Speed-only samples (odometer/non-GPS HFP messages with no coordinates) can
 *    prove MOVING but can never produce or maintain a STATIONARY state.
 *  - Confirmed duration is measured up to the last trusted observation, so a
 *    data gap never inflates it.
 */
export function evaluate(
  state: DetectorState,
  nowMs: number,
): { state: DetectorState; info: MovementSummary } {
  const observations = trim(state.observations, nowMs);
  const latest = observations[observations.length - 1];
  const next = { ...state, observations };

  if (!latest) {
    return { state: next, info: { ...EMPTY_SUMMARY, historyIncomplete: state.historyIncomplete } };
  }

  const ageSeconds = (nowMs - latest.ts) / 1000;
  if (ageSeconds > STATIONARY.staleAfterSeconds) {
    // Data outage: freeze, never accumulate stationary time across the gap.
    return {
      state: next,
      info: {
        ...EMPTY_SUMMARY,
        movementStatus: "STALE",
        stationarySince: state.stationarySince,
        historyIncomplete: true,
      },
    };
  }

  // Movement recovery requires sustained movement, not one noisy sample.
  // Speed alone is enough here: clearly moving is positive movement evidence.
  const recovery = windowSamples(observations, nowMs - STATIONARY.movementRecoverySeconds * 1000);
  const recoverySpan =
    recovery.length >= 2 ? (recovery[recovery.length - 1]!.ts - recovery[0]!.ts) / 1000 : 0;
  const sustainedMovement =
    recovery.length >= 2 &&
    recoverySpan >= STATIONARY.movementRecoverySeconds * 0.8 &&
    recovery.every(isMovingSample);

  if (sustainedMovement) {
    return {
      state: {
        ...next,
        stationarySince: null,
        historySeconds: 0,
        lastMovementAt: nowMs,
        lastReliableObservationAt: latest.ts,
        confirmedStationarySeconds: 0,
      },
      info: { ...EMPTY_SUMMARY, movementStatus: "MOVING" },
    };
  }

  // Only trusted GPS observations count as stationary evidence.
  const window = positioned(
    windowSamples(observations, nowMs - STATIONARY.observationWindowSeconds * 1000),
  );
  const span = window.length >= 2 ? (window[window.length - 1]!.ts - window[0]!.ts) / 1000 : 0;
  const enoughEvidence =
    window.length >= STATIONARY.minConfirmGpsSamples && span >= STATIONARY.minConfirmSpanSeconds;
  // A single fast sample among slow ones is treated as noise, not movement.
  const movingCount = window.filter(isMovingSample).length;
  const allSlow = window.length > 0 && movingCount <= (window.length >= 4 ? 1 : 0);
  const reference = medianPoint(window);
  const inPlace = robustDisplacement(window) <= STATIONARY.maxDisplacementMeters;

  if (!enoughEvidence) {
    // Not enough trusted position evidence: report only what was observed.
    return frozen(next, observations);
  }

  if (!allSlow || !inPlace) {
    return {
      state: {
        ...next,
        stationarySince: null,
        historySeconds: 0,
        confirmedStationarySeconds: 0,
        lastReliableObservationAt: latest.ts,
      },
      info: { ...EMPTY_SUMMARY, movementStatus: "MOVING" },
    };
  }

  // Walk back through retained trusted observations to find the real start of
  // the stationary stretch, not just the start of the confirmation window.
  const trusted = positioned(observations);
  const earliest = earliestStationaryStart(trusted, reference);
  const stationarySince =
    state.stationarySince === null
      ? earliest
      : Math.min(state.stationarySince, earliest ?? state.stationarySince);

  // Duration end point: the newest trusted, slow, in-place observation.
  const lastReliable = lastReliableStationaryTs(trusted, reference) ?? latest.ts;
  const liveSeconds =
    stationarySince !== null ? Math.max(0, (lastReliable - stationarySince) / 1000) : 0;
  const totalSeconds = state.historySeconds > 0 ? state.historySeconds + liveSeconds : liveSeconds;
  const confirmed = Math.floor(totalSeconds);

  return {
    state: {
      ...next,
      stationarySince,
      lastReliableObservationAt: lastReliable,
      confirmedStationarySeconds: confirmed,
    },
    info: {
      movementStatus: "STATIONARY",
      stationarySince,
      stationarySeconds: confirmed > 0 ? confirmed : null,
      stationarySeverity: severityFor(confirmed),
      historyIncomplete: state.historyIncomplete,
    },
  };
}

/** Newest trusted observation that is slow and inside the in-place radius. */
function lastReliableStationaryTs(
  trusted: Observation[],
  reference: { lat: number; lon: number } | null,
): number | null {
  for (let i = trusted.length - 1; i >= 0; i--) {
    const sample = trusted[i]!;
    if (isMovingSample(sample)) continue;
    if (
      reference !== null &&
      sample.lat !== null &&
      sample.lon !== null &&
      distanceMeters({ lat: sample.lat, lon: sample.lon }, reference) >
        STATIONARY.maxDisplacementMeters
    ) {
      continue;
    }
    return sample.ts;
  }
  return null;
}


/**
 * Earliest timestamp of the current uninterrupted slow-and-in-place stretch.
 * Movement or a position jump ends the stretch; a long data gap does too, so
 * an outage is never counted as stationary time.
 */
function earliestStationaryStart(
  observations: Observation[],
  reference: { lat: number; lon: number } | null,
): number | null {
  const latest = observations[observations.length - 1];
  if (!latest) return null;
  let since: number | null = latest.ts;
  // One anomalous sample (fast reading or jumped fix) is tolerated without
  // ending the stretch; two in a row end it.
  let anomalies = 0;
  for (let i = observations.length - 1; i >= 0; i--) {
    const sample = observations[i]!;
    const nextSample = observations[i + 1];
    if (nextSample && (nextSample.ts - sample.ts) / 1000 > STATIONARY.staleAfterSeconds) break;

    const jumped =
      reference !== null &&
      sample.lat !== null &&
      sample.lon !== null &&
      distanceMeters({ lat: sample.lat, lon: sample.lon }, reference) >
        STATIONARY.maxDisplacementMeters;

    if (isMovingSample(sample) || jumped) {
      anomalies += 1;
      if (anomalies > 1) break;
      continue;
    }
    anomalies = 0;
    since = sample.ts;
  }
  return since;
}

/** Temporal median position of a sample set, used as a robust reference. */
function medianPoint(samples: Observation[]): { lat: number; lon: number } | null {
  const points = positioned(samples);
  if (points.length === 0) return null;
  const p = points[Math.floor((points.length - 1) / 2)]!;
  return { lat: p.lat, lon: p.lon };
}

/**
 * Seed the detector with stationary time observed before the app was opened.
 * Not used in the HFP phase (kept for a later retrospective-history source).
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
 * Compute confirmed stationary seconds from a historical position series.
 * Gaps longer than STATIONARY.maxHistoryGapSeconds break the chain and mark
 * the result incomplete instead of inventing stationary time.
 */
export function stationaryFromHistory(
  history: Observation[],
  _nowMs: number,
): { seconds: number; incomplete: boolean; since: number | null } {
  const sorted = [...history].sort((a, b) => a.ts - b.ts);
  if (sorted.length < 2) return { seconds: 0, incomplete: true, since: null };

  const reference = sorted[sorted.length - 1]!;
  let since: number | null = null;
  let incomplete = false;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const sample = sorted[i]!;
    if (isMovingSample(sample)) break;
    const nextSample = sorted[i + 1];
    if (nextSample && (nextSample.ts - sample.ts) / 1000 > STATIONARY.maxHistoryGapSeconds) {
      incomplete = true;
      break;
    }
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

  const seconds = since === null ? 0 : Math.max(0, Math.floor((reference.ts - since) / 1000));
  return { seconds, incomplete, since };
}
