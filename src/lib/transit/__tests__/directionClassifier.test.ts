import { describe, expect, it } from "vitest";

import { classifyDirection } from "../directionClassifier";
import type { RawStoptime } from "../types";

function stoptime(overrides: {
  mode: string;
  shortName: string;
  longName?: string;
  headsign?: string | null;
  directionId?: number | null;
}): RawStoptime {
  return {
    stop: { gtfsId: "HSL:1285501", name: "Oulunkylä", code: null, platformCode: "3" },
    serviceDay: 0,
    scheduledArrival: 3600,
    realtimeArrival: 3600,
    arrivalDelay: 0,
    scheduledDeparture: 3630,
    realtimeDeparture: 3630,
    departureDelay: 0,
    realtime: true,
    realtimeState: "SCHEDULED",
    headsign: overrides.headsign ?? null,
    trip: {
      gtfsId: "HSL:1234",
      tripHeadsign: overrides.headsign ?? null,
      directionId: overrides.directionId ?? null,
      departureStoptime: null,
      route: {
        gtfsId: `HSL:${overrides.shortName}`,
        shortName: overrides.shortName,
        longName: overrides.longName ?? null,
        mode: overrides.mode,
      },
    },
  };
}

describe("direction classification", () => {
  it("classifies a train toward Helsinki", () => {
    expect(classifyDirection(stoptime({ mode: "RAIL", shortName: "K", headsign: "Helsinki" }))).toBe(
      "HELSINKI",
    );
  });

  it("classifies a train toward the north", () => {
    expect(classifyDirection(stoptime({ mode: "RAIL", shortName: "K", headsign: "Kerava" }))).toBe(
      "NORTH",
    );
  });

  it("classifies an unlettered new line by headsign, not by line name", () => {
    expect(classifyDirection(stoptime({ mode: "RAIL", shortName: "X", headsign: "Tikkurila" }))).toBe(
      "NORTH",
    );
  });

  it("falls back to route long name plus directionId", () => {
    expect(
      classifyDirection(
        stoptime({
          mode: "RAIL",
          shortName: "P",
          longName: "Helsinki - Lentoasema - Helsinki",
          headsign: null,
          directionId: 1,
        }),
      ),
    ).toBe("HELSINKI");
  });

  it("classifies tram 15 toward Keilaniemi and Itäkeskus", () => {
    expect(
      classifyDirection(stoptime({ mode: "TRAM", shortName: "15", headsign: "Keilaniemi" })),
    ).toBe("KEILANIEMI");
    expect(
      classifyDirection(stoptime({ mode: "TRAM", shortName: "15", headsign: "Itäkeskus" })),
    ).toBe("ITAKESKUS");
  });

  it("ignores other tram lines and unrelated modes", () => {
    expect(classifyDirection(stoptime({ mode: "TRAM", shortName: "10", headsign: "Kirurgi" }))).toBeNull();
    expect(classifyDirection(stoptime({ mode: "BUS", shortName: "506", headsign: "Meilahti" }))).toBeNull();
  });
});
