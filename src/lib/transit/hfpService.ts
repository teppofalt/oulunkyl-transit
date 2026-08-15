/**
 * HSL High Frequency Positioning (HFP) client.
 *
 * Purpose is ONLY to derive a movement status for visible departures.
 * No map, no vehicle markers.
 *
 * Safety rule: if a vehicle position cannot be matched unambiguously to the
 * displayed Digitransit trip (route + converted direction + operating day +
 * trip start time), the message is discarded. Never guess.
 */

import mqtt, { type MqttClient } from "mqtt";

import { HFP_BROKER_URL } from "./config";
import { gtfsSecondsToHhmm } from "./timeUtils";
import type { Departure } from "./types";
import type { Observation } from "./stationaryDetector";

export type TrackedTrip = {
  /** Digitransit trip gtfsId. */
  tripId: string;
  /** HFP route id (Digitransit route gtfsId without the feed prefix). */
  hfpRoute: string;
  /** HFP direction (1/2) converted from GTFS directionId (0/1). */
  hfpDirection: number;
  /** Operating day, YYYY-MM-DD. */
  oday: string;
  /** Trip start time inside the operating day, HH:mm. */
  start: string;
  mode: "train" | "tram";
};

export type VehicleSample = Observation & { tripId: string; vehicleId: string };

/** GTFS directionId (0/1) -> HFP direction (1/2). */
export function toHfpDirection(directionId: number | null): number | null {
  if (directionId === 0) return 1;
  if (directionId === 1) return 2;
  return null;
}

export function hfpRouteId(routeGtfsId: string): string {
  const parts = routeGtfsId.split(":");
  return parts[parts.length - 1] ?? routeGtfsId;
}

/** Operating day of a trip start, derived from the GTFS service day. */
function odayFromServiceDay(serviceDaySeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(serviceDaySeconds * 1000));
}

/**
 * Build a trackable HFP descriptor for a departure, or null when the data is
 * insufficient for an unambiguous match.
 */
export function buildTrackedTrip(departure: Departure): TrackedTrip | null {
  const hfpDirection = toHfpDirection(departure.directionId);
  if (hfpDirection === null) return null;
  if (departure.tripStartSeconds === null || departure.tripStartServiceDay === null) return null;
  return {
    tripId: departure.digitransitTripId,
    hfpRoute: hfpRouteId(departure.digitransitRouteId),
    hfpDirection,
    oday: odayFromServiceDay(departure.tripStartServiceDay),
    start: gtfsSecondsToHhmm(departure.tripStartSeconds),
    mode: departure.mode === "TRAIN" ? "train" : "tram",
  };
}

type HfpPayload = {
  VP?: {
    oper?: number;
    veh?: number;
    tst?: string;
    spd?: number | null;
    lat?: number | null;
    long?: number | null;
    route?: string | null;
    dir?: string | null;
    oday?: string | null;
    start?: string | null;
    stop?: number | null;
    drst?: number | null;
  };
};

export type HfpServiceOptions = {
  onSample: (sample: VehicleSample) => void;
  onStatus?: (status: "connecting" | "open" | "closed" | "error") => void;
};

/**
 * Narrow-topic HFP subscription manager. Subscribes only to routes and
 * directions relevant to the currently visible live departures.
 */
export function createHfpService({ onSample, onStatus }: HfpServiceOptions) {
  let client: MqttClient | null = null;
  let topics = new Set<string>();
  let tracked: TrackedTrip[] = [];

  const topicFor = (trip: TrackedTrip) =>
    `/hfp/v2/journey/ongoing/vp/${trip.mode}/+/+/${trip.hfpRoute}/${trip.hfpDirection}/#`;

  function handleMessage(_topic: string, buffer: Uint8Array) {
    let payload: HfpPayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(buffer)) as HfpPayload;
    } catch {
      return;
    }
    const vp = payload.VP;
    if (!vp || !vp.tst) return;

    const route = vp.route ?? "";
    const dir = Number(vp.dir);
    const matches = tracked.filter(
      (trip) =>
        trip.hfpRoute === route &&
        trip.hfpDirection === dir &&
        trip.oday === vp.oday &&
        trip.start === vp.start,
    );
    // Ambiguous or unmatched -> discard, never attach possibly wrong data.
    if (matches.length !== 1) return;

    const ts = Date.parse(vp.tst);
    if (!Number.isFinite(ts)) return;

    onSample({
      tripId: matches[0]!.tripId,
      vehicleId: `${vp.oper ?? "?"}/${vp.veh ?? "?"}`,
      ts,
      speed: typeof vp.spd === "number" ? vp.spd : null,
      lat: typeof vp.lat === "number" ? vp.lat : null,
      lon: typeof vp.long === "number" ? vp.long : null,
      atStop: vp.stop !== null && vp.stop !== undefined ? true : vp.drst === 1,
    });
  }

  function connect() {
    if (client) return;
    onStatus?.("connecting");
    client = mqtt.connect(HFP_BROKER_URL, {
      protocolVersion: 5,
      keepalive: 30,
      reconnectPeriod: 5_000,
      clean: true,
    });
    client.on("connect", () => {
      onStatus?.("open");
      for (const topic of topics) client?.subscribe(topic, { qos: 0 });
    });
    client.on("message", (topic, message) => handleMessage(topic, message));
    client.on("error", () => onStatus?.("error"));
    client.on("close", () => onStatus?.("closed"));
  }

  return {
    /** Replace the tracked trip set; adjusts subscriptions incrementally. */
    setTrips(trips: TrackedTrip[]) {
      tracked = trips;
      const next = new Set(trips.map(topicFor));
      if (next.size === 0) {
        this.stop();
        topics = next;
        return;
      }
      connect();
      for (const topic of topics) {
        if (!next.has(topic)) client?.unsubscribe(topic);
      }
      if (client?.connected) {
        for (const topic of next) {
          if (!topics.has(topic)) client.subscribe(topic, { qos: 0 });
        }
      }
      topics = next;
    },
    stop() {
      client?.end(true);
      client = null;
      onStatus?.("closed");
    },
  };
}
