/**
 * HSL High Frequency Positioning (HFP v2) monitor.
 *
 * Purpose: for a small set of *currently relevant* Digitransit departures,
 * find the matching physical vehicle and derive a movement status. No map,
 * no vehicle markers, no persistence.
 *
 * Safety rules:
 *  - subscriptions are narrow (mode + route + direction + trip start time)
 *  - a vehicle position is attached to a departure only when route, converted
 *    direction, operating day and trip start time all match exactly and the
 *    match is unique; otherwise the message is discarded
 *  - once matched, the physical vehicle identity (operator + vehicle number)
 *    is locked so observations from another vehicle are never mixed in
 *  - HFP is supplemental: nothing here may affect timetable / realtime ETA
 */

import mqtt, { type MqttClient } from "mqtt";

import { HFP_BROKER_URL, HFP_NO_MATCH_AFTER_SECONDS } from "./config";
import { toHfpDirection } from "./hfpDirection";
import { gtfsSecondsToHhmm, helsinkiDateString } from "./timeUtils";
import {
  addObservation,
  createState,
  evaluate,
  type DetectorState,
  type Observation,
} from "./stationaryDetector";
import { EMPTY_MOVEMENT, type Departure, type HfpMatchStatus, type MovementInfo } from "./types";

export type MonitoredTrip = {
  /** Digitransit trip gtfsId — the identity used by the board. */
  tripId: string;
  /** HFP route id (Digitransit route gtfsId without the feed prefix). */
  hfpRoute: string;
  /** HFP direction (1/2), converted from GTFS directionId (0/1). */
  hfpDirection: number;
  /** Operating day of the trip start, YYYY-MM-DD. */
  oday: string;
  /** Scheduled departure from the FIRST stop of the trip, HH:mm. */
  start: string;
  mode: "train" | "tram";
  /** MQTT topic filter used for this trip. */
  topic: string;
};

export type HfpObservation = {
  timestamp: number;
  vehicleId: string;
  operatorId: number | null;
  vehicleNumber: number | null;
  speedMps: number | null;
  lat: number | null;
  lon: number | null;
  locationSource: string | null;
  stopId: string | null;
};

export function hfpRouteId(routeGtfsId: string): string {
  const parts = routeGtfsId.split(":");
  return parts[parts.length - 1] ?? routeGtfsId;
}

export function topicFor(
  trip: Pick<MonitoredTrip, "mode" | "hfpRoute" | "hfpDirection" | "start">,
) {
  // /hfp/v2/journey/ongoing/vp/<mode>/<oper>/<veh>/<route>/<dir>/<headsign>/<start>/#
  return `/hfp/v2/journey/ongoing/vp/${trip.mode}/+/+/${trip.hfpRoute}/${trip.hfpDirection}/+/${trip.start}/#`;
}

/**
 * Build a monitorable descriptor for a departure, or null when Digitransit
 * data is insufficient for an unambiguous match. The HFP `start` is the
 * scheduled departure from the first stop of the trip — never the Oulunkylä
 * time.
 */
export function buildMonitoredTrip(departure: Departure): MonitoredTrip | null {
  const hfpDirection = toHfpDirection(departure.directionId);
  if (hfpDirection === null) return null;
  if (departure.tripStartSeconds === null || departure.tripStartServiceDay === null) return null;

  const base = {
    tripId: departure.digitransitTripId,
    hfpRoute: hfpRouteId(departure.digitransitRouteId),
    hfpDirection,
    // The GTFS service day is the HFP operating day for the trip start.
    oday: helsinkiDateString(departure.tripStartServiceDay * 1000),
    start: gtfsSecondsToHhmm(departure.tripStartSeconds),
    mode: (departure.mode === "TRAIN" ? "train" : "tram") as "train" | "tram",
  };
  return { ...base, topic: topicFor(base) };
}

type HfpPayload = {
  VP?: {
    oper?: number | null;
    veh?: number | null;
    tst?: string | null;
    spd?: number | null;
    lat?: number | null;
    long?: number | null;
    loc?: string | null;
    route?: string | null;
    dir?: string | null;
    oday?: string | null;
    start?: string | null;
    stop?: number | string | null;
  };
};

