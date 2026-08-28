import { EventLog, type ExperimentArm } from "./events";
import { seeded } from "./random";

/**
 * A synthetic population, because the prototype has no users.
 *
 * The plan is blunt about this (section 0 and the risk register): the primary
 * metric is a 30-day *user-level* rate, and a greenfield build has no organic
 * user base to produce one. So this does the only honest thing available --
 * it generates a population with a **known** effect built in, which makes the
 * cohort model testable even though the effect is not a finding.
 *
 * That is the point. `cohort.test.ts` injects a lift and asserts the model
 * recovers it. A model that cannot recover an effect you planted is not going
 * to find one you did not.
 *
 * Nothing produced here is evidence about the feature. It is evidence about
 * the measurement.
 */

export interface SimulationConfig {
  users: number;
  /** Days of activity to generate. */
  days: number;
  /** The cohort window sessions must fall inside. See the note in simulate(). */
  windowDays: number;
  startDate: string;
  /** Probability a control user buys something they saved, within the window. */
  baseConversion: number;
  /** Percentage-point lift added for each treatment arm. */
  liftTreatmentA: number;
  liftTreatmentB: number;
  /**
   * C is B plus the confidence layer, so its planted lift is set above B's.
   * The cohort model is validated by checking it recovers a lift that was
   * planted by hand -- a model that cannot find an effect you put there will
   * not find one you did not.
   */
  liftTreatmentC: number;
  /** Probability any given search produces at least one candidate. */
  matchOpportunity: number;
  /** Of exposures, how often the user acts / dismisses. */
  actionRate: number;
  dismissRate: number;
  /** Of buy attempts, how often the saved variant is blocked. */
  recoveryRate: number;
  /** Emitted but not rendered, for a Phase 3 shadow run. */
  shadow: boolean;
  seed: number;
}

