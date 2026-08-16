import { formatClock, formatClockWithSeconds } from "@/lib/transit/timeUtils";
import { isStale, type BoardMode } from "@/lib/transit/boardLogic";
import type { BoardStatus } from "@/lib/transit/useBoard";

type Props = {
  status: BoardStatus;
  now: number;
  mode: BoardMode;
  moreAvailable: boolean;
  onRefresh: () => void;
  onLater: () => void;
  onFullDay: () => void;
  onBackToLive: () => void;
};

export function StatusBar({
  status,
  now,
  mode,
  moreAvailable,
  onRefresh,
  onLater,
  onFullDay,
  onBackToLive,
}: Props) {
  // Cached data and old data are both surfaced as explicitly not-current.
  const stale = status.usingCache || isStale(status.lastSuccessAt, now);

  return (
    <footer className="statusbar">
      {stale && status.lastSuccessAt !== null ? (
        <p className="stale-note" role="status">
          <strong>Tiedot eivät ehkä ole ajan tasalla</strong>
          <span>Viimeisin onnistunut päivitys {formatClock(status.lastSuccessAt)}</span>
        </p>
      ) : null}

      <div className="controls">
        {mode === "LIVE" ? (
          <>
            {moreAvailable ? (
              <button type="button" className="ctrl" onClick={onLater}>
                Näytä myöhemmät
              </button>
            ) : null}
            <button type="button" className="ctrl" onClick={onFullDay}>
              Näytä 24 h
            </button>
          </>
        ) : (
          <button type="button" className="ctrl" onClick={onBackToLive}>
            Takaisin live-näkymään
          </button>
        )}
        <button type="button" className="ctrl ctrl-refresh" onClick={onRefresh}>
          Päivitä
        </button>
      </div>

      <p className="status-line" aria-live="polite">
        {status.lastSuccessAt ? (
          <>Päivitetty {formatClockWithSeconds(status.lastSuccessAt)}</>
        ) : status.loading ? (
          "Haetaan lähtöjä…"
        ) : status.offline ? (
          "Ei verkkoyhteyttä"
        ) : (
          "Reaaliaikatieto ei saatavilla"
        )}
        {mode === "DAY" ? " · aikataulunäkymä 24 h" : ""}
      </p>
    </footer>
  );
}
