/**
 * Normalized internal departure model. Keep scheduled and realtime data
 * separate; presentation decides what to display.
 */

export type TransitMode = "TRAIN" | "TRAM";

export type DirectionGroup = "HELSINKI" | "NORTH" | "KEILANIEMI" | "ITAKESKUS";

export type MovementStatus = "UNKNOWN" | "MOVING" | "STATIONARY" | "STALE";

export type StationarySeverity = "NONE" | "INFO" | "WARNING";

export type StationaryLocation = "UNKNOWN" | "AT_STATION" | "ON_TRACK";

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
    directionId: number | null;
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

/** Movement information derived from HFP / Fintraffic, kept out of the
 *  timetable data so presentation state and 1 Hz movement state stay apart. */
export type MovementInfo = {
  movementStatus: MovementStatus;
  stationarySince: number | null;
  stationarySeconds: number | null;
  stationarySeverity: StationarySeverity;
  stationaryLocation: StationaryLocation;
  historyIncomplete: boolean;
  hfpVehicleId: string | null;
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
  /** GTFS seconds-from-service-day-start of the scheduled arrival. */
  scheduledArrivalSeconds: number;

  movement: MovementInfo;

  fintrafficTrainNumber: number | null;
  fintrafficDepartureDate: string | null;
  fintrafficMatchConfidence: MatchConfidence;
};

export const EMPTY_MOVEMENT: MovementInfo = {
  movementStatus: "UNKNOWN",
  stationarySince: null,
  stationarySeconds: null,
  stationarySeverity: "NONE",
  stationaryLocation: "UNKNOWN",
  historyIncomplete: false,
  hfpVehicleId: null,
};
