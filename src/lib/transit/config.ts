/** Tunable configuration constants for the Oulunkylä board. */

export const OULUNKYLA = {
  /** Train station (parent station) */
  stationId: "HSL:1000210",
  /** Expected commuter train platform stops */
  trainStopIds: ["HSL:1285501", "HSL:1285551"],
  /** Expected tram 15 stops (Oulunkylän keskusta) */
  tramStopIds: ["HSL:1284401", "HSL:1284402"],
  /** Name fragment used for lightweight identifier validation */
  nameFragment: "oulunkyl",
} as const;

export const TRAM_LINE = "15";

/** Live horizon (minutes) shown by default. */
export const LIVE_HORIZON_MINUTES = 60;
/** Horizon (minutes) after "Näytä myöhemmät" — refetched from Digitransit. */
export const EXTENDED_HORIZON_MINUTES = 180;
/** Full timetable horizon (minutes) for "Näytä 24 h". */
export const FULL_HORIZON_MINUTES = 24 * 60;

/**
 * HFP movement monitoring horizon (minutes). Only departures arriving within
 * now → +this many minutes are monitored; never the whole board. This stays at
 * 30 minutes regardless of how far the displayed timetable horizon reaches.
 */
export const HFP_MONITORING_HORIZON_MINUTES = 30;
/** Maximum monitored trips, a hard safety cap on subscriptions. */
export const HFP_MAX_MONITORED_TRIPS = 12;
/** After this long without a matching vehicle message, report NO_MATCH. */
export const HFP_NO_MATCH_AFTER_SECONDS = 120;

/** Digitransit refresh interval while the page is visible (ms). */
export const DEPARTURE_REFRESH_MS = 20_000;
/** Minimum interval between manual refreshes (ms). */
export const MANUAL_REFRESH_COOLDOWN_MS = 5_000;
/** UI tick for recomputing minutes / stationary durations (ms), per mode. */
export const UI_TICK_MS = 5_000;
export const UI_TICK_EXTENDED_MS = 15_000;
export const UI_TICK_DAY_MS = 30_000;
/** Grace period after effective arrival before a departure is dropped (s). */
export const PASSED_GRACE_SECONDS = 60;
/** After this age, cached data is presented as possibly outdated (ms). */
export const STALE_DATA_MS = 60_000;

/** Stationary detector thresholds — keep easy to adjust. */
export const STATIONARY = {
  /** Speed at or below this counts as not moving (m/s). */
  speedThresholdMps: 0.5,
  /** Observation window used to confirm a stationary state (s). */
  observationWindowSeconds: 30,
  /** Maximum displacement allowed inside the window (m). */
  maxDisplacementMeters: 30,
  /** Only show stationary information from this duration onwards (s). */
  infoThresholdSeconds: 120,
  /** Prolonged stop warning threshold (s). */
  warningThresholdSeconds: 240,
  /** Sustained movement needed to clear a stationary state (s). */
  movementRecoverySeconds: 5,
  /** Positions older than this make movement data stale (s). */
  staleAfterSeconds: 90,
  /** Gaps longer than this cannot be counted as confirmed stationary (s). */
  maxHistoryGapSeconds: 120,
  /** Minimum samples required before asserting a stationary state. */
  minConfirmSamples: 3,
  /**
   * Minimum number of *trusted GPS* observations required before a stationary
   * state may be asserted. Speed-only data can never satisfy this.
   */
  minConfirmGpsSamples: 3,
  /** Minimum time span those samples must cover (s). */
  minConfirmSpanSeconds: 20,

  /** Rolling in-memory observation history (s) — a few minutes only. */
  historyRetentionSeconds: 600,
  /** Hard cap on retained observations per vehicle. */
  maxObservations: 300,
} as const;

/** HFP MQTT endpoint (public, no credentials). */
export const HFP_BROKER_URL = "wss://mqtt.hsl.fi:443/";
