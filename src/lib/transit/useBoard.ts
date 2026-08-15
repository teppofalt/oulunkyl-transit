/**
 * Board data orchestration:
 *  - Digitransit polling (20 s while visible)
 *  - HFP movement streaming for live-horizon departures only
 *  - Fintraffic history seeding for EXACT-matched commuter trains
 *
 * HFP messages (up to ~1 Hz per vehicle) are written into refs; presentation
 * state is refreshed on a slower UI tick so the board does not rerender per
 * GPS packet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchBoard } from "./digitransit.functions";
import { matchTrain, trainHistory, type FintrafficMatch } from "./fintraffic.functions";
import {
  DEPARTURE_REFRESH_MS,
  FULL_HORIZON_MINUTES,
  LATER_STEP_MINUTES,
  LIVE_HORIZON_MINUTES,
  MANUAL_REFRESH_COOLDOWN_MS,
  UI_TICK_MS,
} from "./config";
import { normalizeBoard } from "./departureNormalizer";
import {
  addObservation,
  createState,
  evaluate,
  seedHistory,
  stationaryFromHistory,
  type DetectorState,
} from "./stationaryDetector";
import { buildTrackedTrip, createHfpService, type VehicleSample } from "./hfpService";
import { helsinkiDateString } from "./timeUtils";
import { EMPTY_MOVEMENT, type BoardPayload, type Departure, type MovementInfo } from "./types";

export type BoardStatus = {
  loading: boolean;
  lastSuccessAt: number | null;
  error: string | null;
  keyMissing: boolean;
  identifiersValid: boolean;
  diagnostics: string[];
  hfpStatus: "connecting" | "open" | "closed" | "error";
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

  const detectors = useRef(new Map<string, DetectorState>());
  const vehicleIds = useRef(new Map<string, string>());
  const fintrafficCache = useRef(new Map<string, FintrafficMatch>());
  const historySeeded = useRef(new Set<string>());
  const lastManualRefresh = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (minutes: number) => {
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
    },
    [],
  );

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

  // Slow UI clock: minutes remaining + stationary durations.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      const nowMs = Date.now();
      const next: Record<string, MovementInfo> = {};
      for (const [tripId, state] of detectors.current) {
        const { state: updated, info } = evaluate(state, nowMs);
        detectors.current.set(tripId, updated);
        next[tripId] = { ...info, hfpVehicleId: vehicleIds.current.get(tripId) ?? null };
      }
      setMovements(next);
    }, UI_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const departures = useMemo(
    () => (payload ? normalizeBoard(payload, now, horizonMinutes) : []),
    [payload, now, horizonMinutes],
  );

  const withMovement = useMemo(
    () =>
      departures.map((departure) => {
        const movement = movements[departure.digitransitTripId] ?? EMPTY_MOVEMENT;
        const match = fintrafficCache.current.get(departure.digitransitTripId);
        return {
          ...departure,
          movement,
          fintrafficTrainNumber: match?.trainNumber ?? null,
          fintrafficDepartureDate: match?.departureDate ?? null,
          fintrafficMatchConfidence: match?.confidence ?? "NONE",
        } satisfies Departure;
      }),
    [departures, movements],
  );

  // HFP: subscribe only to departures inside the live horizon.
  const hfp = useRef<ReturnType<typeof createHfpService> | null>(null);
  useEffect(() => {
    const service = createHfpService({
      onSample: (sample: VehicleSample) => {
        const existing = detectors.current.get(sample.tripId) ?? createState();
        detectors.current.set(sample.tripId, addObservation(existing, sample, Date.now()));
        vehicleIds.current.set(sample.tripId, sample.vehicleId);
      },
      onStatus: (hfpStatus) => setStatus((prev) => ({ ...prev, hfpStatus })),
    });
    hfp.current = service;
    return () => {
      service.stop();
      hfp.current = null;
    };
  }, []);

  const liveTripIds = useMemo(() => {
    const limit = now + LIVE_HORIZON_MINUTES * 60_000;
    return departures
      .filter((d) => !d.cancelled && d.effectiveArrival <= limit)
      .map((d) => d.digitransitTripId)
      .join(",");
  }, [departures, now]);

  useEffect(() => {
    if (!hfp.current) return;
    if (document.visibilityState !== "visible") {
      hfp.current.setTrips([]);
      return;
    }
    const ids = new Set(liveTripIds.split(",").filter(Boolean));
    const trips = departures
      .filter((d) => ids.has(d.digitransitTripId))
      .map(buildTrackedTrip)
      .filter((t): t is NonNullable<typeof t> => t !== null);
    hfp.current.setTrips(trips);
    // Drop detector state for departures no longer visible.
    for (const tripId of [...detectors.current.keys()]) {
      if (!ids.has(tripId)) {
        detectors.current.delete(tripId);
        vehicleIds.current.delete(tripId);
      }
    }
  }, [liveTripIds, departures]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") hfp.current?.setTrips([]);
      else void load(horizonMinutes);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [horizonMinutes, load]);

  // Fintraffic: conservative match + history seeding for approaching trains.
  useEffect(() => {
    const soon = now + 30 * 60_000;
    const candidates = departures.filter(
      (d) =>
        d.mode === "TRAIN" &&
        !d.cancelled &&
        d.effectiveArrival <= soon &&
        (d.direction === "HELSINKI" || d.direction === "NORTH") &&
        !historySeeded.current.has(d.digitransitTripId),
    );
    let cancelled = false;

    void (async () => {
      for (const departure of candidates.slice(0, 4)) {
        historySeeded.current.add(departure.digitransitTripId);
        try {
          let match = fintrafficCache.current.get(departure.digitransitTripId);
          if (!match) {
            match = await matchTrain({
              data: {
                departureDate: helsinkiDateString(departure.scheduledArrival),
                line: departure.line,
                scheduledArrivalMs: departure.scheduledArrival,
                direction: departure.direction as "HELSINKI" | "NORTH",
              },
            });
            fintrafficCache.current.set(departure.digitransitTripId, match);
          }
          // Only EXACT matches may contribute historical stationary time.
          if (match.confidence !== "EXACT" || !match.trainNumber || !match.departureDate) continue;
          const history = await trainHistory({
            data: { departureDate: match.departureDate, trainNumber: match.trainNumber },
          });
          if (cancelled || !history.ok || history.points.length === 0) continue;
          const summary = stationaryFromHistory(history.points, Date.now());
          if (summary.seconds <= 0 && !summary.incomplete) continue;
          const existing = detectors.current.get(departure.digitransitTripId) ?? createState();
          detectors.current.set(
            departure.digitransitTripId,
            seedHistory(existing, summary.seconds, summary.incomplete, summary.since),
          );
        } catch {
          // Fintraffic is supplemental: failures must never block the board.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departures, now]);

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
    showLater: () => setHorizonMinutes((m) => Math.min(FULL_HORIZON_MINUTES, m + LATER_STEP_MINUTES)),
    showFullDay: () => setHorizonMinutes(FULL_HORIZON_MINUTES),
    resetHorizon: () => setHorizonMinutes(LIVE_HORIZON_MINUTES),
    diagnosticsData: { fintraffic: fintrafficCache.current, detectors: detectors.current },
  };
}
