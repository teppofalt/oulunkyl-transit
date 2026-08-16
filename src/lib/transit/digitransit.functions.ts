/**
 * Server-side Digitransit access. The subscription key never reaches the
 * browser: it is read inside the handler and used only in this server function.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { OULUNKYLA } from "./config";
import { evaluateIdentifiers, type ValidationInput } from "./identifierValidation";
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
    departureStoptime { scheduledDeparture serviceDay }
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

async function validateIdentifiers(): Promise<{ valid: boolean; diagnostics: string[] }> {
  if (identifierCache && Date.now() - identifierCache.checkedAt < IDENTIFIER_CACHE_MS) {
    return { valid: identifierCache.valid, diagnostics: identifierCache.diagnostics };
  }
  try {
    const result = await digitransitRequest<ValidationInput>(VALIDATION_QUERY, {});
    const outcome = evaluateIdentifiers(result.data ?? null);
    identifierCache = { checkedAt: Date.now(), ...outcome };
    return outcome;
  } catch (error) {
    // A failed validation request must not block the board; treat as unverified
    // (not invalid) and do not cache the outcome.
    return {
      valid: true,
      diagnostics: [`Tunnusten tarkistus ei onnistunut: ${(error as Error).message}`],
    };
  }
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
