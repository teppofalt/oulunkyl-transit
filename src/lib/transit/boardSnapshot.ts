/**
 * Last-known-good board snapshot.
 *
 * Purpose: allow the shell to render something useful immediately on launch and
 * to survive short connectivity failures. The snapshot is intentionally small
 * and stores ONLY the browser-facing normalized server-function payload:
 *  - no secrets, no request headers, no HFP movement state
 *  - `fetchedAt` is preserved verbatim so stale data can never be presented as
 *    freshly fetched
 */

import type { BoardPayload } from "./types";

export const SNAPSHOT_KEY = "oulunkyla.board.v1";
/** Snapshots older than this are discarded outright (ms). */
export const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Hard size guard so localStorage never grows unexpectedly (bytes). */
export const SNAPSHOT_MAX_BYTES = 400_000;

export type BoardSnapshot = {
  version: 1;
  /** Horizon the snapshot was fetched with (minutes). */
  horizonMinutes: number;
  payload: BoardPayload;
};

export type SnapshotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): SnapshotStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Serialize a snapshot, or null when it is not worth persisting. */
export function serializeSnapshot(
  payload: BoardPayload,
  horizonMinutes: number,
): string | null {
  // The 24 h timetable is a browsing mode, not the launch screen; never cache it.
  if (horizonMinutes > 180) return null;
  const snapshot: BoardSnapshot = { version: 1, horizonMinutes, payload };
  const json = JSON.stringify(snapshot);
  if (json.length > SNAPSHOT_MAX_BYTES) return null;
  return json;
}

export function parseSnapshot(json: string | null, nowMs: number): BoardSnapshot | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as BoardSnapshot;
    if (parsed?.version !== 1) return null;
    const fetchedAt = parsed.payload?.fetchedAt;
    if (typeof fetchedAt !== "number") return null;
    if (nowMs - fetchedAt > SNAPSHOT_MAX_AGE_MS) return null;
    if (!Array.isArray(parsed.payload.sources)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSnapshot(
  payload: BoardPayload,
  horizonMinutes: number,
  storage: SnapshotStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  const json = serializeSnapshot(payload, horizonMinutes);
  if (!json) return false;
  try {
    storage.setItem(SNAPSHOT_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function loadSnapshot(
  nowMs: number = Date.now(),
  storage: SnapshotStorage | null = defaultStorage(),
): BoardSnapshot | null {
  if (!storage) return null;
  try {
    return parseSnapshot(storage.getItem(SNAPSHOT_KEY), nowMs);
  } catch {
    return null;
  }
}

export function clearSnapshot(storage: SnapshotStorage | null = defaultStorage()) {
  try {
    storage?.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
