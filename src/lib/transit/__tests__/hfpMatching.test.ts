import { describe, expect, it } from "vitest";

import { toGtfsDirectionId, toHfpDirection } from "../hfpDirection";
import {
  buildMonitoredTrip,
  hfpRouteId,
  parseVehiclePosition,
  resolveJourney,
  topicFor,
  type MonitoredTrip,
} from "../hfpService";
import { EMPTY_MOVEMENT, type Departure } from "../types";

const SERVICE_DAY = Math.floor(Date.UTC(2026, 7, 16, 0, 0, 0) / 1000) - 3 * 3600; // Helsinki midnight

function departure(overrides: Partial<Departure> = {}): Departure {
  return {
    id: "x",
    mode: "TRAM",
    line: "15",
    direction: "KEILANIEMI",
    headsign: "Keilaniemi",
    scheduledArrival: Date.UTC(2026, 7, 16, 9, 0, 0),
    realtimeArrival: null,
    effectiveArrival: Date.UTC(2026, 7, 16, 9, 0, 0),
    delaySeconds: null,
    realtimeAvailable: false,
    realtimeState: null,
    cancelled: false,
    platformCode: null,
    stopId: "HSL:1284401",
    digitransitTripId: "HSL:1015_20260816_Ma_1_0800",
    digitransitRouteId: "HSL:1015",
    directionId: 0,
    serviceDay: SERVICE_DAY,
    tripStartSeconds: 8 * 3600 + 45 * 60,
    tripStartServiceDay: SERVICE_DAY,
    scheduledArrivalSeconds: 9 * 3600,
    movement: EMPTY_MOVEMENT,
    fintrafficTrainNumber: null,
    fintrafficDepartureDate: null,
    fintrafficMatchConfidence: "NONE",
    ...overrides,
  };
}

describe("direction conversion", () => {
  it("maps GTFS 0/1 to HFP 1/2 and back", () => {
    expect(toHfpDirection(0)).toBe(1);
    expect(toHfpDirection(1)).toBe(2);
    expect(toHfpDirection(null)).toBeNull();
    expect(toHfpDirection(7)).toBeNull();
    expect(toGtfsDirectionId(1)).toBe(0);
    expect(toGtfsDirectionId(2)).toBe(1);
    expect(toGtfsDirectionId(3)).toBeNull();
  });
});

describe("monitored trip construction", () => {
  it("uses the trip start time, not the Oulunkylä time", () => {
    const trip = buildMonitoredTrip(departure());
    expect(trip).not.toBeNull();
    expect(trip!.start).toBe("08:45");
    expect(trip!.hfpRoute).toBe("1015");
    expect(trip!.hfpDirection).toBe(1);
    expect(trip!.mode).toBe("tram");
    expect(trip!.oday).toBe("2026-08-16");
    expect(trip!.topic).toBe("/hfp/v2/journey/ongoing/vp/tram/+/+/1015/1/+/08:45/#");
  });

  it("refuses to build a trip without direction or trip start data", () => {
    expect(buildMonitoredTrip(departure({ directionId: null }))).toBeNull();
    expect(buildMonitoredTrip(departure({ tripStartSeconds: null }))).toBeNull();
  });

  it("handles trip starts after midnight (service seconds > 24 h)", () => {
    const trip = buildMonitoredTrip(departure({ tripStartSeconds: 24 * 3600 + 15 * 60 }));
    expect(trip!.start).toBe("00:15");
  });

  it("derives route ids and topics with the future-proof wildcard", () => {
    expect(hfpRouteId("HSL:3001M")).toBe("3001M");
    expect(topicFor({ mode: "train", hfpRoute: "3001M", hfpDirection: 2, start: "07:12" })).toBe(
      "/hfp/v2/journey/ongoing/vp/train/+/+/3001M/2/+/07:12/#",
    );
  });
});

const VP = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    VP: {
      oper: 40,
      veh: 411,
      tst: "2026-08-16T06:00:00.000Z",
      spd: 0,
      lat: 60.2286,
      long: 24.9682,
      loc: "GPS",
      route: "1015",
      dir: "1",
      oday: "2026-08-16",
      start: "08:45",
      stop: 1284401,
      ...extra,
    },
  });

describe("vehicle position parsing", () => {
  it("extracts journey identity and observation fields", () => {
    const journey = parseVehiclePosition(VP());
    expect(journey).not.toBeNull();
    expect(journey!.route).toBe("1015");
    expect(journey!.direction).toBe(1);
    expect(journey!.observation.vehicleId).toBe("40/411");
    expect(journey!.observation.operatorId).toBe(40);
    expect(journey!.observation.vehicleNumber).toBe(411);
    expect(journey!.observation.speedMps).toBe(0);
    expect(journey!.observation.stopId).toBe("1284401");
  });

  it("drops coordinates from unreliable location sources", () => {
    const journey = parseVehiclePosition(VP({ loc: "ODO" }));
    expect(journey!.observation.lat).toBeNull();
    expect(journey!.observation.locationSource).toBe("ODO");
  });

  it("rejects malformed or incomplete payloads", () => {
    expect(parseVehiclePosition("not json")).toBeNull();
    expect(parseVehiclePosition(JSON.stringify({ VP: { tst: "x" } }))).toBeNull();
    expect(parseVehiclePosition(VP({ dir: "9" }))).toBeNull();
  });
});

const TRIP: MonitoredTrip = buildMonitoredTrip(departure())!;

describe("journey resolution", () => {
  it("matches only on route + direction + oday + start", () => {
    const journey = parseVehiclePosition(VP())!;
    expect(resolveJourney([TRIP], journey).status).toBe("MATCHED");
    expect(resolveJourney([TRIP], { ...journey, start: "08:46" }).status).toBe("NONE");
    expect(resolveJourney([TRIP], { ...journey, oday: "2026-08-17" }).status).toBe("NONE");
    expect(resolveJourney([TRIP], { ...journey, direction: 2 }).status).toBe("NONE");
    expect(resolveJourney([TRIP], { ...journey, route: "1015K" }).status).toBe("NONE");
  });

  it("reports AMBIGUOUS instead of guessing when several trips match", () => {
    const other = { ...TRIP, tripId: "HSL:other" };
    const journey = parseVehiclePosition(VP())!;
    expect(resolveJourney([TRIP, other], journey).status).toBe("AMBIGUOUS");
  });
});
