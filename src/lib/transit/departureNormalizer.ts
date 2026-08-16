/** Converts raw Digitransit stoptimes into the normalized Departure model. */

import { classifyDirection, modeFromRoute } from "./directionClassifier";
import { gtfsToEpochMs } from "./timeUtils";
import { PASSED_GRACE_SECONDS } from "./config";
import { EMPTY_MOVEMENT, type BoardPayload, type Departure, type RawStoptime } from "./types";

function isCancelled(stoptime: RawStoptime): boolean {
  const state = (stoptime.realtimeState ?? "").toUpperCase();
  return state === "CANCELED" || state === "CANCELLED";
}

function normalizeOne(stoptime: RawStoptime): Departure | null {
  const trip = stoptime.trip;
  const route = trip?.route;
  if (!trip || !route) return null;

  const mode = modeFromRoute(route.mode);
  const direction = classifyDirection(stoptime);
  if (!mode || !direction) return null;

  // Arrival is the passenger-relevant time at Oulunkylä; fall back to
  // departure values when the feed omits arrival data.
  const scheduledSeconds = stoptime.scheduledArrival ?? stoptime.scheduledDeparture;
  if (scheduledSeconds === null || scheduledSeconds === undefined) return null;

  const realtimeAvailable = stoptime.realtime === true && !isCancelled(stoptime);
  const realtimeSeconds = stoptime.realtimeArrival ?? stoptime.realtimeDeparture ?? null;

  const scheduledArrival = gtfsToEpochMs(stoptime.serviceDay, scheduledSeconds);
  const realtimeArrival =
    realtimeAvailable && realtimeSeconds !== null
      ? gtfsToEpochMs(stoptime.serviceDay, realtimeSeconds)
      : null;

  const delayFromApi = stoptime.arrivalDelay ?? stoptime.departureDelay ?? null;
  const delaySeconds = realtimeAvailable
    ? delayFromApi !== null
      ? delayFromApi
      : realtimeArrival !== null
        ? Math.round((realtimeArrival - scheduledArrival) / 1000)
        : null
    : null;

  const line = route.shortName ?? route.gtfsId.split(":").pop() ?? "?";

  return {
    id: `${trip.gtfsId}|${stoptime.serviceDay}|${stoptime.stop?.gtfsId ?? "?"}`,
    mode,
    line,
    direction,
    headsign: stoptime.headsign ?? trip.tripHeadsign ?? null,
    scheduledArrival,
    realtimeArrival,
    effectiveArrival: realtimeArrival ?? scheduledArrival,
    delaySeconds,
    realtimeAvailable,
    realtimeState: stoptime.realtimeState ?? null,
    cancelled: isCancelled(stoptime),
    platformCode: stoptime.stop?.platformCode ?? null,
    stopId: stoptime.stop?.gtfsId ?? null,
    digitransitTripId: trip.gtfsId,
    digitransitRouteId: route.gtfsId,
    // Digitransit returns directionId as a String scalar ("0"/"1").
    directionId: normalizeDirectionId(trip.directionId),
    serviceDay: stoptime.serviceDay,
    tripStartSeconds: trip.departureStoptime?.scheduledDeparture ?? null,
    tripStartServiceDay: trip.departureStoptime?.serviceDay ?? stoptime.serviceDay,
    scheduledArrivalSeconds: scheduledSeconds,
    movement: EMPTY_MOVEMENT,
    fintrafficTrainNumber: null,
    fintrafficDepartureDate: null,
    fintrafficMatchConfidence: "NONE",
  };
}

/**
 * Normalize, deduplicate and sort a board payload.
 * Deduplication key: trip + service day (station and platform stops overlap).
 */
export function normalizeBoard(
  payload: BoardPayload,
  nowMs: number,
  horizonMinutes: number,
): Departure[] {
  const byKey = new Map<string, Departure>();

  for (const source of payload.sources) {
    for (const stoptime of source.stoptimes ?? []) {
      const departure = normalizeOne(stoptime);
      if (!departure) continue;
      const key = `${departure.digitransitTripId}|${departure.serviceDay}`;
      const existing = byKey.get(key);
      // Prefer the record carrying realtime data / a platform code.
      if (
        !existing ||
        (!existing.realtimeAvailable && departure.realtimeAvailable) ||
        (!existing.platformCode && departure.platformCode)
      ) {
        byKey.set(key, existing ? { ...departure, platformCode: departure.platformCode ?? existing.platformCode } : departure);
      }
    }
  }

  const horizonEnd = nowMs + horizonMinutes * 60_000;
  const floor = nowMs - PASSED_GRACE_SECONDS * 1000;

  return [...byKey.values()]
    .filter((d) => d.effectiveArrival >= floor && d.scheduledArrival <= horizonEnd)
    .sort((a, b) => a.effectiveArrival - b.effectiveArrival);
}
