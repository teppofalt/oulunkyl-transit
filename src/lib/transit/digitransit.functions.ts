/**
 * Server-side Digitransit access. The subscription key never reaches the
 * browser: it is read inside the handler and used only in this server function.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { OULUNKYLA } from "./config";
import type { BoardPayload, BoardSource } from "./types";

const DIGITRANSIT_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";

const DEPARTURE_FIELDS = `
  stop { gtfsId name code platformCode }
  serviceDay
  scheduledArrival
  realtimeArrival
  arrivalDelay
  scheduledDeparture
  realtimeDeparture
  departureDelay
  realtime
  realtimeState
  headsign
  trip {
    gtfsId
    tripHeadsign
    directionId
    route { gtfsId shortName longName mode }
  }
`;

const BOARD_QUERY = `
query OulunkylaBoard($startTime: Long!, $timeRange: Int!, $trainCount: Int!, $tramCount: Int!) {
  trains: station(id: "${OULUNKYLA.stationId}") {
    gtfsId
    name
    stoptimesWithoutPatterns(
      startTime: $startTime
      timeRange: $timeRange
      numberOfDepartures: $trainCount
      omitCanceled: false
    ) { ${DEPARTURE_FIELDS} }
  }
  tramA: stop(id: "${OULUNKYLA.tramStopIds[0]}") {
    gtfsId
    name
    stoptimesWithoutPatterns(
      startTime: $startTime
      timeRange: $timeRange
      numberOfDepartures: $tramCount
      omitCanceled: false
    ) { ${DEPARTURE_FIELDS} }
  }
  tramB: stop(id: "${OULUNKYLA.tramStopIds[1]}") {
    gtfsId
    name
    stoptimesWithoutPatterns(
      startTime: $startTime
      timeRange: $timeRange
      numberOfDepartures: $tramCount
      omitCanceled: false
    ) { ${DEPARTURE_FIELDS} }
  }
}
`;

const VALIDATION_QUERY = `
query OulunkylaIdentifiers {
  station(id: "${OULUNKYLA.stationId}") {
    gtfsId
    name
    stops { gtfsId name platformCode }
  }
  tramA: stop(id: "${OULUNKYLA.tramStopIds[0]}") { gtfsId name routes { shortName mode } }
  tramB: stop(id: "${OULUNKYLA.tramStopIds[1]}") { gtfsId name routes { shortName mode } }
}
`;

type GraphQLResult<T> = { data?: T; errors?: { message: string }[] };

async function digitransitRequest<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphQLResult<T>> {
  const key = process.env["DIGITRANSIT_SUBSCRIPTION_KEY"];
  if (!key) {
    throw new Error("DIGITRANSIT_KEY_MISSING");
  }
  const response = await fetch(DIGITRANSIT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "digitransit-subscription-key": key,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`DIGITRANSIT_HTTP_${response.status}`);
  }
  return (await response.json()) as GraphQLResult<T>;
}

/** Cached identifier validation (module-level, per server instance). */
let identifierCache: { checkedAt: number; valid: boolean; diagnostics: string[] } | null = null;
const IDENTIFIER_CACHE_MS = 6 * 60 * 60 * 1000;

type ValidationData = {
  station: { gtfsId: string; name: string; stops: { gtfsId: string; name: string }[] } | null;
  tramA: { gtfsId: string; name: string; routes: { shortName: string | null; mode: string | null }[] } | null;
  tramB: { gtfsId: string; name: string; routes: { shortName: string | null; mode: string | null }[] } | null;
};

async function validateIdentifiers(): Promise<{ valid: boolean; diagnostics: string[] }> {
  if (identifierCache && Date.now() - identifierCache.checkedAt < IDENTIFIER_CACHE_MS) {
    return { valid: identifierCache.valid, diagnostics: identifierCache.diagnostics };
  }
  const diagnostics: string[] = [];
  let valid = true;
  try {
    const result = await digitransitRequest<ValidationData>(VALIDATION_QUERY, {});
    const data = result.data;
    const fragment = OULUNKYLA.nameFragment;
    const station = data?.station ?? null;
    if (!station || !station.name.toLowerCase().includes(fragment)) {
      valid = false;
      diagnostics.push(`Asematunnus ${OULUNKYLA.stationId} ei vastaa Oulunkylää.`);
    } else {
      const stopIds = station.stops.map((s) => s.gtfsId);
      for (const expected of OULUNKYLA.trainStopIds) {
        if (!stopIds.includes(expected)) {
          diagnostics.push(`Junapysäkki ${expected} ei kuulu asemaan ${station.gtfsId}.`);
        }
      }
    }
    for (const tram of [data?.tramA, data?.tramB]) {
      if (!tram || !tram.name.toLowerCase().includes(fragment)) {
        valid = false;
        diagnostics.push("Raitiovaunupysäkin tunnus ei vastaa Oulunkylää.");
        continue;
      }
      const has15 = tram.routes?.some((r) => r.shortName === "15");
      if (!has15) diagnostics.push(`Pysäkillä ${tram.gtfsId} ei löytynyt linjaa 15.`);
    }
  } catch (error) {
    diagnostics.push(`Tunnusten tarkistus ei onnistunut: ${(error as Error).message}`);
    // A failed validation must not block the board; treat as unverified.
    return { valid: true, diagnostics };
  }
  identifierCache = { checkedAt: Date.now(), valid, diagnostics };
  return { valid, diagnostics };
}

type BoardData = {
  trains: { gtfsId: string; name: string; stoptimesWithoutPatterns: BoardSource["stoptimes"] } | null;
  tramA: { gtfsId: string; name: string; stoptimesWithoutPatterns: BoardSource["stoptimes"] } | null;
  tramB: { gtfsId: string; name: string; stoptimesWithoutPatterns: BoardSource["stoptimes"] } | null;
};

export const fetchBoard = createServerFn({ method: "GET" })
  .inputValidator((input: { horizonMinutes?: number }) =>
    z.object({ horizonMinutes: z.number().int().min(15).max(1440).default(60) }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<BoardPayload> => {
    const startTime = Math.floor(Date.now() / 1000);
    const timeRange = data.horizonMinutes * 60;
    const wide = data.horizonMinutes > 180;

    const validation = await validateIdentifiers();

    const result = await digitransitRequest<BoardData>(BOARD_QUERY, {
      startTime,
      timeRange,
      trainCount: wide ? 250 : 60,
      tramCount: wide ? 120 : 30,
    });

    if (result.errors?.length) {
      throw new Error(`DIGITRANSIT_GRAPHQL: ${result.errors.map((e) => e.message).join("; ")}`);
    }

    const sources: BoardSource[] = [];
    for (const node of [result.data?.trains, result.data?.tramA, result.data?.tramB]) {
      if (!node) continue;
      sources.push({
        sourceId: node.gtfsId,
        sourceName: node.name,
        stoptimes: node.stoptimesWithoutPatterns ?? [],
      });
    }

    return {
      fetchedAt: Date.now(),
      identifiersValid: validation.valid,
      diagnostics: validation.diagnostics,
      sources,
    };
  });
