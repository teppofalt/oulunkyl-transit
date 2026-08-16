import { describe, expect, it } from "vitest";

import {
  SNAPSHOT_KEY,
  loadSnapshot,
  parseSnapshot,
  saveSnapshot,
  serializeSnapshot,
  type SnapshotStorage,
} from "../boardSnapshot";
import type { BoardPayload } from "../types";

function memoryStorage(): SnapshotStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function payload(fetchedAt: number): BoardPayload {
  return {
    fetchedAt,
    identifiersValid: true,
    diagnostics: [],
    sources: [{ sourceId: "HSL:1000210", sourceName: "Oulunkylän asema", stoptimes: [] }],
  };
}

describe("board snapshot", () => {
  it("round-trips a live snapshot and preserves the original fetch time", () => {
    const storage = memoryStorage();
    const at = Date.now() - 120_000;
    expect(saveSnapshot(payload(at), 60, storage)).toBe(true);
    const loaded = loadSnapshot(Date.now(), storage);
    expect(loaded?.payload.fetchedAt).toBe(at);
    expect(loaded?.horizonMinutes).toBe(60);
  });

  it("never caches the 24 h timetable dataset", () => {
    const storage = memoryStorage();
    expect(serializeSnapshot(payload(Date.now()), 1440)).toBeNull();
    expect(saveSnapshot(payload(Date.now()), 1440, storage)).toBe(false);
    expect(storage.map.has(SNAPSHOT_KEY)).toBe(false);
  });

  it("discards snapshots older than the maximum age", () => {
    const old = JSON.stringify({ version: 1, horizonMinutes: 60, payload: payload(1_000) });
    expect(parseSnapshot(old, 1_000 + 7 * 60 * 60 * 1000)).toBeNull();
  });

  it("ignores corrupt or foreign data", () => {
    expect(parseSnapshot("not json", Date.now())).toBeNull();
    expect(parseSnapshot(JSON.stringify({ version: 9 }), Date.now())).toBeNull();
    expect(parseSnapshot(null, Date.now())).toBeNull();
  });

  it("stores no secret-like material", () => {
    const json = serializeSnapshot(payload(Date.now()), 60) ?? "";
    expect(json.toLowerCase()).not.toContain("subscription");
    expect(json.toLowerCase()).not.toContain("authorization");
    expect(json.toLowerCase()).not.toContain("digitransit-subscription-key");
  });
});
