import { describe, expect, it } from "vitest";

import { initialRefreshState, refreshFailed, refreshSucceeded, startRefresh } from "../boardState";
import type { BoardPayload } from "../types";

function payload(fetchedAt: number, marker: string): BoardPayload {
  return {
    fetchedAt,
    identifiersValid: true,
    diagnostics: [marker],
    train: [],
    tram: [],
  } as unknown as BoardPayload;
}

describe("stale-while-refreshing board state", () => {
  it("shows a first-launch loading state only with no data at all", () => {
    expect(initialRefreshState(null).initialLoading).toBe(true);
    const cached = initialRefreshState(payload(1000, "cache"));
    expect(cached.initialLoading).toBe(false);
    expect(cached.usingCache).toBe(true);
  });

  it("does not clear the current payload when a refresh starts", () => {
    const state = startRefresh(initialRefreshState(payload(1000, "cache")));
    expect(state.payload?.diagnostics).toEqual(["cache"]);
    expect(state.refreshing).toBe(true);
    expect(state.initialLoading).toBe(false);
  });

  it("keeps the last successful payload after a failed refresh", () => {
    const started = startRefresh(initialRefreshState(payload(1000, "cache")));
    const failed = refreshFailed(started, "NETWORK");
    expect(failed.payload?.diagnostics).toEqual(["cache"]);
    expect(failed.error).toBe("NETWORK");
    expect(failed.refreshing).toBe(false);
  });

  it("replaces the payload only on success", () => {
    const started = startRefresh(initialRefreshState(payload(1000, "cache")));
    const ok = refreshSucceeded(started, payload(2000, "fresh"));
    expect(ok.payload?.diagnostics).toEqual(["fresh"]);
    expect(ok.lastSuccessAt).toBe(2000);
    expect(ok.usingCache).toBe(false);
  });

  it("preserves the 60-minute board while an extended request is loading", () => {
    const live = refreshSucceeded(initialRefreshState(null), payload(1000, "60min"));
    const loadingExtended = startRefresh(live);
    expect(loadingExtended.payload?.diagnostics).toEqual(["60min"]);
    expect(loadingExtended.initialLoading).toBe(false);
    const extended = refreshSucceeded(loadingExtended, payload(1500, "180min"));
    expect(extended.payload?.diagnostics).toEqual(["180min"]);
  });

  it("flags a missing server key", () => {
    const state = refreshFailed(startRefresh(initialRefreshState(null)), "DIGITRANSIT_KEY_MISSING");
    expect(state.keyMissing).toBe(true);
  });
});
