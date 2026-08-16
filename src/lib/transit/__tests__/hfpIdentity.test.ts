import { describe, expect, it } from "vitest";

import { parseVehiclePosition } from "../hfpService";

function payload(extra: Record<string, unknown>) {
  return JSON.stringify({
    VP: {
      route: "3001I",
      dir: "1",
      oday: "2026-08-15",
      start: "08:42",
      tst: "2026-08-15T05:42:10.000Z",
      spd: 0,
      lat: 60.2401,
      long: 24.9723,
      loc: "GPS",
      oper: 22,
      veh: 411,
      ...extra,
    },
  });
}

describe("physical HFP vehicle identity", () => {
  it("accepts a payload with valid oper and veh", () => {
    const journey = parseVehiclePosition(payload({}));
    expect(journey?.observation.vehicleId).toBe("22/411");
  });

  it("rejects a missing oper", () => {
    expect(parseVehiclePosition(payload({ oper: undefined }))).toBeNull();
    expect(parseVehiclePosition(payload({ oper: null }))).toBeNull();
  });

  it("rejects a missing veh", () => {
    expect(parseVehiclePosition(payload({ veh: undefined }))).toBeNull();
    expect(parseVehiclePosition(payload({ veh: null }))).toBeNull();
  });

  it("rejects an invalid oper", () => {
    expect(parseVehiclePosition(payload({ oper: "abc" }))).toBeNull();
    expect(parseVehiclePosition(payload({ oper: 0 }))).toBeNull();
    expect(parseVehiclePosition(payload({ oper: -3 }))).toBeNull();
  });

  it("rejects an invalid veh", () => {
    expect(parseVehiclePosition(payload({ veh: "" }))).toBeNull();
    expect(parseVehiclePosition(payload({ veh: 1.5 }))).toBeNull();
  });
});
