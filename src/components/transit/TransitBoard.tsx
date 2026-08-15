import { useMemo } from "react";

import { DirectionSection } from "./DirectionSection";
import { StatusBar } from "./StatusBar";
import { useBoard } from "@/lib/transit/useBoard";
import type { DirectionGroup } from "@/lib/transit/types";

const TRAIN_GROUPS: DirectionGroup[] = ["HELSINKI", "NORTH"];
const TRAM_GROUPS: DirectionGroup[] = ["KEILANIEMI", "ITAKESKUS"];

export function TransitBoard() {
  const board = useBoard();
  const { departures, status, now, horizonMinutes } = board;

  const grouped = useMemo(() => {
    const map: Record<DirectionGroup, typeof departures> = {
      HELSINKI: [],
      NORTH: [],
      KEILANIEMI: [],
      ITAKESKUS: [],
    };
    for (const departure of departures) map[departure.direction].push(departure);
    return map;
  }, [departures]);

  const blocked = status.keyMissing || !status.identifiersValid;

  return (
    <main className="board">
      <header className="board-header">
        <h1>Oulunkylä</h1>
        <p className="subtitle">Lähtevät junat ja pikaratikka 15</p>
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

      {status.error && !status.keyMissing && status.lastSuccessAt === null ? (
        <div className="alert alert-soft" role="alert">
          <strong>Yhteysvirhe.</strong>
          <span>Reaaliaikatieto ei saatavilla. Yritä päivittää hetken kuluttua.</span>
        </div>
      ) : null}

      {!blocked ? (
        <>
          <section className="group" aria-labelledby="group-trains">
            <h2 className="group-title" id="group-trains">
              JUNAT
            </h2>
            {TRAIN_GROUPS.map((direction) => (
              <DirectionSection
                key={direction}
                direction={direction}
                departures={grouped[direction]}
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
                departures={grouped[direction]}
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
        horizonMinutes={horizonMinutes}
        onRefresh={board.refresh}
        onLater={board.showLater}
        onFullDay={board.showFullDay}
        onReset={board.resetHorizon}
      />
    </main>
  );
}
