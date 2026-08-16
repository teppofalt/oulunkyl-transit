/**
 * Board data orchestration.
 *
 *  - Digitransit polling (20 s, LIVE mode, only while visible) — the known-good
 *    baseline; it never depends on HFP
 *  - HFP movement monitoring only for departures inside the 30-minute
 *    monitoring horizon, only in LIVE mode, only while visible
 *  - a small last-successful board snapshot for instant launch and short
 *    connectivity failures (never presented as fresh data)
 *
 * HFP messages (~1 Hz per vehicle) are processed inside the monitor. React
 * reads derived state via monitor.snapshot() on a slow UI tick, so the board
 * never rerenders per GPS packet.
 *
 * Fintraffic is intentionally not part of this release (see historicalMovement).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchBoard } from "./digitransit.functions";
import {
  DEPARTURE_REFRESH_MS,
  MANUAL_REFRESH_COOLDOWN_MS,
  UI_TICK_MS,
} from "./config";
import { normalizeBoard } from "./departureNormalizer";
import {
  horizonForMode,
  rowsPerDirection,
  selectMonitoredTrips,
  tripSignature,
  type BoardMode,
} from "./boardLogic";
import { loadSnapshot, saveSnapshot } from "./boardSnapshot";
import {
  createHfpMonitor,
  type HfpConnectionStatus,
  type HfpMonitor,
  type TripDiagnostics,
} from "./hfpService";
import { EMPTY_MOVEMENT, type BoardPayload, type Departure, type MovementInfo } from "./types";

export type BoardStatus = {
  loading: boolean;
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

  const [payload, setPayload] = useState<BoardPayload | null>(cached.current?.payload ?? null);
  const [status, setStatus] = useState<BoardStatus>({
    loading: true,
    lastSuccessAt: cached.current?.payload.fetchedAt ?? null,
    error: null,
    keyMissing: false,
    identifiersValid: true,
    diagnostics: [],
    hfpStatus: "closed",
    usingCache: cached.current !== null,
    offline: false,
  });
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
    try {
      const result = await fetchBoard({ data: { horizonMinutes: minutes } });
      setPayload(result);
      saveSnapshot(result, minutes);
      setStatus((prev) => ({
        ...prev,
        loading: false,
        error: null,
        keyMissing: false,
        lastSuccessAt: result.fetchedAt,
        identifiersValid: result.identifiersValid,
        diagnostics: result.diagnostics,
        usingCache: false,
        offline: false,
      }));
    } catch (error) {
      const message = (error as Error)?.message ?? "UNKNOWN";
      setStatus((prev) => ({
        ...prev,
        loading: false,
        keyMissing: message.includes("DIGITRANSIT_KEY_MISSING"),
        error: message,
        offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
      }));
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
      if (mode === "LIVE") {
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
    const instance = createHfpMonitor({
      onStatus: (hfpStatus) => setStatus((prev) => ({ ...prev, hfpStatus })),
    });
    monitor.current = instance;
    return () => {
      instance.stop();
      monitor.current = null;
    };
  }, []);

  // Connectivity signal for the error hierarchy.
  useEffect(() => {
    const update = () =>
      setStatus((prev) => ({
        ...prev,
        offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
      }));
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Slow UI clock: minutes remaining + derived movement state. Stopped while
  // hidden so no timers or movement processing run in the background.
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
      timer = setInterval(tick, UI_TICK_MS);
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
  }, []);

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
  // signature keeps this cheap and avoids duplicate subscriptions.
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
    /** Reveals more of the already-fetched board — no extra API request. */
    showLater: () => setSteps((s) => s + 1),
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
