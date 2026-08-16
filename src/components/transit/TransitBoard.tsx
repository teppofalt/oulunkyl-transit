import { useEffect, useMemo } from "react";

import { DirectionSection } from "./DirectionSection";
import { StatusBar } from "./StatusBar";
import { registerServiceWorker } from "@/lib/transit/pwa";
import { useBoard } from "@/lib/transit/useBoard";
import { DIRECTION_ORDER, groupByDirection } from "@/lib/transit/boardLogic";
import type { DirectionGroup } from "@/lib/transit/types";

const TRAIN_GROUPS: DirectionGroup[] = ["HELSINKI", "NORTH"];
const TRAM_GROUPS: DirectionGroup[] = ["KEILANIEMI", "ITAKESKUS"];

const SUBTITLE: Record<string, string> = {
  LIVE: "Junat ja pikaratikka 15 · seuraava tunti",
  EXTENDED: "Aikataulu · seuraavat 3 h",
  DAY: "Aikataulu · seuraavat 24 h",
};

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
  // Only a true first launch (nothing ever loaded) shows an empty-state notice;
  // a refresh in flight never removes rows that are already on screen.
  const nothingAvailable =
    !blocked && departures.length === 0 && status.lastSuccessAt === null && !status.loading;
  const firstLoad = !blocked && status.loading && departures.length === 0;

  return (
    <main className="board" data-refreshing={status.refreshing ? "true" : "false"}>
      <header className="board-header">
        <h1>Oulunkylä</h1>
        <p className="subtitle">{SUBTITLE[mode]}</p>
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

      {firstLoad ? <p className="placeholder">Haetaan…</p> : null}

      {nothingAvailable ? (
        <div className="alert" role="alert">
          <strong>
            {status.offline ? "Ei verkkoyhteyttä." : "Reaaliaikatieto ei saatavilla."}
          </strong>
          <span>Ajantasaisia liikennetietoja ei voida hakea.</span>
        </div>
      ) : null}

      {!blocked && departures.length > 0 ? (
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
                loading={false}
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
                loading={false}
              />
            ))}
          </section>
        </>
      ) : null}

      <StatusBar
        status={status}
        now={now}
        mode={mode}
        onRefresh={board.refresh}
        onLater={board.showLater}
        onFullDay={board.showFullDay}
        onBackToLive={board.backToLive}
      />
    </main>
  );
}
