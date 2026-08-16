import { describe, expect, it } from "vitest";

import { evaluateIdentifiers, type ValidationInput } from "../identifierValidation";
import { OULUNKYLA } from "../config";

function validInput(): ValidationInput {
  return {
    station: {
      gtfsId: OULUNKYLA.stationId,
      name: "Oulunkylä",
      stops: OULUNKYLA.trainStopIds.map((gtfsId) => ({ gtfsId, name: "Oulunkylä" })),
    },
    tramA: {
      gtfsId: OULUNKYLA.tramStopIds[0],
      name: "Oulunkylän keskusta",
      routes: [{ shortName: "15", mode: "TRAM" }],
    },
    tramB: {
      gtfsId: OULUNKYLA.tramStopIds[1],
      name: "Oulunkylän keskusta",
      routes: [{ shortName: "15", mode: "TRAM" }],
    },
  };
}

describe("identifier validation", () => {
  it("accepts the current production configuration", () => {
    const result = evaluateIdentifiers(validInput());
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("rejects a missing train platform", () => {
    const input = validInput();
    input.station!.stops = [{ gtfsId: OULUNKYLA.trainStopIds[0] }];
    expect(evaluateIdentifiers(input).valid).toBe(false);
  });

  it("rejects a wrong train platform", () => {
    const input = validInput();
    input.station!.stops = [{ gtfsId: "HSL:9999999" }, { gtfsId: "HSL:8888888" }];
    expect(evaluateIdentifiers(input).valid).toBe(false);
  });

  it("rejects a tram stop that does not serve line 15", () => {
    const input = validInput();
    input.tramB!.routes = [{ shortName: "552", mode: "BUS" }];
    expect(evaluateIdentifiers(input).valid).toBe(false);
  });

  it("rejects a missing tram stop", () => {
    const input = validInput();
    input.tramA = null;
    expect(evaluateIdentifiers(input).valid).toBe(false);
  });

  it("rejects a station whose name is not Oulunkylä", () => {
    const input = validInput();
    input.station!.name = "Pasila";
    expect(evaluateIdentifiers(input).valid).toBe(false);
  });

  it("rejects missing data entirely", () => {
    expect(evaluateIdentifiers(null).valid).toBe(false);
  });
});
