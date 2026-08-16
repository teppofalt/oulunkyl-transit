/**
 * Board data orchestration.
 *
 *  - Digitransit polling (20 s, live modes, only while visible) — the known-good
 *    baseline; it never depends on HFP
 *  - HFP movement monitoring only for departures inside the 30-minute
 *    monitoring horizon, never in the 24 h timetable mode, only while visible
 *  - a small last-successful board snapshot for instant launch and short
 *    connectivity failures (never presented as fresh data)
 *  - stale-while-refreshing: a request in flight never clears visible rows
 *
 * HFP messages (~1 Hz per vehicle) are processed inside the monitor. React
 * reads derived state via monitor.snapshot() on a slow UI tick, so the board
 * never rerenders per GPS packet.
 *
 * Fintraffic is intentionally not part of this release (see historicalMovement).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchBoard } from "./digitransit.functions";
import { DEPARTURE_REFRESH_MS, MANUAL_REFRESH_COOLDOWN_MS } from "./config";
import { normalizeBoard } from "./departureNormalizer";
import {
  horizonForMode,
  rowsPerDirection,
  selectMonitoredTrips,
  tripSignature,
  uiTickForMode,
  type BoardMode,
} from "./boardLogic";
import {
  initialRefreshState,
  refreshFailed,
  refreshSucceeded,
  startRefresh,
  type RefreshState,
} from "./boardState";
import { loadSnapshot, saveSnapshot } from "./boardSnapshot";
import {
  createHfpMonitor,
  type HfpConnectionStatus,
  type HfpMonitor,
  type TripDiagnostics,
} from "./hfpService";
import { EMPTY_MOVEMENT, type Departure, type MovementInfo } from "./types";

export type BoardStatus = {
  /** True only before any data at all exists (first launch). */
  loading: boolean;
  /** True while a refresh is in flight, with data already on screen. */
  refreshing: boolean;
  lastSuccessAt: number | null;
  error: string | null;
  keyMissing: boolean;
  identifiersValid: boolean;
  diagnostics: string[];
  hfpStatus: HfpConnectionStatus;
  /** Rendering data that came from the local snapshot, not from this session. */
  usingCache: boolean;
  offline: boolean;
};

