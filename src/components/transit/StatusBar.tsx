import { formatClock, formatClockWithSeconds } from "@/lib/transit/timeUtils";
import { isStale, type BoardMode } from "@/lib/transit/boardLogic";
import type { BoardStatus } from "@/lib/transit/useBoard";

type Props = {
  status: BoardStatus;
  now: number;
  mode: BoardMode;
  onRefresh: () => void;
  onLater: () => void;
  onFullDay: () => void;
  onBackToLive: () => void;
};

const MODE_NOTE: Record<BoardMode, string> = {
  LIVE: "",
  EXTENDED: " · aikataulunäkymä 3 h",
  DAY: " · aikataulunäkymä 24 h",
};

export function StatusBar({
  status,
  now,
  mode,
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
        // Important state: announced once when it appears.
        <p className="stale-note" role="status">
          <strong>Tiedot eivät ehkä ole ajan tasalla</strong>
          <span>Viimeisin onnistunut päivitys {formatClock(status.lastSuccessAt)}</span>
        </p>
      ) : null}

      <div className="controls">
        {mode === "LIVE" ? (
          <>
            <button type="button" className="ctrl" onClick={onLater}>
              Näytä myöhemmät
            </button>
            <button type="button" className="ctrl" onClick={onFullDay}>
              Näytä 24 h
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ctrl" onClick={onBackToLive}>
              Takaisin live-näkymään
            </button>
            {mode === "EXTENDED" ? (
              <button type="button" className="ctrl" onClick={onFullDay}>
                Näytä 24 h
              </button>
            ) : null}
          </>
        )}
        <button type="button" className="ctrl ctrl-refresh" onClick={onRefresh}>
          Päivitä
        </button>
      </div>

      {/* Routine timestamp updates are not announced to screen readers. */}
      <p className="status-line" aria-live="off">
        {status.lastSuccessAt ? (
          <>
            Päivitetty {formatClockWithSeconds(status.lastSuccessAt)}
            {status.refreshing ? " · päivitetään…" : ""}
          </>
        ) : status.loading ? (
          "Haetaan lähtöjä…"
        ) : status.offline ? (
          "Ei verkkoyhteyttä"
        ) : (
          "Reaaliaikatieto ei saatavilla"
        )}
        {MODE_NOTE[mode]}
      </p>
    </footer>
  );
}