export type HfpJourney = {
  route: string;
  direction: number;
  oday: string;
  start: string;
  observation: HfpObservation;
};

/** Positive integer HFP identifier, or null when missing/invalid. */
function numericId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * Parse a raw HFP vehicle-position payload into journey identity + observation.
 *
 * A payload without both a valid `oper` and a valid `veh` is rejected: the
 * physical vehicle identity must be unambiguous, so "?/?"-style identities are
 * never created and never locked to a trip.
 */
export function parseVehiclePosition(raw: string): HfpJourney | null {
  let payload: HfpPayload;
  try {
    payload = JSON.parse(raw) as HfpPayload;
  } catch {
    return null;
  }
  const vp = payload.VP;
  if (!vp || !vp.tst || !vp.route || !vp.oday || !vp.start) return null;
  const direction = Number(vp.dir);
  if (direction !== 1 && direction !== 2) return null;
  const ts = Date.parse(vp.tst);
  if (!Number.isFinite(ts)) return null;

  const operatorId = numericId(vp.oper);
  const vehicleNumber = numericId(vp.veh);
  if (operatorId === null || vehicleNumber === null) return null;

  const locationSource = vp.loc ?? null;
  const trustCoordinates = locationSource === "GPS" || locationSource === null;

  return {
    route: vp.route,
    direction,
    oday: vp.oday,
    start: vp.start,
    observation: {
      timestamp: ts,
      vehicleId: `${operatorId}/${vehicleNumber}`,
      operatorId,
      vehicleNumber,
      speedMps: typeof vp.spd === "number" ? vp.spd : null,
      lat: trustCoordinates && typeof vp.lat === "number" ? vp.lat : null,
      lon: trustCoordinates && typeof vp.long === "number" ? vp.long : null,
      locationSource,
      stopId: vp.stop === null || vp.stop === undefined ? null : String(vp.stop),
    },
  };
}

function journeyMatches(trip: MonitoredTrip, journey: HfpJourney): boolean {
  return (
    trip.hfpRoute === journey.route &&
    trip.hfpDirection === journey.direction &&
    trip.oday === journey.oday &&
    trip.start === journey.start
  );
}

/**
 * Resolve a journey to exactly one monitored trip.
 * Returns "NONE" when nothing matches and "AMBIGUOUS" when several do — the
 * caller must then discard the message instead of guessing.
 */
export function resolveJourney(
  trips: MonitoredTrip[],
  journey: HfpJourney,
): { status: "MATCHED"; trip: MonitoredTrip } | { status: "NONE" | "AMBIGUOUS" } {
  const matches = trips.filter((trip) => journeyMatches(trip, journey));
  if (matches.length === 1) return { status: "MATCHED", trip: matches[0]! };
  if (matches.length === 0) return { status: "NONE" };
  return { status: "AMBIGUOUS" };
}

type TripRuntime = {
  trip: MonitoredTrip;
  subscribedAt: number;
  matchStatus: HfpMatchStatus;
  /** Locked physical vehicle identity: operator + vehicle number. */
  vehicleId: string | null;
  operatorId: number | null;
  vehicleNumber: number | null;
  detector: DetectorState;
  lastObservation: HfpObservation | null;
  /** Last time any message arrived on this trip's route+direction topic. */
  lastTopicMessageAt: number | null;
};

export type TripDiagnostics = {
  tripId: string;
  topic: string;
  hfpRoute: string;
  hfpDirection: number;
  oday: string;
  start: string;
  mode: string;
  matchStatus: HfpMatchStatus;
  operatorId: number | null;
  vehicleNumber: number | null;
  lastTimestamp: number | null;
  lastSpeedMps: number | null;
  lat: number | null;
  lon: number | null;
  locationSource: string | null;
  stopId: string | null;
  movementStatus: string;
  stationarySince: number | null;
  stationarySeconds: number | null;
  stale: boolean;
};

export type HfpConnectionStatus = "closed" | "connecting" | "open" | "error";

export type HfpMonitorOptions = {
  onStatus?: (status: HfpConnectionStatus) => void;
  /** Injectable for tests. */
  connect?: (url: string) => MqttClient;
};

