import { describe, expect, it } from "vitest";

import { createHfpMonitor, topicFor, type MonitoredTrip } from "../hfpService";
import { STATIONARY } from "../config";

type Handler = (...args: unknown[]) => void;

/** Minimal fake MQTT client capturing subscription behaviour. */
function fakeClient() {
  const handlers = new Map<string, Handler[]>();
  const calls = { subscribe: [] as string[], unsubscribe: [] as string[], end: 0 };
  const client = {
    connected: false,
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return client;
    },
    subscribe(topic: string) {
      calls.subscribe.push(topic);
      return client;
    },
    unsubscribe(topic: string) {
      calls.unsubscribe.push(topic);
      return client;
    },
    end() {
      calls.end += 1;
      return client;
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
    connect() {
      client.connected = true;
      client.emit("connect");
    },
  };
  return { client, calls };
}

function trip(id: string, start = "08:45"): MonitoredTrip {
  const base = {
    tripId: id,
    hfpRoute: "1015",
    hfpDirection: 1,
    oday: "2026-08-16",
    start,
    mode: "tram" as const,
  };
  return { ...base, topic: topicFor(base) };
}

function vpMessage(opts: { start?: string; ts: string; spd: number; lat: number; lon: number }) {
  return new TextEncoder().encode(
    JSON.stringify({
      VP: {
        oper: 40,
        veh: 501,
        tst: opts.ts,
        spd: opts.spd,
        lat: opts.lat,
        long: opts.lon,
        loc: "GPS",
        route: "1015",
        dir: "1",
        oday: "2026-08-16",
        start: opts.start ?? "08:45",
      },
    }),
  );
}

describe("HFP monitor lifecycle", () => {
  it("subscribes once per shared topic and never duplicates subscriptions", () => {
    const { client, calls } = fakeClient();
    const monitor = createHfpMonitor({ connect: () => client as never });

    monitor.setTrips([trip("a"), trip("b")]); // same route/dir/start -> one topic
    client.connect();
    expect(calls.subscribe).toHaveLength(1);

    // Reconciling with the same set must not resubscribe.
    monitor.setTrips([trip("a"), trip("b")]);
    expect(calls.subscribe).toHaveLength(1);

    // Adding a trip on a different topic subscribes exactly once more.
    monitor.setTrips([trip("a"), trip("b"), trip("c", "09:15")]);
    expect(calls.subscribe).toHaveLength(2);
    monitor.stop();
  });

  it("unsubscribes and drops observation state when a trip leaves the horizon", () => {
    const { client, calls } = fakeClient();
    const monitor = createHfpMonitor({ connect: () => client as never });
    monitor.setTrips([trip("a"), trip("c", "09:15")]);
    client.connect();

    monitor.setTrips([trip("a")]);
    expect(calls.unsubscribe).toHaveLength(1);
    expect(Object.keys(monitor.snapshot(Date.now()))).toEqual(["a"]);
    monitor.stop();
  });

  it("stopping (page hidden) clears all state so a hidden interval is not counted as stationary", () => {
    const { client } = fakeClient();
    const monitor = createHfpMonitor({ connect: () => client as never });
    const t0 = Date.now() - 5 * 60_000;

    monitor.setTrips([trip("a")]);
    client.connect();

    // Confirm a stationary vehicle before the app is hidden.
    for (let i = 0; i <= 48; i += 1) {
      client.emit(
        "message",
        "topic",
        vpMessage({ ts: new Date(t0 + i * 5_000).toISOString(), spd: 0, lat: 60.229, lon: 24.968 }),
      );
    }
    const before = monitor.snapshot(t0 + 48 * 5_000);
    expect(before["a"]?.movementStatus).toBe("STATIONARY");
    expect(before["a"]?.stationarySeconds ?? 0).toBeGreaterThanOrEqual(
      STATIONARY.infoThresholdSeconds,
    );

    // Page hidden for 10 minutes, then visible again.
    monitor.stop();
    const t1 = t0 + 48 * 5_000 + 10 * 60_000;
    monitor.setTrips([trip("a")]);
    client.connect();
    const after = monitor.snapshot(t1);
    // No observations yet: not matched, and definitely no accumulated duration.
    expect(["SEARCHING", "NO_MATCH"]).toContain(after["a"]?.matchStatus);
    expect(after["a"]?.stationarySeconds).toBeNull();

    // A single fresh observation cannot resurrect the old duration either.
    client.emit(
      "message",
      "topic",
      vpMessage({ ts: new Date(t1).toISOString(), spd: 0, lat: 60.229, lon: 24.968 }),
    );
    const resumed = monitor.snapshot(t1 + 1_000);
    expect(resumed["a"]?.stationarySeconds ?? 0).toBeLessThan(STATIONARY.infoThresholdSeconds);
    monitor.stop();
  });

  it("keeps observation history bounded per vehicle", () => {
    const { client } = fakeClient();
    const monitor = createHfpMonitor({ connect: () => client as never });
    const t0 = Date.now() - 5 * 60_000;
    monitor.setTrips([trip("a")]);
    client.connect();

    for (let i = 0; i < 4_000; i += 1) {
      client.emit(
        "message",
        "topic",
        vpMessage({ ts: new Date(t0 + i * 1_000).toISOString(), spd: 0, lat: 60.229, lon: 24.968 }),
      );
    }
    // Trip state is still a single entry and the detector retains a capped window.
    const snap = monitor.snapshot(t0 + 4_000_000);
    expect(Object.keys(snap)).toEqual(["a"]);
    monitor.stop();
  });
});
