import { formatClockWithSeconds } from "@/lib/transit/timeUtils";
import { STALE_DATA_MS } from "@/lib/transit/config";
import type { BoardStatus } from "@/lib/transit/useBoard";

type Props = {
  status: BoardStatus;
  now: number;
  horizonMinutes: number;
  onRefresh: () => void;
  onLater: () => void;
  onFullDay: () => void;
  onReset: () => void;
};

export function StatusBar({
  status,
  now,
  horizonMinutes,
  onRefresh,
  onLater,
  onFullDay,
  onReset,
}: Props) {
  const stale =
    status.lastSuccessAt !== null && now - status.lastSuccessAt > STALE_DATA_MS * 2;

  return (
    <footer className="statusbar">
      <div className="controls">
        {horizonMinutes < 24 * 60 ? (
          <>
            <button type="button" className="ctrl" onClick={onLater}>
              Näytä myöhemmät
            </button>
            <button type="button" className="ctrl" onClick={onFullDay}>
              Näytä 24 h
            </button>
          </>
        ) : (
          <button type="button" className="ctrl" onClick={onReset}>
            Näytä seuraava tunti
          </button>
        )}
        <button type="button" className="ctrl ctrl-refresh" onClick={onRefresh}>
          Päivitä
        </button>
      </div>

      <p className="status-line" aria-live="polite">
        {status.lastSuccessAt ? (
          <>
            {stale ? "Tiedot eivät ehkä ole ajan tasalla · " : ""}
            Päivitetty {formatClockWithSeconds(status.lastSuccessAt)}
          </>
        ) : status.loading ? (
          "Haetaan lähtöjä…"
        ) : (
          "Ei tietoja"
        )}
        {horizonMinutes >= 24 * 60 ? " · aikataulunäkymä 24 h" : ""}
      </p>
    </footer>
  );
}
