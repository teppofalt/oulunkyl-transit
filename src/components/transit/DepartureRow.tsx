import { memo } from "react";

import { formatClock, minutesUntil } from "@/lib/transit/timeUtils";
import { STATIONARY } from "@/lib/transit/config";
import type { Departure } from "@/lib/transit/types";

function stationaryText(departure: Departure): { text: string; severity: "INFO" | "WARNING" } | null {
  const { movement } = departure;
  if (movement.stationarySeverity === "NONE" || movement.stationarySeconds === null) return null;
  if (movement.historyIncomplete) {
    return { text: "Liikehistoria puutteellinen", severity: "INFO" };
  }
  const minutes = Math.floor(movement.stationarySeconds / 60);
  if (movement.stationarySeconds >= STATIONARY.warningThresholdSeconds) {
    return { text: `Pitkittynyt pysähdys · ${minutes} min`, severity: "WARNING" };
  }
  const where =
    movement.stationaryLocation === "AT_STATION"
      ? "Paikallaan asemalla"
      : movement.stationaryLocation === "ON_TRACK"
        ? "Paikallaan radalla"
        : "Paikallaan";
  return { text: `${where} ${minutes} min`, severity: "INFO" };
}

type Props = { departure: Departure; now: number };

function DepartureRowBase({ departure, now }: Props) {
  const minutes = minutesUntil(departure.effectiveArrival, now);
  const clock = formatClock(departure.effectiveArrival);
  const delayMinutes =
    departure.delaySeconds !== null ? Math.round(departure.delaySeconds / 60) : null;
  const delayed = delayMinutes !== null && delayMinutes >= 1;
  const early = delayMinutes !== null && delayMinutes <= -1;
  const stationary = stationaryText(departure);
  const isTram = departure.mode === "TRAM";

  const notes: { text: string; tone: "muted" | "info" | "warn" }[] = [];
  if (!departure.realtimeAvailable && !departure.cancelled) {
    notes.push({ text: "aikataulu", tone: "muted" });
  }
  if (delayed) notes.push({ text: `+${delayMinutes} min myöhässä`, tone: "warn" });
  if (early) notes.push({ text: `${delayMinutes} min etuajassa`, tone: "muted" });
  if (stationary) {
    notes.push({ text: stationary.text, tone: stationary.severity === "WARNING" ? "warn" : "info" });
  }
  if (departure.movement.movementStatus === "STALE") {
    notes.push({ text: "Liiketieto ei saatavilla", tone: "muted" });
  }

  const label = `${isTram ? "Pikaratikka" : "Juna"} ${departure.line}, ${
    departure.cancelled ? "peruttu" : `saapuu ${clock}, ${minutes} minuutin kuluttua`
  }${notes.length ? `, ${notes.map((n) => n.text).join(", ")}` : ""}`;

  return (
    <li
      className={`row ${isTram ? "row-tram" : "row-train"} ${
        departure.cancelled ? "row-cancelled" : stationary?.severity === "WARNING" ? "row-warn" : ""
      }`}
      aria-label={label}
    >
      <span className={`badge ${isTram ? "badge-tram" : "badge-train"}`} aria-hidden="true">
        {departure.line}
      </span>

      <span className="row-main">
        <span className="row-top">
          <span className="clock">{clock}</span>
          {departure.platformCode ? (
            <span className="platform">rt {departure.platformCode}</span>
          ) : null}
        </span>
        {notes.length > 0 ? (
          <span className="notes">
            {notes.map((note) => (
              <span key={note.text} className={`note note-${note.tone}`}>
                {note.text}
              </span>
            ))}
          </span>
        ) : (
          <span className="notes">
            <span className="note note-headsign">{departure.headsign ?? ""}</span>
          </span>
        )}
      </span>

      <span className="row-minutes">
        {departure.cancelled ? (
          <span className="cancelled-tag">PERUTTU</span>
        ) : (
          <>
            <span className="minutes">{minutes}</span>
            <span className="minutes-unit">min</span>
          </>
        )}
      </span>
    </li>
  );
}

export const DepartureRow = memo(DepartureRowBase);
