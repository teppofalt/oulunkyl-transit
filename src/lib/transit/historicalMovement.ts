/**
 * Boundary for an OPTIONAL future historical-movement provider (e.g. Fintraffic
 * train history). Nothing in this release performs network activity: the noop
 * provider is the only implementation and it is not wired into the board.
 *
 * Keeping the interface here means a later provider can be added without
 * touching the Digitransit or HFP code paths.
 */

import type { MovementSummary } from "./types";

export type HistoricalMovementQuery = {
  /** Digitransit trip gtfsId the caller wants history for. */
  tripId: string;
  /** Operating day, YYYY-MM-DD. */
  oday: string;
  /** Window of interest, epoch ms. */
  fromMs: number;
  toMs: number;
};

export type HistoricalMovementResult = MovementSummary & {
  /** Provider identity for diagnostics; never a secret. */
  provider: string;
  /** True when the provider had no usable data. */
  unavailable: boolean;
};

export interface HistoricalMovementProvider {
  readonly id: string;
  getHistoricalMovement(query: HistoricalMovementQuery): Promise<HistoricalMovementResult | null>;
}

/** Default provider: always unavailable, zero network activity. */
export const noopHistoricalMovementProvider: HistoricalMovementProvider = {
  id: "noop",
  async getHistoricalMovement() {
    return null;
  },
};
