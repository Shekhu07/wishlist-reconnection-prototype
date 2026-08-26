import {
  daysBetween,
  type AnalyticsEvent,
  type ExperimentArm,
  type MatchEvaluated,
  type ModuleAction,
  type ModuleDismissed,
  type ModuleRendered,
  type MovedToBag,
  type OrderPlaced,
  type SearchPerformed,
  type VariantRecoveryResolved,
  type VariantRecoveryShown,
  type WishlistSaved,
} from "./events";

/**
 * The section 7 metric set, as pure functions of the event log.
 *
 * These are the dbt models. Every one takes the same input and reads no state,
 * so a number anyone disputes can be recomputed from the same events rather
 * than argued about.
 *
 * A rate whose denominator is zero is `null`, never 0. "No searches produced no
 * exposures" and "many searches produced no exposures" are opposite facts and
 * must not collapse to the same value on a dashboard.
 */

export interface Rate {
  numerator: number;
  denominator: number;
  value: number | null;
}

function rate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function typed<T extends AnalyticsEvent>(
  events: readonly AnalyticsEvent[],
  type: T["type"],
  arm?: ExperimentArm
): T[] {
  const matching = events.filter((event): event is T => event.type === type);
  return arm ? matching.filter((event) => event.arm === arm) : matching;
}

/** Opportunity: how often a search actually showed the module. */
export function matchExposureRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  return rate(
    typed<ModuleRendered>(events, "module_rendered", arm).length,
    typed<SearchPerformed>(events, "search_performed", arm).length
  );
}

/**
 * Opportunity volume during shadow mode, where nothing renders by design.
 *
 * This is the number Phase 3 watches: how often the module *would* have
 * appeared. Without it a shadow run tells you nothing at all.
 */
export function shadowOpportunityRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const evaluated = typed<MatchEvaluated>(events, "match_evaluated", arm);
  return rate(evaluated.filter((event) => event.candidates.length > 0).length, evaluated.length);
}

/**
 * Quality gate. Precision here is *operational*, not ground truth: a dismissal
 * counts as a negative label and an action as a positive one. Exposures that
 * drew neither are unlabelled and are excluded from the denominator entirely --
 * counting silence as either would invent a result.
 */
export function matchPrecision(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const positives = typed<ModuleAction>(events, "module_action", arm).length;
  const negatives = typed<ModuleDismissed>(events, "module_dismissed", arm).length;
  return rate(positives, positives + negatives);
}

/** Mechanism: did reconnection alone move people, or did comparison? */
export function buyFromWishlistRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const buys = typed<ModuleAction>(events, "module_action", arm).filter(
    (event) => event.action === "buy_from_wishlist"
  );
  return rate(buys.length, typed<ModuleRendered>(events, "module_rendered", arm).length);
}

export function compareOptionsRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const compares = typed<ModuleAction>(events, "module_action", arm).filter(
    (event) => event.action === "compare_options"
  );
  return rate(compares.length, typed<ModuleRendered>(events, "module_rendered", arm).length);
}

/** Direct impact: of everything saved, how much was eventually bought. */
export function savedItemPurchaseRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const savedSkus = new Set(
    typed<WishlistSaved>(events, "wishlist_saved", arm).map((e) => `${e.user_id}|${e.sku}`)
  );
  const purchased = new Set<string>();
  for (const order of typed<OrderPlaced>(events, "order_placed", arm)) {
    for (const sku of order.saved_skus) {
      const key = `${order.user_id}|${sku}`;
      if (savedSkus.has(key)) purchased.add(key);
    }
  }
  return rate(purchased.size, savedSkus.size);
}

/**
 * Guardrail. The one number that must not move: if reconnection helps saved
 * items at the cost of ordinary search conversion, the feature is a net loss
 * even when all of its own metrics look good.
 */
export function searchToPurchaseRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const sessionsWithSearch = new Set(
    typed<SearchPerformed>(events, "search_performed", arm).map((event) => event.session_id)
  );
  const converting = new Set(
    typed<OrderPlaced>(events, "order_placed", arm)
      .map((event) => event.session_id)
      .filter((id) => sessionsWithSearch.has(id))
  );
  return rate(converting.size, sessionsWithSearch.size);
}

/** Relevance signal, never a permanent opt-out (FR-8). */
export function dismissalRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  return rate(
    typed<ModuleDismissed>(events, "module_dismissed", arm).length,
    typed<ModuleRendered>(events, "module_rendered", arm).length
  );
}