export function useBoard() {
  const [mode, setMode] = useState<BoardMode>("LIVE");
  const [steps, setSteps] = useState(0);
  const cached = useRef<ReturnType<typeof loadSnapshot>>(null);
  if (cached.current === null && typeof window !== "undefined") {
    cached.current = loadSnapshot();
  }

  const [refreshState, setRefreshState] = useState<RefreshState>(() =>
    initialRefreshState(cached.current?.payload ?? null),
  );
  const [hfpStatus, setHfpStatus] = useState<HfpConnectionStatus>("closed");
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [movements, setMovements] = useState<Record<string, MovementInfo>>({});
  const [hfpDiagnostics, setHfpDiagnostics] = useState<TripDiagnostics[]>([]);

  const lastManualRefresh = useRef(0);
  const inFlight = useRef(false);
  const monitor = useRef<HfpMonitor | null>(null);
  const horizonMinutes = horizonForMode(mode);

  const load = useCallback(async (minutes: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    // Existing rows stay on screen: only the refreshing flag changes here.
    setRefreshState((prev) => startRefresh(prev));
    try {
      const result = await fetchBoard({ data: { horizonMinutes: minutes } });
      saveSnapshot(result, minutes);
      setRefreshState((prev) => refreshSucceeded(prev, result));
    } catch (error) {
      const message = (error as Error)?.message ?? "UNKNOWN";
      setRefreshState((prev) => refreshFailed(prev, message));
      setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Initial + polling fetch. Paused while hidden; the 24 h timetable is fetched
  // once instead of every 20 seconds.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      void load(horizonMinutes);
      if (mode !== "DAY") {
        timer = setInterval(() => void load(horizonMinutes), DEPARTURE_REFRESH_MS);
      }
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        stop();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [horizonMinutes, mode, load]);

  // HFP monitor lifecycle.
  useEffect(() => {
    const instance = createHfpMonitor({ onStatus: setHfpStatus });
    monitor.current = instance;
    return () => {
      instance.stop();
      monitor.current = null;
    };
  }, []);

  // Connectivity signal for the error hierarchy.
  useEffect(() => {
    const update = () => setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // UI clock: minutes remaining + derived movement state. Slower in the long
  // timetable modes, stopped while hidden.
  const tickMs = uiTickForMode(mode);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const nowMs = Date.now();
      setNow(nowMs);
      const instance = monitor.current;
      if (!instance) return;
      setMovements(instance.snapshot(nowMs));
      if (import.meta.env.DEV) setHfpDiagnostics(instance.diagnostics(nowMs));
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(tick, tickMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tickMs]);

  const payload = refreshState.payload;

  const status: BoardStatus = useMemo(
    () => ({
      loading: refreshState.initialLoading,
      refreshing: refreshState.refreshing,
      lastSuccessAt: refreshState.lastSuccessAt,
      error: refreshState.error,
      keyMissing: refreshState.keyMissing,
      identifiersValid: payload?.identifiersValid ?? true,
      diagnostics: payload?.diagnostics ?? [],
      hfpStatus,
      usingCache: refreshState.usingCache,
      offline,
    }),
    [refreshState, payload, hfpStatus, offline],
  );

  const departures = useMemo(
    () => (payload ? normalizeBoard(payload, now, horizonMinutes) : []),
    [payload, now, horizonMinutes],
  );

  const withMovement = useMemo(
    () =>
      departures.map(
        (departure) =>
          ({
            ...departure,
            movement: movements[departure.digitransitTripId] ?? EMPTY_MOVEMENT,
          }) satisfies Departure,
      ),
    [departures, movements],
  );

  const monitoredTrips = useMemo(
    () =>
      selectMonitoredTrips(departures, now, {
        mode,
        visible: typeof document === "undefined" || document.visibilityState === "visible",
      }),
    [departures, now, mode],
  );

  // Reconcile subscriptions whenever the relevant trip set changes; the
  // signature keeps this cheap, avoids duplicate subscriptions and — because a
  // routine 20 s refresh yields the same signature — preserves HFP state and
  // observation history for trips that are still on the board.
  const monitoredSignature = tripSignature(monitoredTrips);

  useEffect(() => {
    const instance = monitor.current;
    if (!instance) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      instance.setTrips([]);
      return;
    }
    instance.setTrips(monitoredTrips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoredSignature]);

  // Battery: suspend HFP while hidden, resume + refresh when visible again.
  // Stopping the monitor discards all observation history, so a hidden interval
  // can never be counted as observed stationary time.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        monitor.current?.stop();
        setMovements({});
      } else {
        setNow(Date.now());
        void load(horizonMinutes);
        monitor.current?.setTrips(monitoredTrips);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [horizonMinutes, load, monitoredTrips]);

  const refresh = useCallback(() => {
    const elapsed = Date.now() - lastManualRefresh.current;
    if (elapsed < MANUAL_REFRESH_COOLDOWN_MS) return false;
    lastManualRefresh.current = Date.now();
    setNow(Date.now());
    void load(horizonMinutes);
    monitor.current?.setTrips(monitoredTrips);
    return true;
  }, [horizonMinutes, load, monitoredTrips]);

  return {
    departures: withMovement,
    status,
    now,
    mode,
    horizonMinutes,
    rowsPerDirection: rowsPerDirection(mode, steps),
    refresh,
    /** Extends the fetched horizon to 180 minutes (a new Digitransit request). */
    showLater: () => {
      setSteps(0);
      setMode("EXTENDED");
    },
    showFullDay: () => {
      setSteps(0);
      setMode("DAY");
    },
    backToLive: () => {
      setSteps(0);
      setMode("LIVE");
    },
    /** Development-only HFP diagnostics. */
    hfpDiagnostics,
    /** Number of departures currently inside the HFP monitoring horizon. */
    monitoredTripCount: monitoredTrips.length,
  };
}
