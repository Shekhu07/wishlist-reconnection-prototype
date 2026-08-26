import type { CopyKey, MatchTier, Modality } from "@/match/contract";

/**
 * E9: the event stream.
 *
 * Section 7 of the plan names eleven metrics and, crucially, who emits each
 * one. That column is what makes the set buildable -- a metric nobody emits is
 * a wish. Every event below exists because some row of that table cannot be
 * computed without it, and `metrics.ts` computes the table from nothing else.
 *
 * In the real system this is a Redpanda topic feeding ClickHouse. Here it is
 * an append-only array with the same shape, so the models are portable even
 * though the transport is not.
 */

export interface BaseEvent {
  event_id: string;
  /** ISO date. Day resolution is enough for a 30-day cohort. */
  ts: string;
  user_id: string;
  session_id: string;
  /** Which experiment arm the user was in when this happened. */
  arm: ExperimentArm;
}

/** Control sees no module. A is reconnection only; B adds variant continuity. */
export type ExperimentArm = "control" | "treatment_a" | "treatment_b";

export interface SearchPerformed extends BaseEvent {
  type: "search_performed";
  query: string;
  modality: Modality;
  result_count: number;
}

/**
 * The shadow topic. Emitted for every evaluation whether or not anything
 * rendered -- section 3.3 of the plan is explicit about this, and it is the
 * only way to measure opportunity volume during Phase 3 when nothing renders
 * by design.
 */
export interface MatchEvaluated extends BaseEvent {
  type: "match_evaluated";
  query: string;
  modality: Modality;
  candidates: {
    sku: string;
    tier: MatchTier;
    confidence: number;
    copy_key: CopyKey;
    identity_confidence: number;
  }[];
  /** False in shadow mode even when candidates cleared the threshold. */
  rendered: boolean;
  shadow: boolean;
  duration_ms: number;
  timed_out: boolean;
  breaker_open: boolean;
}

export interface ModuleRendered extends BaseEvent {
  type: "module_rendered";
  query: string;
  skus: string[];
  copy_keys: CopyKey[];
  tiers: MatchTier[];
}

export interface ModuleDismissed extends BaseEvent {
  type: "module_dismissed";
  query_family: string;
  skus: string[];
}

export interface ModuleAction extends BaseEvent {
  type: "module_action";
  action: "buy_from_wishlist" | "compare_options";
  sku: string;
}

export interface VariantRecoveryShown extends BaseEvent {
  type: "variant_recovery_shown";
  sku: string;
  reason: "variant_unavailable" | "product_unavailable" | "delivery_unavailable";
}

export interface VariantRecoveryResolved extends BaseEvent {
  type: "variant_recovery_resolved";
  sku: string;
  resolved_by: "other_size" | "other_colour" | "changed_address" | "abandoned";
}

export interface MovedToBag extends BaseEvent {
  type: "moved_to_bag";
  sku: string;
  /** Whether the reconnection module started this, or ordinary browsing did. */
  via_wishlist_module: boolean;
  /** The user chose a size other than the one they saved. */
  size_deviated: boolean;
  /** The item was already in the bag -- flow integrity, FR-11. */
  duplicate: boolean;
}

export interface OrderPlaced extends BaseEvent {
  type: "order_placed";
  skus: string[];
  /** Subset of skus that the user had previously saved. */
  saved_skus: string[];
  via_wishlist_module: boolean;
}

export interface WishlistSaved extends BaseEvent {
  type: "wishlist_saved";
  sku: string;
}

export type AnalyticsEvent =
  | SearchPerformed
  | MatchEvaluated
  | ModuleRendered
  | ModuleDismissed
  | ModuleAction
  | VariantRecoveryShown
  | VariantRecoveryResolved
  | MovedToBag
  | OrderPlaced
  | WishlistSaved;

export type EventType = AnalyticsEvent["type"];

/**
 * Omit distributes over a union only if you make it. Applied directly,
 * `Omit<AnalyticsEvent, "event_id">` collapses to the keys every member shares
 * and emit() silently accepts an event missing half its fields.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event as callers construct it, before the log stamps an id on it. */
export type NewEvent = DistributiveOmit<AnalyticsEvent, "event_id">;

/**
 * Append-only, in-order, and never mutated after the fact.
 *
 * Replayability is the reason: every metric is a pure function of this log, so
 * a disputed number can be recomputed from the same events rather than
 * argued about.
 */
export class EventLog {
  private readonly events: AnalyticsEvent[] = [];
  private sequence = 0;

  emit(event: NewEvent): void {
    this.sequence += 1;
    this.events.push({ ...event, event_id: `ev_${this.sequence}` } as AnalyticsEvent);
  }

  all(): readonly AnalyticsEvent[] {
    return this.events;
  }

  /** Narrows to the single union member for that literal, not to the union. */
  ofType<K extends EventType>(type: K): Extract<AnalyticsEvent, { type: K }>[] {
    return this.events.filter(
      (event): event is Extract<AnalyticsEvent, { type: K }> => event.type === type
    );
  }

  get size(): number {
    return this.events.length;
  }

  clear(): void {
    this.events.length = 0;
    this.sequence = 0;
  }
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
}
