/**
 * Fintraffic (rata.digitraffic.fi) is a SUPPLEMENTAL source used only for
 * commuter-train identity and movement history. It never replaces the
 * Digitransit ETA shown to the user. The API is open, so no secret is needed;
 * requests still go through the server to keep the client payload small.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveMatch, OULUNKYLA_STATION_CODE, type FtTrain } from "./trainMatcher";

const BASE = "https://rata.digitraffic.fi/api/v1";
const HEADERS = { "Accept-Encoding": "gzip", "Digitraffic-User": "OulunkylaBoard/1.0" };

export type FintrafficMatch = {
  confidence: "EXACT" | "NONE" | "AMBIGUOUS";
  trainNumber: number | null;
  departureDate: string | null;
  candidates: number;
  reason?: string;
};

/**
 * Conservative matching: operating date + commuter line + Oulunkylä stop +
 * exact scheduled Oulunkylä time + direction. 0 or >1 candidates means
 * NONE / AMBIGUOUS and no history is used.
 */
export const matchTrain = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        line: z.string().min(1).max(4),
        /** Scheduled Oulunkylä arrival, epoch ms. */
        scheduledArrivalMs: z.number().int(),
        direction: z.enum(["HELSINKI", "NORTH"]),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<FintrafficMatch> => {
    let trains: FtTrain[] = [];
    try {
      const url = `${BASE}/live-trains/station/${OULUNKYLA_STATION_CODE}?departure_date=${data.departureDate}&train_categories=Commuter&include_nonstopping=false`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) {
        return { confidence: "NONE", trainNumber: null, departureDate: null, candidates: 0, reason: `HTTP_${response.status}` };
      }
      trains = (await response.json()) as FtTrain[];
    } catch (error) {
      return {
        confidence: "NONE",
        trainNumber: null,
        departureDate: null,
        candidates: 0,
        reason: (error as Error).message,
      };
    }

    if (!Array.isArray(trains)) {
      return { confidence: "NONE", trainNumber: null, departureDate: null, candidates: 0, reason: "BAD_PAYLOAD" };
    }

    return resolveMatch(trains, {
      line: data.line,
      scheduledArrivalMs: data.scheduledArrivalMs,
      direction: data.direction,
    });
  });

export type HistoryPoint = { ts: number; speed: number | null; lat: number | null; lon: number | null };

type LocationRecord = {
  timestamp: string;
  speed?: number | null;
  location?: { coordinates?: [number, number] } | null;
};

/** Recent location history for an EXACT-matched train (speeds are km/h). */
export const trainHistory = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        trainNumber: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ points: HistoryPoint[]; ok: boolean }> => {
    try {
      const url = `${BASE}/train-locations/${data.departureDate}/${data.trainNumber}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) return { points: [], ok: false };
      const records = (await response.json()) as LocationRecord[];
      if (!Array.isArray(records)) return { points: [], ok: false };
      const cutoff = Date.now() - 30 * 60_000;
      const points = records
        .map((record) => {
          const coords = record.location?.coordinates;
          const kmh = typeof record.speed === "number" ? record.speed : null;
          return {
            ts: Date.parse(record.timestamp),
            // Fintraffic reports km/h; the detector works in m/s.
            speed: kmh === null ? null : kmh / 3.6,
            lon: coords ? coords[0] : null,
            lat: coords ? coords[1] : null,
          } satisfies HistoryPoint;
        })
        .filter((p) => Number.isFinite(p.ts) && p.ts >= cutoff)
        .sort((a, b) => a.ts - b.ts);
      return { points, ok: true };
    } catch {
      return { points: [], ok: false };
    }
  });