export const DEFAULT_SIMULATION: SimulationConfig = {
  users: 600,
  days: 45,
  windowDays: 30,
  startDate: "2026-07-01",
  baseConversion: 0.18,
  liftTreatmentA: 0.03,
  liftTreatmentB: 0.05,
  liftTreatmentC: 0.06,
  matchOpportunity: 0.32,
  actionRate: 0.22,
  dismissRate: 0.08,
  recoveryRate: 0.18,
  shadow: false,
  seed: 20260826,
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const ARMS: ExperimentArm[] = ["control", "treatment_a", "treatment_b", "treatment_c"];
const QUERIES = [
  "check shirt",
  "casual shoes",
  "printed kurta",
  "slim jeans",
  "polo t-shirt",
  "leather handbag",
];

export interface SimulationResult {
  log: EventLog;
  asOf: string;
  /** The lift that was planted, for the model to be checked against. */
  injected: Record<ExperimentArm, number>;
}

export function simulate(overrides: Partial<SimulationConfig> = {}): SimulationResult {
  const config = { ...DEFAULT_SIMULATION, ...overrides };
  const log = new EventLog();

  for (let u = 0; u < config.users; u += 1) {
    // A stream per user, not one shared stream.
    //
    // Arm is assigned by index while each user consumes a variable number of
    // draws, so with a shared stream the arm correlates with the phase of the
    // generator. That manufactured a 5.7-point difference between arms in a
    // run with no lift planted at all -- an artifact indistinguishable from
    // the effect the model is supposed to detect. Per-user streams make one
    // user's consumption independent of every other's.
    const random = seeded((config.seed ^ Math.imul(u + 1, 0x9e3779b1)) >>> 0);
    const userId = `u_sim_${u}`;
    // Even, deterministic assignment. Real assignment is a hash of the user id
    // against the flag salt; the property that matters here is only that arms
    // are balanced and stable.
    const arm = ARMS[u % ARMS.length];
    const lift =
      arm === "treatment_a"
        ? config.liftTreatmentA
        : arm === "treatment_b"
          ? config.liftTreatmentB
          : arm === "treatment_c"
            ? config.liftTreatmentC
            : 0;

    // Entry is spread across the first two thirds of the run so that most
    // users have a closed 30-day window by the end, and some deliberately
    // do not -- censoring has to be exercised, not assumed away.
    const entryDay = Math.floor(random() * (config.days * 0.7));
    const entryDate = addDays(config.startDate, entryDay);
    const sessionBase = `s_${userId}`;

    const savedSkus: string[] = [];
    const saveCount = 1 + Math.floor(random() * 4);
    for (let i = 0; i < saveCount; i += 1) {
      const sku = `sku_sim_${u}_${i}`;
      savedSkus.push(sku);
      log.emit({
        type: "wishlist_saved",
        ts: entryDate,
        user_id: userId,
        session_id: `${sessionBase}_save`,
        arm,
        sku,
      });
    }

    const willConvert = random() < config.baseConversion + lift;
    const sessions = 1 + Math.floor(random() * 6);
    let converted = false;
    // Search-to-purchase is a per-session funnel, so an order has to land in a
    // session that actually searched. Attaching every non-module conversion to
    // a separate "organic" session left control converting in sessions with no
    // search event at all, which pinned control's funnel rate near zero and
    // made the guardrail comparison meaningless.
    const searchedSessions: string[] = [];

    for (let s = 0; s < sessions; s += 1) {
      // Sessions stay inside the cohort window.
      //
      // Letting them run to the end of the simulation created an artifact that
      // penalised exactly the arm being measured: a module-driven conversion
      // carries its session's timestamp, so it could land past day 30 and go
      // uncounted, while an organic conversion never did. Treatment B buys
      // through the module most, so B's lift read low and shrank as the arm
      // engaged more -- an artifact that looks precisely like "variant
      // continuity does not help".
      const dayOffset = Math.floor(
        random() * Math.min(config.days - entryDay, config.windowDays)
      );
      const ts = addDays(entryDate, dayOffset);
      const sessionId = `${sessionBase}_${s}`;
      searchedSessions.push(sessionId);
      const query = QUERIES[Math.floor(random() * QUERIES.length)];

      log.emit({
        type: "search_performed",
        ts,
        user_id: userId,
        session_id: sessionId,
        arm,
        query,
        modality: "text",
        result_count: 12 + Math.floor(random() * 20),
      });

      const hasCandidates = random() < config.matchOpportunity;
      const sku = savedSkus[Math.floor(random() * savedSkus.length)];
      const duration = 30 + random() * 90;
      const timedOut = random() < 0.004;

      log.emit({
        type: "match_evaluated",
        ts,
        user_id: userId,
        session_id: sessionId,
        arm,
        query,
        modality: "text",
        candidates:
          hasCandidates && !timedOut
            ? [
                {
                  sku,
                  tier: random() < 0.85 ? 1 : 2,
                  confidence: 0.72 + random() * 0.27,
                  copy_key: "exact_variant_available",
                  identity_confidence: 1,
                },
              ]
            : [],
        // Control never renders because it has no module; shadow mode never
        // renders because that is what shadow mode is.
        rendered: hasCandidates && !timedOut && !config.shadow && arm !== "control",
        shadow: config.shadow,
        duration_ms: timedOut ? 250 : duration,
        timed_out: timedOut,
        breaker_open: false,
      });

      const exposed = hasCandidates && !timedOut && !config.shadow && arm !== "control";
      if (!exposed) continue;

      log.emit({
        type: "module_rendered",
        ts,
        user_id: userId,
        session_id: sessionId,
        arm,
        query,
        skus: [sku],
        copy_keys: ["exact_variant_available"],
        tiers: [1],
      });

      const roll = random();
      if (roll < config.dismissRate) {
        log.emit({
          type: "module_dismissed",
          ts,
          user_id: userId,
          session_id: sessionId,
          arm,
          query_family: query.split(" ").sort().join("+"),
          skus: [sku],
        });
        continue;
      }
      if (roll >= config.dismissRate + config.actionRate) continue;

      // Treatment B is the arm whose hypothesis is variant continuity, so it
      // is the arm that leans on Buy; A leans on comparison.
      const buys = arm === "treatment_b" ? random() < 0.7 : random() < 0.45;
      log.emit({
        type: "module_action",
        ts,
        user_id: userId,
        session_id: sessionId,
        arm,
        action: buys ? "buy_from_wishlist" : "compare_options",
        sku,
      });

      if (!buys) continue;

      const blocked = random() < config.recoveryRate;
      if (blocked) {
        log.emit({
          type: "variant_recovery_shown",
          ts,
          user_id: userId,
          session_id: sessionId,
          arm,
          sku,
          reason: "variant_unavailable",
        });
        // Treatment B preserves the saved variant, so it recovers more often.
        const recovers = random() < (arm === "treatment_b" ? 0.72 : 0.48);
        log.emit({
          type: "variant_recovery_resolved",
          ts,
          user_id: userId,
          session_id: sessionId,
          arm,
          sku,
          resolved_by: recovers ? "other_size" : "abandoned",
        });
        if (!recovers) continue;
      }

      const duplicate = random() < 0.03;
      log.emit({
        type: "moved_to_bag",
        ts,
        user_id: userId,
        session_id: sessionId,
        arm,
        sku,
        via_wishlist_module: true,
        size_deviated: blocked,
        duplicate,
      });

      if (willConvert && !converted) {
        converted = true;
        log.emit({
          type: "order_placed",
          ts,
          user_id: userId,
          session_id: sessionId,
          arm,
          skus: [sku],
          saved_skus: [sku],
          via_wishlist_module: true,
        });
      }
    }

    // Users convert whether or not the module was involved, otherwise control
    // could never convert at all and the comparison would be meaningless.
    if (willConvert && !converted) {
      const ts = addDays(entryDate, 1 + Math.floor(random() * 28));
      const sku = savedSkus[Math.floor(random() * savedSkus.length)];
      const sessionId =
        searchedSessions.length > 0
          ? searchedSessions[Math.floor(random() * searchedSessions.length)]
          : `${sessionBase}_organic`;
      log.emit({
        type: "order_placed",
        ts,
        user_id: userId,
        session_id: sessionId,
        arm,
        skus: [sku],
        saved_skus: [sku],
        via_wishlist_module: false,
      });
    }
  }

  return {
    log,
    asOf: addDays(config.startDate, config.days),
    injected: {
      control: 0,
      treatment_a: config.liftTreatmentA,
      treatment_b: config.liftTreatmentB,
      treatment_c: config.liftTreatmentC,
    },
  };
}
