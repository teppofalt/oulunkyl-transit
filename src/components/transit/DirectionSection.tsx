import { DepartureRow } from "./DepartureRow";
import type { Departure, DirectionGroup } from "@/lib/transit/types";

const TITLES: Record<DirectionGroup, string> = {
  HELSINKI: "HELSINKI ↓",
  NORTH: "POHJOINEN ↑",
  KEILANIEMI: "KEILANIEMI",
  ITAKESKUS: "ITÄ",
};

type Props = {
  direction: DirectionGroup;
  departures: Departure[];
  now: number;
  loading: boolean;
};

export function DirectionSection({ direction, departures, now, loading }: Props) {
  return (
    <section className="direction" aria-labelledby={`dir-${direction}`}>
      <h3 className="direction-title" id={`dir-${direction}`}>
        {TITLES[direction]}
      </h3>
      {departures.length === 0 ? (
        <p className="empty">{loading ? "Haetaan…" : "Ei lähtöjä tällä aikavälillä"}</p>
      ) : (
        <ul className="rows">
          {departures.map((departure) => (
            <DepartureRow key={departure.id} departure={departure} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
