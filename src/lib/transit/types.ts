/**
 * Normalized internal departure model. Keep scheduled and realtime data
 * separate; presentation decides what to display.
 */

export type TransitMode = "TRAIN" | "TRAM";

export type DirectionGroup = "HELSINKI" | "NORTH" | "KEILANIEMI" | "ITAKESKUS";

export type MovementStatus = "UNKNOWN" | "MOVING" | "STATIONARY" | "STALE";

export type StationarySeverity = "NONE" | "INFO" | "WARNING";

/** HFP vehicle matching state — kept strictly separate from movement state. */
export type HfpMatchStatus = "NOT_MONITORED" | "SEARCHING" | "MATCHED" | "NO_MATCH" | "AMBIGUOUS";

export type MatchConfidence = "EXACT" | "NONE" | "AMBIGUOUS";

/** Raw stoptime shape as returned by the Digitransit Routing API v2. */
export type RawStoptime = {
  stop: {
    gtfsId: string;
    name: string;
    code: string | null;
    platformCode: string | null;
  } | null;
  serviceDay: number;
  scheduledArrival: number | null;
  realtimeArrival: number | null;
  arrivalDelay: number | null;
  scheduledDeparture: number | null;
  realtimeDeparture: number | null;
  departureDelay: number | null;
  realtime: boolean | null;
  realtimeState: string | null;
  headsign: string | null;
  trip: {
    gtfsId: string;
    tripHeadsign: string | null;
    /** Digitransit returns this as a String scalar ("0" / "1"). */
    directionId: number | string | null;
    departureStoptime: { scheduledDeparture: number | null; serviceDay: number | null } | null;
    route: {
      gtfsId: string;
      shortName: string | null;
      longName: string | null;
      mode: string | null;
    } | null;
  } | null;
};

export type BoardSource = {
  /** Digitransit gtfsId of the station/stop the stoptimes were queried from. */
  sourceId: string;
  sourceName: string | null;
  stoptimes: RawStoptime[];
};

export type BoardPayload = {
  /** Server timestamp (epoch ms) of the successful upstream response. */
  fetchedAt: number;
  identifiersValid: boolean;
  diagnostics: string[];
  sources: BoardSource[];
};

/** Pure output of the stationary detector for a single vehicle. */
export type MovementSummary = {
  movementStatus: MovementStatus;
  stationarySince: number | null;
  stationarySeconds: number | null;
  stationarySeverity: StationarySeverity;
  /** True when the observation series had gaps; duration is then untrustworthy. */
  historyIncomplete: boolean;
};

/**
 * Movement information published to the UI. Match status, movement status and
 * stationary severity are deliberately independent fields.
 */
export type MovementInfo = MovementSummary & {
  matchStatus: HfpMatchStatus;
  /** "operatorId/vehicleNumber" — the locked physical vehicle identity. */
  hfpVehicleId: string | null;
  hfpOperatorId: number | null;
  hfpVehicleNumber: number | null;
  lastObservationAt: number | null;
  lastSpeedMps: number | null;
  lastLat: number | null;
  lastLon: number | null;
  locationSource: string | null;
};

export type Departure = {
  id: string;

  mode: TransitMode;
  line: string;
  direction: DirectionGroup;
  headsign: string | null;

  /** Epoch ms. */
  scheduledArrival: number;
  /** Epoch ms, only when realtime data is genuinely available. */
  realtimeArrival: number | null;
  /** Effective time used for sorting and display (epoch ms). */
  effectiveArrival: number;

  delaySeconds: number | null;
  realtimeAvailable: boolean;
  realtimeState: string | null;
  cancelled: boolean;

  platformCode: string | null;
  stopId: string | null;

  digitransitTripId: string;
  digitransitRouteId: string;
  directionId: number | null;
  serviceDay: number;
  /** Trip start (first stop scheduled departure) — needed for HFP matching. */
  tripStartSeconds: number | null;
  tripStartServiceDay: number | null;
  /** GTFS seconds-from-service-day-start of the scheduled arrival. */
  scheduledArrivalSeconds: number;

  movement: MovementInfo;

  fintrafficTrainNumber: number | null;
  fintrafficDepartureDate: string | null;
  fintrafficMatchConfidence: MatchConfidence;
};

export const EMPTY_SUMMARY: MovementSummary = {
  movementStatus: "UNKNOWN",
  stationarySince: null,
  stationarySeconds: null,
  stationarySeverity: "NONE",
  historyIncomplete: false,
};

export const EMPTY_MOVEMENT: MovementInfo = {
  ...EMPTY_SUMMARY,
  matchStatus: "NOT_MONITORED",
  hfpVehicleId: null,
  hfpOperatorId: null,
  hfpVehicleNumber: null,
  lastObservationAt: null,
  lastSpeedMps: null,
  lastLat: null,
  lastLon: null,
  locationSource: null,
};
