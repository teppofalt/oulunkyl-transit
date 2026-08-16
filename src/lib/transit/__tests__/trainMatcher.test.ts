import { describe, expect, it } from "vitest";

import { resolveMatch, type FtTrain } from "../trainMatcher";

const OLK_TIME = "2026-08-15T05:42:00.000Z";
const OLK_MS = Date.parse(OLK_TIME);

function train(
  overrides: Partial<FtTrain> & {
    line: string;
    olkTime?: string;
    toHelsinki?: boolean;
    number: number;
  },
): FtTrain {
  const olkTime = overrides.olkTime ?? OLK_TIME;
  const toHelsinki = overrides.toHelsinki ?? true;
  const rows = toHelsinki
    ? [
        {
          stationShortCode: "KE",
          type: "DEPARTURE" as const,
          scheduledTime: "2026-08-15T05:10:00.000Z",
        },
        {
          stationShortCode: "OLK",
          type: "ARRIVAL" as const,
          scheduledTime: olkTime,
          trainStopping: true,
        },
        {
          stationShortCode: "HKI",
          type: "ARRIVAL" as const,
          scheduledTime: "2026-08-15T05:55:00.000Z",
        },
      ]
    : [
        {
          stationShortCode: "HKI",
          type: "DEPARTURE" as const,
          scheduledTime: "2026-08-15T05:30:00.000Z",
        },
        {
          stationShortCode: "OLK",
          type: "ARRIVAL" as const,
          scheduledTime: olkTime,
          trainStopping: true,
        },
        {
          stationShortCode: "KE",
          type: "ARRIVAL" as const,
          scheduledTime: "2026-08-15T06:15:00.000Z",
        },
      ];
  return {
    trainNumber: overrides.number,
    departureDate: "2026-08-15",
    commuterLineID: overrides.line,
    timeTableRows: rows,
  };
}

const query = { line: "K", scheduledArrivalMs: OLK_MS, direction: "HELSINKI" as const };

describe("Fintraffic train matching", () => {
  it("accepts exactly one match", () => {
    const result = resolveMatch([train({ line: "K", number: 1234 })], query);
    expect(result).toMatchObject({ confidence: "EXACT", trainNumber: 1234, candidates: 1 });
  });

  it("returns NONE when nothing matches", () => {
    expect(resolveMatch([], query).confidence).toBe("NONE");
  });

  it("returns AMBIGUOUS for two possible trains", () => {
    const result = resolveMatch(
      [train({ line: "K", number: 1 }), train({ line: "K", number: 2 })],
      query,
    );
    expect(result).toMatchObject({ confidence: "AMBIGUOUS", trainNumber: null, candidates: 2 });
  });

  it("rejects the wrong commuter line", () => {
    expect(resolveMatch([train({ line: "I", number: 9 })], query).confidence).toBe("NONE");
  });

  it("rejects the same line at the wrong scheduled time", () => {
    const result = resolveMatch(
      [train({ line: "K", number: 9, olkTime: "2026-08-15T05:52:00.000Z" })],
      query,
    );
    expect(result.confidence).toBe("NONE");
  });

  it("rejects the opposite direction", () => {
    const result = resolveMatch([train({ line: "K", number: 9, toHelsinki: false })], query);
    expect(result.confidence).toBe("NONE");
  });
});
