/**
 * Real Europe/Helsinki daylight-saving transition coverage.
 *
 * 2026 spring forward: Sun 29 March 03:00 EET → 04:00 EEST
 * 2026 autumn back:    Sun 25 October 04:00 EEST → 03:00 EET
 */

import { describe, expect, it } from "vitest";

import { formatClock, gtfsToEpochMs, helsinkiDateString, minutesUntil } from "../timeUtils";

/** 2026-03-29 00:00 Helsinki (still EET, UTC+2). */
const SPRING_SERVICE_DAY = Date.UTC(2026, 2, 28, 22, 0, 0) / 1000;
/** 2026-10-25 00:00 Helsinki (still EEST, UTC+3). */
const AUTUMN_SERVICE_DAY = Date.UTC(2026, 9, 24, 21, 0, 0) / 1000;

describe("Helsinki DST transitions", () => {
  it("spring: the operating day is anchored at noon minus 12 h (GTFS spec)", () => {
    // Helsinki noon on 2026-03-29 is 09:00 UTC (EEST), so the operating day
    // starts at 21:00 UTC on 2026-03-28 — 23:00 local, still EET.
    const ms = gtfsToEpochMs(SPRING_SERVICE_DAY, 1 * 3600 + 30 * 60);
    expect(ms).toBe(Date.UTC(2026, 2, 28, 22, 30, 0));
    expect(formatClock(ms)).toBe("00:30");
  });

  it("spring: GTFS 05:00 on the transition day is 05:00 local (UTC+3)", () => {
    const ms = gtfsToEpochMs(SPRING_SERVICE_DAY, 5 * 3600);
    expect(formatClock(ms)).toBe("05:00");
    expect(ms).toBe(Date.UTC(2026, 2, 29, 2, 0, 0));
    expect(helsinkiDateString(ms)).toBe("2026-03-29");
  });

  it("spring: the missing hour does not create a one-hour offset error", () => {
    // The instant is exactly 3.5 h after the operating day started, and the
    // displayed Helsinki clock skips from 02:xx straight to 04:xx.
    const ms = gtfsToEpochMs(SPRING_SERVICE_DAY, 3 * 3600 + 30 * 60);
    expect(ms).toBe(Date.UTC(2026, 2, 29, 0, 30, 0));
    expect(formatClock(ms)).toBe("02:30");
    expect(minutesUntil(ms, Date.UTC(2026, 2, 29, 0, 0, 0))).toBe(30);
    // One hour later in wall-clock terms the Helsinki clock reads 04:30.
    expect(formatClock(gtfsToEpochMs(SPRING_SERVICE_DAY, 4 * 3600 + 30 * 60))).toBe("04:30");
  });

  it("autumn: GTFS 05:00 on the transition day is 05:00 local (UTC+2)", () => {
    const ms = gtfsToEpochMs(AUTUMN_SERVICE_DAY, 5 * 3600);
    expect(formatClock(ms)).toBe("05:00");
    expect(ms).toBe(Date.UTC(2026, 9, 25, 3, 0, 0));
    expect(helsinkiDateString(ms)).toBe("2026-10-25");
  });

  it("autumn: after-midnight GTFS times stay on the right operating day", () => {
    const ms = gtfsToEpochMs(AUTUMN_SERVICE_DAY, 25 * 3600 + 15 * 60);
    expect(helsinkiDateString(ms)).toBe("2026-10-26");
    expect(formatClock(ms)).toBe("01:15");
  });
});