/** Flow integrity: reconnection must not quietly double-add (FR-11). */
export function duplicateAddRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const adds = typed<MovedToBag>(events, "moved_to_bag", arm);
  return rate(adds.filter((event) => event.duplicate).length, adds.length);
}

/** Fashion-specific quality: did a blocked variant end in recovery or in loss? */
export function variantRecoveryRate(events: readonly AnalyticsEvent[], arm?: ExperimentArm): Rate {
  const shown = typed<VariantRecoveryShown>(events, "variant_recovery_shown", arm);
  const resolved = typed<VariantRecoveryResolved>(events, "variant_recovery_resolved", arm).filter(
    (event) => event.resolved_by !== "abandoned"
  );
  return rate(resolved.length, shown.length);
}

export interface LatencyAndErrors {
  p50: number;
  p95: number;
  p99: number;
  errorRate: Rate;
  timeoutRate: Rate;
  breakerOpenRate: Rate;
}

/** Guardrail, and one of the three with an automatic kill-switch threshold. */
export function latencyAndErrorRate(
  events: readonly AnalyticsEvent[],
  arm?: ExperimentArm
): LatencyAndErrors {
  const evaluated = typed<MatchEvaluated>(events, "match_evaluated", arm);
  const durations = evaluated.map((event) => event.duration_ms).sort((a, b) => a - b);
  const at = (p: number) =>
    durations.length === 0
      ? 0
      : durations[Math.min(durations.length - 1, Math.floor(durations.length * p))];
  const timeouts = evaluated.filter((event) => event.timed_out).length;
  const breakerOpen = evaluated.filter((event) => event.breaker_open).length;
  return {
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    errorRate: rate(timeouts + breakerOpen, evaluated.length),
    timeoutRate: rate(timeouts, evaluated.length),
    breakerOpenRate: rate(breakerOpen, evaluated.length),
  };
}

/**
 * The primary metric: a 30-day, *user-level* wishlist-to-purchase rate.
 *
 * User-level is the awkward part, and the reason this needs a cohort model
 * rather than a ratio. A user enters the cohort on the day of their first save
 * and converts if they buy anything they had saved within `windowDays`.
 *
 * Users whose window has not closed by `asOf` are censored rather than counted
 * as failures. Counting them would make the rate read low simply because the
 * experiment is young, and it would keep drifting upward for thirty days after
 * the run ended -- which looks exactly like a real effect.
 */
export interface CohortResult {
  windowDays: number;
  entered: number;
  converted: number;
  censored: number;
  rate: Rate;
}

export function thirtyDayWishlistToPurchaseRate(
  events: readonly AnalyticsEvent[],
  asOf: string,
  arm?: ExperimentArm,
  windowDays = 30
): CohortResult {
  const saves = typed<WishlistSaved>(events, "wishlist_saved", arm);
  const orders = typed<OrderPlaced>(events, "order_placed", arm);

  const entry = new Map<string, string>();
  const savedByUser = new Map<string, Set<string>>();
  for (const save of saves) {
    const current = entry.get(save.user_id);
    if (!current || save.ts < current) entry.set(save.user_id, save.ts);
    const owned = savedByUser.get(save.user_id) ?? new Set<string>();
    owned.add(save.sku);
    savedByUser.set(save.user_id, owned);
  }

  const ordersByUser = new Map<string, OrderPlaced[]>();
  for (const order of orders) {
    const bucket = ordersByUser.get(order.user_id) ?? [];
    bucket.push(order);
    ordersByUser.set(order.user_id, bucket);
  }

  let entered = 0;
  let converted = 0;
  let censored = 0;

  for (const [userId, entryDate] of entry) {
    if (daysBetween(entryDate, asOf) < windowDays) {
      censored += 1;
      continue;
    }
    entered += 1;
    const owned = savedByUser.get(userId) ?? new Set<string>();
    const didConvert = (ordersByUser.get(userId) ?? []).some((order) => {
      const elapsed = daysBetween(entryDate, order.ts);
      return (
        elapsed >= 0 && elapsed <= windowDays && order.saved_skus.some((sku) => owned.has(sku))
      );
    });
    if (didConvert) converted += 1;
  }

  return { windowDays, entered, converted, censored, rate: rate(converted, entered) };
}
