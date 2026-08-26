import { EventLog, type AnalyticsEvent, type NewEvent } from "@/analytics/events";
import { MatchClient } from "@/match/transport";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";
import { ExperimentFlag } from "@/experiment/flags";
import { DEFAULT_THRESHOLDS, evaluateGuardrails } from "@/experiment/guardrails";

/**
 * The S10 gate is "rollback verified under load". These are that drill: a
 * breach has to trip the switch on its own, immediately, and stay tripped.
 */

const DAY = "2026-08-26";

function events(spec: {
  controlSessions: number;
  controlOrders: number;
  treatmentSessions: number;
  treatmentOrders: number;
  evaluations?: number;
  p95?: number;
  timeouts?: number;
}): AnalyticsEvent[] {
  const out: AnalyticsEvent[] = [];
  let n = 0;
  const push = (event: NewEvent) =>
    out.push({ ...event, event_id: `e${(n += 1)}` } as AnalyticsEvent);

  const funnel = (arm: "control" | "treatment_a", sessions: number, orders: number) => {
    for (let i = 0; i < sessions; i += 1) {
      push({
        type: "search_performed",
        ts: DAY,
        user_id: `${arm}_${i}`,
        session_id: `${arm}_s${i}`,
        arm,
        query: "shirt",
        modality: "text",
        result_count: 10,
      });
      if (i < orders) {
        push({
          type: "order_placed",
          ts: DAY,
          user_id: `${arm}_${i}`,
          session_id: `${arm}_s${i}`,
          arm,
          skus: ["sku"],
          saved_skus: [],
          via_wishlist_module: false,
        });
      }
    }
  };

  funnel("control", spec.controlSessions, spec.controlOrders);
  funnel("treatment_a", spec.treatmentSessions, spec.treatmentOrders);

  for (let i = 0; i < (spec.evaluations ?? 0); i += 1) {
    push({
      type: "match_evaluated",
      ts: DAY,
      user_id: `u${i}`,
      session_id: `s${i}`,
      arm: "treatment_a",
      query: "shirt",
      modality: "text",
      candidates: [],
      rendered: false,
      shadow: false,
      duration_ms: spec.p95 ?? 40,
      timed_out: i < (spec.timeouts ?? 0),
      breaker_open: false,
    });
  }
  return out;
}

const healthy = () =>
  events({
    controlSessions: 1000,
    controlOrders: 200,
    treatmentSessions: 1000,
    treatmentOrders: 202,
    evaluations: 1000,
    p95: 40,
    timeouts: 2,
  });

