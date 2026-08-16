/**
 * Pure Oulunkylä identifier validation.
 *
 * The board must never present another station's departures, so every expected
 * identifier is checked against live Digitransit data. Any failure sets
 * `valid = false` — a diagnostics message alone is not enough.
 */

import { OULUNKYLA, TRAM_LINE } from "./config";

export type ValidationStation = {
  gtfsId: string;
  name: string;
  stops: { gtfsId: string; name?: string }[];
} | null;

export type ValidationStop = {
  gtfsId: string;
  name: string;
  routes: { shortName: string | null; mode?: string | null }[] | null;
} | null;

export type ValidationInput = {
  station: ValidationStation;
  tramA: ValidationStop;
  tramB: ValidationStop;
};

export type ValidationResult = { valid: boolean; diagnostics: string[] };

export function evaluateIdentifiers(data: ValidationInput | null | undefined): ValidationResult {
  const diagnostics: string[] = [];
  let valid = true;
  const fragment = OULUNKYLA.nameFragment;

  const station = data?.station ?? null;
  if (!station || !station.name.toLowerCase().includes(fragment)) {
    valid = false;
    diagnostics.push(`Asematunnus ${OULUNKYLA.stationId} ei vastaa Oulunkylää.`);
  } else {
    const stopIds = (station.stops ?? []).map((s) => s.gtfsId);
    for (const expected of OULUNKYLA.trainStopIds) {
      if (!stopIds.includes(expected)) {
        valid = false;
        diagnostics.push(`Junapysäkki ${expected} ei kuulu asemaan ${station.gtfsId}.`);
      }
    }
  }

  const trams: [string, ValidationStop][] = [
    [OULUNKYLA.tramStopIds[0], data?.tramA ?? null],
    [OULUNKYLA.tramStopIds[1], data?.tramB ?? null],
  ];
  for (const [expectedId, tram] of trams) {
    if (!tram) {
      valid = false;
      diagnostics.push(`Raitiovaunupysäkkiä ${expectedId} ei löytynyt.`);
      continue;
    }
    if (tram.gtfsId !== expectedId) {
      valid = false;
      diagnostics.push(`Raitiovaunupysäkin tunnus ${tram.gtfsId} ei vastaa odotettua ${expectedId}.`);
    }
    if (!tram.name.toLowerCase().includes(fragment)) {
      valid = false;
      diagnostics.push(`Raitiovaunupysäkki ${expectedId} ei vastaa Oulunkylää.`);
      continue;
    }
    const hasLine = (tram.routes ?? []).some((r) => r.shortName === TRAM_LINE);
    if (!hasLine) {
      valid = false;
      diagnostics.push(`Pysäkillä ${expectedId} ei löytynyt linjaa ${TRAM_LINE}.`);
    }
  }

  return { valid, diagnostics };
}
