import { useEffect, useMemo } from "react";

import { DirectionSection } from "./DirectionSection";
import { StatusBar } from "./StatusBar";
import { registerServiceWorker } from "@/lib/transit/pwa";
import { useBoard } from "@/lib/transit/useBoard";
import { DIRECTION_ORDER, groupByDirection, hasHiddenDepartures } from "@/lib/transit/boardLogic";
import type { DirectionGroup } from "@/lib/transit/types";

const TRAIN_GROUPS: DirectionGroup[] = ["HELSINKI", "NORTH"];
const TRAM_GROUPS: DirectionGroup[] = ["KEILANIEMI", "ITAKESKUS"];

export function TransitBoard() {
  const board = useBoard();
  const { departures, status, now, mode } = board;

  useEffect(() => registerServiceWorker(), []);

  const grouped = useMemo(() => groupByDirection(departures), [departures]);

  const limit = board.rowsPerDirection;
  const visible = useMemo(() => {
    const map = {} as Record<DirectionGroup, typeof departures>;
    for (const direction of DIRECTION_ORDER) {
      map[direction] = Number.isFinite(limit)
        ? grouped[direction].slice(0, limit)
        : grouped[direction];
    }
    return map;
  }, [grouped, limit]);

  const blocked = status.keyMissing || !status.identifiersValid;
  const nothingAvailable =
    !blocked && departures.length === 0 && status.lastSuccessAt === null && !status.loading;
  const moreAvailable = Number.isFinite(limit) && hasHiddenDepartures(grouped, limit);

  return (
    <main className="board">
      <header className="board-header">
        <h1>Oulunkylä</h1>
        <p className="subtitle">
          {mode === "DAY" ? "Aikataulu · seuraavat 24 h" : "Junat ja pikaratikka 15 · seuraava tunti"}
        </p>
      </header>

      {status.keyMissing ? (
        <div className="alert" role="alert">
          <strong>Reaaliaikapalvelun avain puuttuu.</strong>
          <span>
            Lisää Digitransit-tilausavain palvelimen salaisuudeksi, niin lähdöt näkyvät heti.
          </span>
        </div>
      ) : null}

      {!status.identifiersValid ? (
        <div className="alert" role="alert">
          <strong>Pysäkkitunnukset eivät vastaa Oulunkylää.</strong>
          <span>Lähtöjä ei näytetä, jotta väärän aseman tietoja ei esitetä.</span>
        </div>
      ) : null}

      {nothingAvailable ? (
        <div className="alert" role="alert">
          <strong>{status.offline ? "Ei verkkoyhteyttä." : "Reaaliaikatieto ei saatavilla."}</strong>
          <span>Ajantasaisia liikennetietoja ei voida hakea.</span>
        </div>
      ) : null}

      {!blocked && !nothingAvailable ? (
        <>
          <section className="group" aria-labelledby="group-trains">
            <h2 className="group-title" id="group-trains">
              JUNAT
            </h2>
            {TRAIN_GROUPS.map((direction) => (
              <DirectionSection
                key={direction}
                direction={direction}
                departures={visible[direction]}
                now={now}
                loading={status.loading}
              />
            ))}
          </section>

          <section className="group" aria-labelledby="group-tram">
            <h2 className="group-title" id="group-tram">
              PIKARATIKKA 15
            </h2>
            {TRAM_GROUPS.map((direction) => (
              <DirectionSection
                key={direction}
                direction={direction}
                departures={visible[direction]}
                now={now}
                loading={status.loading}
              />
            ))}
          </section>
        </>
      ) : null}

      <StatusBar
        status={status}
        now={now}
        mode={mode}
        moreAvailable={moreAvailable}
        onRefresh={board.refresh}
        onLater={board.showLater}
        onFullDay={board.showFullDay}
        onBackToLive={board.backToLive}
      />
    </main>
  );
}
