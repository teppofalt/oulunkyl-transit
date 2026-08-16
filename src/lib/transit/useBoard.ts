/**
 * Board data orchestration:
 *  - Digitransit polling (20 s while the page is visible) — the known-good
 *    baseline; it never depends on HFP
 *  - HFP movement monitoring for departures inside the 30-minute monitoring
 *    horizon only
 *
 * HFP messages (~1 Hz per vehicle) are processed inside the monitor. React
 * reads derived state via monitor.snapshot() on a slow UI tick, so the board
 * never rerenders per GPS packet.
 *
 * Fintraffic is intentionally not part of this phase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchBoard } from "./digitransit.functions";
import {
  DEPARTURE_REFRESH_MS,
  FULL_HORIZON_MINUTES,
  HFP_MAX_MONITORED_TRIPS,
  HFP_MONITORING_HORIZON_MINUTES,
  LATER_STEP_MINUTES,
  LIVE_HORIZON_MINUTES,
  MANUAL_REFRESH_COOLDOWN_MS,
  UI_TICK_MS,
} from "./config";
import { normalizeBoard } from "./departureNormalizer";
import {
  buildMonitoredTrip,
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
};

export function useBoard() {
  const [horizonMinutes, setHorizonMinutes] = useState(LIVE_HORIZON_MINUTES);
  const [payload, setPayload] = useState<BoardPayload | null>(null);
  const [status, setStatus] = useState<BoardStatus>({
    loading: true,
    lastSuccessAt: null,
    error: null,
    keyMissing: false,
    identifiersValid: true,
    diagnostics: [],
    hfpStatus: "closed",
  });
  const [now, setNow] = useState(() => Date.now());
  const [movements, setMovements] = useState<Record<string, MovementInfo>>({});
  const [hfpDiagnostics, setHfpDiagnostics] = useState<TripDiagnostics[]>([]);

  const lastManualRefresh = useRef(0);
  const inFlight = useRef(false);
  const monitor = useRef<HfpMonitor | null>(null);

  const load = useCallback(async (minutes: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetchBoard({ data: { horizonMinutes: minutes } });
      setPayload(result);
      setStatus((prev) => ({
        ...prev,
        loading: false,
        error: null,
        keyMissing: false,
        lastSuccessAt: result.fetchedAt,
        identifiersValid: result.identifiersValid,
        diagnostics: result.diagnostics,
      }));
    } catch (error) {
      const message = (error as Error)?.message ?? "UNKNOWN";
      setStatus((prev) => ({
        ...prev,
        loading: false,
        keyMissing: message.includes("DIGITRANSIT_KEY_MISSING"),
        error: message,
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Initial + polling fetch, paused while the page is hidden.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      void load(horizonMinutes);
      timer = setInterval(() => void load(horizonMinutes), DEPARTURE_REFRESH_MS);
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
  }, [horizonMinutes, load]);

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

  // Slow UI clock: minutes remaining + derived movement state.
  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      if (document.visibilityState !== "visible") return;
      const instance = monitor.current;
      if (!instance) return;
      setMovements(instance.snapshot(nowMs));
      if (import.meta.env.DEV) setHfpDiagnostics(instance.diagnostics(nowMs));
    }, UI_TICK_MS);
    return () => clearInterval(timer);
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

  // Trips relevant to HFP monitoring: not cancelled, arriving inside the
  // monitoring horizon, and not already passed.
  const monitoredTrips = useMemo(() => {
    const limit = now + HFP_MONITORING_HORIZON_MINUTES * 60_000;
    return departures
      .filter((d) => !d.cancelled && d.effectiveArrival >= now - 60_000 && d.effectiveArrival <= limit)
      .slice(0, HFP_MAX_MONITORED_TRIPS)
      .map(buildMonitoredTrip)
      .filter((trip): trip is NonNullable<typeof trip> => trip !== null);
  }, [departures, now]);

  // Reconcile subscriptions whenever the relevant trip set changes; the
  // signature keeps this cheap and avoids duplicate subscriptions.
  const monitoredSignature = monitoredTrips.map((t) => `${t.tripId}@${t.topic}`).join("|");

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
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        monitor.current?.stop();
        setMovements({});
      } else {
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
    void load(horizonMinutes);
    return true;
  }, [horizonMinutes, load]);

  return {
    departures: withMovement,
    status,
    now,
    horizonMinutes,
    refresh,
    showLater: () =>
      setHorizonMinutes((m) => Math.min(FULL_HORIZON_MINUTES, m + LATER_STEP_MINUTES)),
    showFullDay: () => setHorizonMinutes(FULL_HORIZON_MINUTES),
    resetHorizon: () => setHorizonMinutes(LIVE_HORIZON_MINUTES),
    /** Development-only HFP diagnostics. */
    hfpDiagnostics,
    /** Number of departures currently inside the HFP monitoring horizon. */
    monitoredTripCount: monitoredTrips.length,
  };
}
