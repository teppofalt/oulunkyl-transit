/**
 * Pure Fintraffic <-> Digitransit commuter train matching logic.
 * Kept separate from the server function so it is unit-testable.
 */

export const OULUNKYLA_STATION_CODE = "OLK";
export const HELSINKI_STATION_CODE = "HKI";
/** Tolerance between Digitransit and Fintraffic scheduled Oulunkylä time (ms). */
export const SCHEDULE_TOLERANCE_MS = 90_000;

export type FtTimeTableRow = {
  stationShortCode: string;
  type: "ARRIVAL" | "DEPARTURE";
  scheduledTime: string;
  trainStopping?: boolean;
};

export type FtTrain = {
  trainNumber: number;
  departureDate: string;
  commuterLineID?: string | null;
  timeTableRows: FtTimeTableRow[];
};

export type MatchQuery = {
  line: string;
  scheduledArrivalMs: number;
  direction: "HELSINKI" | "NORTH";
};

export function selectCandidates(trains: FtTrain[], query: MatchQuery): FtTrain[] {
  if (!Array.isArray(trains)) return [];
  return trains.filter((train) => {
    if ((train.commuterLineID ?? "").toUpperCase() !== query.line.toUpperCase()) return false;
    const rows = train.timeTableRows ?? [];
    const olkRows = rows.filter(
      (row) => row.stationShortCode === OULUNKYLA_STATION_CODE && row.trainStopping !== false,
    );
    if (olkRows.length === 0) return false;
    const timeMatch = olkRows.some(
      (row) =>
        Math.abs(Date.parse(row.scheduledTime) - query.scheduledArrivalMs) <= SCHEDULE_TOLERANCE_MS,
    );
    if (!timeMatch) return false;

    const olkIndex = rows.findIndex((row) => row.stationShortCode === OULUNKYLA_STATION_CODE);
    const lastHki = rows.map((r) => r.stationShortCode).lastIndexOf(HELSINKI_STATION_CODE);
    if (olkIndex < 0 || lastHki < 0) return false;
    const towardsHelsinki = lastHki > olkIndex;
    return query.direction === "HELSINKI" ? towardsHelsinki : !towardsHelsinki;
  });
}

export type MatchResult = {
  confidence: "EXACT" | "NONE" | "AMBIGUOUS";
  trainNumber: number | null;
  departureDate: string | null;
  candidates: number;
};

/** Only a single surviving candidate is accepted. Never guess. */
export function resolveMatch(trains: FtTrain[], query: MatchQuery): MatchResult {
  const candidates = selectCandidates(trains, query);
  if (candidates.length === 1) {
    const train = candidates[0]!;
    return {
      confidence: "EXACT",
      trainNumber: train.trainNumber,
      departureDate: train.departureDate,
      candidates: 1,
    };
  }
  return {
    confidence: candidates.length > 1 ? "AMBIGUOUS" : "NONE",
    trainNumber: null,
    departureDate: null,
    candidates: candidates.length,
  };
}
