/**
 * Pure board-refresh state machine.
 *
 * Rule: a refresh in flight NEVER clears data that is already on screen. The
 * payload is replaced only by a successful, normalized response; failures only
 * flip status flags, so departure times stay visible (stale-while-refreshing).
 */

import type { BoardPayload } from "./types";

export type RefreshState = {
  payload: BoardPayload | null;
  /** True only while the very first data set is being fetched. */
  initialLoading: boolean;
  /** True while any refresh is in flight (subtle indicator only). */
  refreshing: boolean;
  lastSuccessAt: number | null;
  error: string | null;
  keyMissing: boolean;
  usingCache: boolean;
};

export function initialRefreshState(cached: BoardPayload | null): RefreshState {
  return {
    payload: cached,
    initialLoading: cached === null,
    refreshing: false,
    lastSuccessAt: cached?.fetchedAt ?? null,
    error: null,
    keyMissing: false,
    usingCache: cached !== null,
  };
}

/** A refresh starts: keep the current payload, only mark it as refreshing. */
export function startRefresh(state: RefreshState): RefreshState {
  return {
    ...state,
    refreshing: true,
    initialLoading: state.payload === null,
  };
}

/** Success: replace the payload atomically. */
export function refreshSucceeded(state: RefreshState, payload: BoardPayload): RefreshState {
  return {
    ...state,
    payload,
    refreshing: false,
    initialLoading: false,
    lastSuccessAt: payload.fetchedAt,
    error: null,
    keyMissing: false,
    usingCache: false,
  };
}

/** Failure: keep the last successful payload visible, flag the error. */
export function refreshFailed(state: RefreshState, message: string): RefreshState {
  return {
    ...state,
    refreshing: false,
    initialLoading: false,
    error: message,
    keyMissing: message.includes("DIGITRANSIT_KEY_MISSING"),
  };
}
