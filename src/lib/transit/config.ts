/** Tunable configuration constants for the Oulunkylä board. */

export const OULUNKYLA = {
  /** Train station (parent station) */
  stationId: "HSL:1000210",
  /** Expected commuter train platform stops */
  trainStopIds: ["HSL:1285501", "HSL:1285551"],
  /** Expected tram 15 stops */
  tramStopIds: ["HSL:1284401", "HSL:1284402"],
  /** Name fragment used for lightweight identifier validation */
  nameFragment: "oulunkyl",
} as const;

export const TRAM_LINE = "15";

/** Live horizon (minutes) shown by default. */
export const LIVE_HORIZON_MINUTES = 60;
/** How much further "Näytä myöhemmät" extends the horizon each press. */
export const LATER_STEP_MINUTES = 60;
/** Full timetable horizon (minutes) for "Näytä 24 h". */
export const FULL_HORIZON_MINUTES = 24 * 60;

/** Digitransit refresh interval while the page is visible (ms). */
export const DEPARTURE_REFRESH_MS = 20_000;
/** Minimum interval between manual refreshes (ms). */
export const MANUAL_REFRESH_COOLDOWN_MS = 5_000;
/** UI tick for recomputing minutes / stationary durations (ms). */
export const UI_TICK_MS = 5_000;
/** Grace period after effective arrival before a departure is dropped (s). */
export const PASSED_GRACE_SECONDS = 60;
/** After this age, cached data is presented as possibly outdated (ms). */
export const STALE_DATA_MS = 60_000;

/** Stationary detector thresholds. */
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
  /** Distance from the station within which a stop is "at station" (m). */
  stationRadiusMeters: 180,
  /** Required GPS accuracy-ish confidence: minimum observations to decide. */
  minObservationsForLocation: 2,
} as const;

/** Oulunkylä station coordinates (WGS84), used only for at-station vs on-track. */
export const OULUNKYLA_COORDS = { lat: 60.2286, lon: 24.9682 } as const;

/** HFP MQTT endpoint (public, no credentials). */
export const HFP_BROKER_URL = "wss://mqtt.hsl.fi:443/";
