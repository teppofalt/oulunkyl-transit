/**
 * Development-only HFP diagnostics view. Not linked from the production UI and
 * renders nothing outside dev builds. Never prints any API key.
 */

import { createFileRoute } from "@tanstack/react-router";

import { useBoard } from "@/lib/transit/useBoard";
import { HFP_MONITORING_HORIZON_MINUTES } from "@/lib/transit/config";

export const Route = createFileRoute("/dev-hfp")({
  head: () => ({
    meta: [
      { title: "HFP-diagnostiikka · Oulunkylä (kehitys)" },
      {
        name: "description",
        content: "Kehityskäyttöön tarkoitettu HSL HFP -seurannan diagnostiikkanäkymä.",
      },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "HFP-diagnostiikka · Oulunkylä" },
      { property: "og:description", content: "HSL HFP -seurannan kehitysdiagnostiikka." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DevHfpPage,
});

function clock(ms: number | null) {
  if (ms === null) return "–";
  return new Date(ms).toISOString().slice(11, 19);
}

function DevHfpPage() {
  const board = useBoard();

  if (!import.meta.env.DEV) {
    return (
      <main style={{ padding: "1rem" }}>
        <h1>Ei käytettävissä</h1>
        <p>Diagnostiikka on käytettävissä vain kehitysympäristössä.</p>
      </main>
    );
  }

  const rows = board.hfpDiagnostics;

  return (
    <main style={{ padding: "1rem", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
      <h1 style={{ fontSize: 16 }}>HFP-diagnostiikka (kehitys)</h1>
      <p>
        MQTT: {board.status.hfpStatus} · seuranta-horisontti {HFP_MONITORING_HORIZON_MINUTES} min ·
        seurattuja lähtöjä {rows.length} · lähtöjä taululla {board.departures.length}
      </p>
      {rows.length === 0 ? <p>Ei seurattavia lähtöjä juuri nyt.</p> : null}
      <div style={{ overflowX: "auto" }}>
        <table cellPadding={4} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "trip",
                "route",
                "dir",
                "oday",
                "start",
                "topic",
                "match",
                "oper",
                "veh",
                "last tst",
                "spd",
                "lat",
                "lon",
                "loc",
                "stop",
                "movement",
                "since",
                "kesto s",
                "stale",
              ].map((head) => (
                <th key={head} style={{ borderBottom: "1px solid currentColor", textAlign: "left" }}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tripId}>
                <td>{row.tripId}</td>
                <td>{row.hfpRoute}</td>
                <td>{row.hfpDirection}</td>
                <td>{row.oday}</td>
                <td>{row.start}</td>
                <td>{row.topic}</td>
                <td>{row.matchStatus}</td>
                <td>{row.operatorId ?? "–"}</td>
                <td>{row.vehicleNumber ?? "–"}</td>
                <td>{clock(row.lastTimestamp)}</td>
                <td>{row.lastSpeedMps ?? "–"}</td>
                <td>{row.lat?.toFixed(5) ?? "–"}</td>
                <td>{row.lon?.toFixed(5) ?? "–"}</td>
                <td>{row.locationSource ?? "–"}</td>
                <td>{row.stopId ?? "–"}</td>
                <td>{row.movementStatus}</td>
                <td>{clock(row.stationarySince)}</td>
                <td>{row.stationarySeconds ?? "–"}</td>
                <td>{row.stale ? "kyllä" : "ei"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