describe("guardrails and the kill switch (E10)", () => {
  it("stays quiet while every guardrail holds", () => {
    const flag = new ExperimentFlag();
    flag.advance(DAY);
    expect(flag.check(healthy(), DAY)).toBe(false);
    expect(flag.killed).toBe(false);
  });

  it("trips on a search-to-purchase drop, without waiting for a human", () => {
    const flag = new ExperimentFlag();
    flag.advance(DAY);
    const damaged = events({
      controlSessions: 1000,
      controlOrders: 200,
      treatmentSessions: 1000,
      treatmentOrders: 150, // a 25% relative drop
      evaluations: 1000,
    });
    expect(flag.check(damaged, DAY)).toBe(true);
    expect(flag.killed).toBe(true);
    expect(flag.killedReason).toMatch(/Search-to-purchase/);
  });

  it("trips on latency and on errors independently", () => {
    const slow = new ExperimentFlag();
    slow.advance(DAY);
    expect(
      slow.check(
        events({
          controlSessions: 1000,
          controlOrders: 200,
          treatmentSessions: 1000,
          treatmentOrders: 200,
          evaluations: 1000,
          p95: 260,
        }),
        DAY
      )
    ).toBe(true);

    const erroring = new ExperimentFlag();
    erroring.advance(DAY);
    expect(
      erroring.check(
        events({
          controlSessions: 1000,
          controlOrders: 200,
          treatmentSessions: 1000,
          treatmentOrders: 200,
          evaluations: 1000,
          timeouts: 50, // 5%, well over the 1% limit
        }),
        DAY
      )
    ).toBe(true);
  });

  it("sends every user to control the moment it trips", () => {
    const flag = new ExperimentFlag();
    flag.advance(DAY);
    flag.advance(DAY);
    flag.advance(DAY);
    const before = ["u_1", "u_2", "u_3", "u_9"].map((u) => flag.arm(u));
    expect(before.some((arm) => arm !== "control")).toBe(true);

    flag.check(
      events({
        controlSessions: 1000,
        controlOrders: 200,
        treatmentSessions: 1000,
        treatmentOrders: 100,
        evaluations: 1000,
      }),
      DAY
    );
    for (const userId of ["u_1", "u_2", "u_3", "u_9"]) {
      expect(flag.arm(userId)).toBe("control");
    }
  });

  it("refuses to keep ramping while killed", () => {
    const flag = new ExperimentFlag();
    flag.advance(DAY);
    flag.check(
      events({
        controlSessions: 1000,
        controlOrders: 200,
        treatmentSessions: 1000,
        treatmentOrders: 100,
        evaluations: 1000,
      }),
      DAY
    );
    expect(flag.advance(DAY)).toBe(false);
  });

  it("stays killed even once the numbers recover", () => {
    // Auto-recovery would let a broken treatment flap in and out of the
    // population, which is worse than either state on its own.
    const flag = new ExperimentFlag();
    flag.advance(DAY);
    flag.check(
      events({
        controlSessions: 1000,
        controlOrders: 200,
        treatmentSessions: 1000,
        treatmentOrders: 100,
        evaluations: 1000,
      }),
      DAY
    );
    flag.check(healthy(), DAY);
    expect(flag.killed).toBe(true);
  });

  it("restores the original arms when a human clears it", () => {
    const flag = new ExperimentFlag();
    flag.advance(DAY);
    flag.advance(DAY);
    flag.advance(DAY);
    const before = ["u_1", "u_2", "u_3", "u_9"].map((u) => flag.arm(u));
    flag.check(
      events({
        controlSessions: 1000,
        controlOrders: 200,
        treatmentSessions: 1000,
        treatmentOrders: 100,
        evaluations: 1000,
      }),
      DAY
    );
    flag.clearKill(DAY, "release manager");
    expect(["u_1", "u_2", "u_3", "u_9"].map((u) => flag.arm(u))).toEqual(before);
  });

  it("declares nothing on a sample too small to judge", () => {
    // A switch that fires on nine sessions gets disabled by the first person
    // it wakes at 3am.
    const readings = evaluateGuardrails(
      events({ controlSessions: 10, controlOrders: 5, treatmentSessions: 10, treatmentOrders: 0 }),
      DEFAULT_THRESHOLDS
    );
    expect(readings.every((reading) => !reading.breached)).toBe(true);
    expect(readings.some((reading) => reading.undetermined)).toBe(true);
  });

  it("records the ramp and the kill in one history", () => {
    const flag = new ExperimentFlag();
    flag.advance(DAY, "1% ramp");
    flag.advance(DAY, "5% ramp");
    flag.check(
      events({
        controlSessions: 1000,
        controlOrders: 200,
        treatmentSessions: 1000,
        treatmentOrders: 100,
        evaluations: 1000,
      }),
      DAY
    );
    expect(flag.history).toHaveLength(3);
    expect(flag.history[2].reason).toMatch(/kill switch/);
    expect(flag.history[2].to).toBe(0);
  });
});

describe("the flag actually gates the feature", () => {
  it("renders nothing for a control user, while still logging the evaluation", async () => {
    const log = new EventLog();
    const client = new MatchClient({
      catalog: makeCatalog(),
      wishlist: makeWishlist(),
      latencyMs: 5,
      arm: "control",
      events: log,
    });
    const response = await client.requestMatch(
      {
        query: "mark taylor shirt",
        modality: "text",
        filters: {},
        delivery_pincode: "560034",
        session_id: "s1",
      },
      true
    );

    // Control sees nothing. Assignment that no code consults is decoration.
    expect(response.matches).toHaveLength(0);
    // But the counterfactual is still recorded, or there is nothing to compare
    // the treatment against.
    const evaluated = log.ofType("match_evaluated");
    expect(evaluated[0].candidates).toHaveLength(1);
    expect(evaluated[0].rendered).toBe(false);
  });

  it("renders for a treatment user on the same data", async () => {
    const client = new MatchClient({
      catalog: makeCatalog(),
      wishlist: makeWishlist(),
      latencyMs: 5,
      arm: "treatment_b",
    });
    const response = await client.requestMatch(
      {
        query: "mark taylor shirt",
        modality: "text",
        filters: {},
        delivery_pincode: "560034",
        session_id: "s1",
      },
      true
    );
    expect(response.matches).toHaveLength(1);
  });
});
