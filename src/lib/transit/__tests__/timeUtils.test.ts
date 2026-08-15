import { describe, expect, it } from "vitest";

import { formatClock, gtfsToEpochMs, helsinkiDateString, minutesUntil } from "../timeUtils";

/** 2026-08-15 00:00 Europe/Helsinki (DST, UTC+3) as epoch seconds. */
const SERVICE_DAY_SUMMER = Date.UTC(2026, 7, 14, 21, 0, 0) / 1000;
/** 2026-01-15 00:00 Europe/Helsinki (standard time, UTC+2). */
const SERVICE_DAY_WINTER = Date.UTC(2026, 0, 14, 22, 0, 0) / 1000;

describe("time calculations", () => {
  it("converts GTFS service day + seconds to a Helsinki clock (DST)", () => {
    const ms = gtfsToEpochMs(SERVICE_DAY_SUMMER, 8 * 3600 + 42 * 60);
    expect(formatClock(ms)).toBe("08:42");
  });

  it("converts GTFS service day + seconds outside DST", () => {
    const ms = gtfsToEpochMs(SERVICE_DAY_WINTER, 8 * 3600 + 42 * 60);
    expect(formatClock(ms)).toBe("08:42");
  });

  it("handles GTFS times beyond 24:00 crossing midnight", () => {
    const ms = gtfsToEpochMs(SERVICE_DAY_SUMMER, 24 * 3600 + 25 * 60);
    expect(formatClock(ms)).toBe("00:25");
    expect(helsinkiDateString(ms)).toBe("2026-08-16");
  });

  it("rounds minutes up and never returns negative values", () => {
    const now = Date.UTC(2026, 7, 15, 5, 36, 0);
    expect(minutesUntil(now + 6 * 60_000, now)).toBe(6);
    expect(minutesUntil(now + 10_000, now)).toBe(1);
    expect(minutesUntil(now - 45_000, now)).toBe(0);
  });
});