/**
 * Narrow-topic HFP monitor with explicit subscription reconciliation.
 * Messages (~1 Hz per vehicle) are processed here; React reads derived state
 * via `snapshot()` on a slow tick, so no rerender happens per message.
 */
export function createHfpMonitor(options: HfpMonitorOptions = {}) {
  let client: MqttClient | null = null;
  /** topic -> number of trips needing it */
  const topicRefs = new Map<string, number>();
  const runtimes = new Map<string, TripRuntime>();
  let connectionStatus: HfpConnectionStatus = "closed";

  function setStatus(status: HfpConnectionStatus) {
    connectionStatus = status;
    options.onStatus?.(status);
  }

  function handleMessage(_topic: string, buffer: Uint8Array) {
    const journey = parseVehiclePosition(new TextDecoder().decode(buffer));
    if (!journey) return;
    const now = Date.now();
    const trips = [...runtimes.values()].map((r) => r.trip);

    // Note that traffic exists on the subscribed route+direction, even when it
    // belongs to another trip start — used to distinguish NO_MATCH from
    // "nothing received at all".
    for (const runtime of runtimes.values()) {
      if (
        runtime.trip.hfpRoute === journey.route &&
        runtime.trip.hfpDirection === journey.direction
      ) {
        runtime.lastTopicMessageAt = now;
      }
    }

    const resolved = resolveJourney(trips, journey);
    if (resolved.status !== "MATCHED") {
      // never guess: unmatched messages are dropped, ambiguity is recorded
      if (resolved.status === "AMBIGUOUS") {
        for (const runtime of runtimes.values()) {
          if (journeyMatches(runtime.trip, journey)) {
            runtime.matchStatus = "AMBIGUOUS";
            runtime.detector = createState();
            runtime.lastObservation = null;
          }
        }
      }
      return;
    }

    const runtime = runtimes.get(resolved.trip.tripId);
    if (!runtime || runtime.matchStatus === "AMBIGUOUS") return;

    const { observation } = journey;
    if (runtime.vehicleId === null) {
      runtime.vehicleId = observation.vehicleId;
      runtime.operatorId = observation.operatorId;
      runtime.vehicleNumber = observation.vehicleNumber;
    } else if (runtime.vehicleId !== observation.vehicleId) {
      // Two physical vehicles claim the same trip: do not mix observations.
      runtime.matchStatus = "AMBIGUOUS";
      runtime.detector = createState();
      runtime.lastObservation = null;
      return;
    }

    runtime.matchStatus = "MATCHED";
    runtime.lastObservation = observation;
    const sample: Observation = {
      ts: observation.timestamp,
      speed: observation.speedMps,
      lat: observation.lat,
      lon: observation.lon,
    };
    runtime.detector = addObservation(runtime.detector, sample, now);
  }

  function ensureClient() {
    if (client) return;
    setStatus("connecting");
    client =
      options.connect?.(HFP_BROKER_URL) ??
      mqtt.connect(HFP_BROKER_URL, {
        protocolVersion: 5,
        keepalive: 30,
        reconnectPeriod: 5_000,
        clean: true,
      });
    client.on("connect", () => {
      setStatus("open");
      for (const topic of topicRefs.keys()) client?.subscribe(topic, { qos: 0 });
    });
    client.on("message", (topic: string, message: Uint8Array) => handleMessage(topic, message));
    client.on("error", () => setStatus("error"));
    client.on("close", () => setStatus("closed"));
  }

  function teardown() {
    client?.end(true);
    client = null;
    topicRefs.clear();
    setStatus("closed");
  }

  return {
    get status() {
      return connectionStatus;
    },

    /**
     * Reconcile the monitored trip set: add new trips, drop trips that are no
     * longer relevant, and adjust MQTT subscriptions incrementally. The client
     * is never torn down and rebuilt just because the board refreshed.
     */
    setTrips(trips: MonitoredTrip[]) {
      const now = Date.now();
      const wanted = new Map(trips.map((trip) => [trip.tripId, trip]));

      // Remove trips that dropped off the monitored set.
      for (const [tripId, runtime] of [...runtimes]) {
        if (!wanted.has(tripId)) {
          runtimes.delete(tripId);
          const refs = (topicRefs.get(runtime.trip.topic) ?? 1) - 1;
          if (refs <= 0) {
            topicRefs.delete(runtime.trip.topic);
            client?.unsubscribe(runtime.trip.topic);
          } else {
            topicRefs.set(runtime.trip.topic, refs);
          }
        }
      }

      if (wanted.size === 0) {
        runtimes.clear();
        teardown();
        return;
      }

      ensureClient();

      for (const [tripId, trip] of wanted) {
        if (runtimes.has(tripId)) continue;
        runtimes.set(tripId, {
          trip,
          subscribedAt: now,
          matchStatus: "SEARCHING",
          vehicleId: null,
          operatorId: null,
          vehicleNumber: null,
          detector: createState(),
          lastObservation: null,
          lastTopicMessageAt: null,
        });
        const refs = topicRefs.get(trip.topic) ?? 0;
        topicRefs.set(trip.topic, refs + 1);
        if (refs === 0 && client?.connected) client.subscribe(trip.topic, { qos: 0 });
      }
    },

    /** Derived per-trip state for React. Cheap; called on the slow UI tick. */
    snapshot(nowMs: number = Date.now()): Record<string, MovementInfo> {
      const result: Record<string, MovementInfo> = {};
      for (const [tripId, runtime] of runtimes) {
        // Downgrade a long fruitless search to NO_MATCH (documented HFP route
        // id mismatches make this a normal outcome, not an error).
        if (
          runtime.matchStatus === "SEARCHING" &&
          (nowMs - runtime.subscribedAt) / 1000 > HFP_NO_MATCH_AFTER_SECONDS
        ) {
          runtime.matchStatus = "NO_MATCH";
        }

        if (runtime.matchStatus !== "MATCHED") {
          result[tripId] = { ...EMPTY_MOVEMENT, matchStatus: runtime.matchStatus };
          continue;
        }

        const { state, info } = evaluate(runtime.detector, nowMs);
        runtime.detector = state;
        result[tripId] = {
          ...info,
          matchStatus: "MATCHED",
          hfpVehicleId: runtime.vehicleId,
          hfpOperatorId: runtime.operatorId,
          hfpVehicleNumber: runtime.vehicleNumber,
          lastObservationAt: runtime.lastObservation?.timestamp ?? null,
          lastSpeedMps: runtime.lastObservation?.speedMps ?? null,
          lastLat: runtime.lastObservation?.lat ?? null,
          lastLon: runtime.lastObservation?.lon ?? null,
          locationSource: runtime.lastObservation?.locationSource ?? null,
        };
      }
      return result;
    },

    /** Development diagnostics only. */
    diagnostics(nowMs: number = Date.now()): TripDiagnostics[] {
      return [...runtimes.values()].map((runtime) => {
        const { info } = evaluate(runtime.detector, nowMs);
        return {
          tripId: runtime.trip.tripId,
          topic: runtime.trip.topic,
          hfpRoute: runtime.trip.hfpRoute,
          hfpDirection: runtime.trip.hfpDirection,
          oday: runtime.trip.oday,
          start: runtime.trip.start,
          mode: runtime.trip.mode,
          matchStatus: runtime.matchStatus,
          operatorId: runtime.operatorId,
          vehicleNumber: runtime.vehicleNumber,
          lastTimestamp: runtime.lastObservation?.timestamp ?? null,
          lastSpeedMps: runtime.lastObservation?.speedMps ?? null,
          lat: runtime.lastObservation?.lat ?? null,
          lon: runtime.lastObservation?.lon ?? null,
          locationSource: runtime.lastObservation?.locationSource ?? null,
          stopId: runtime.lastObservation?.stopId ?? null,
          movementStatus: runtime.matchStatus === "MATCHED" ? info.movementStatus : "UNKNOWN",
          stationarySince: runtime.matchStatus === "MATCHED" ? info.stationarySince : null,
          stationarySeconds: runtime.matchStatus === "MATCHED" ? info.stationarySeconds : null,
          stale: runtime.matchStatus === "MATCHED" && info.movementStatus === "STALE",
        };
      });
    },

    stop() {
      runtimes.clear();
      teardown();
    },
  };
}

export type HfpMonitor = ReturnType<typeof createHfpMonitor>;
