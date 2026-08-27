import {
  DEFAULT_CONFIG,
  EMPTY_RESPONSE,
  type MatchConfig,
  type MatchRequest,
  type MatchResponse,
} from "./contract";
import { CircuitBreaker } from "./breaker";
import { buildIndex, match, type MatchIndex } from "./matcher";
import { SuppressionStore, queryFamily } from "./suppression";
import type { Catalog, Wishlist } from "@/data/types";
import type { EventLog, ExperimentArm } from "@/analytics/events";
import type { CommerceState } from "@/commerce/reconcile";
import { PreferenceStore } from "@/preferences/store";

/**
 * The boundary the UI talks to.
 *
 * Constraint C-3 is the reason this file exists: search results must render
 * independently of matching. Every failure mode here -- timeout, thrown error,
 * open breaker, unauthenticated caller, active dismissal -- resolves to the
 * same empty response inside the hard timeout. The caller cannot tell them
 * apart, and neither can an observer (constraint C-6).
 *
 * Replacing this with `POST /v1/wishlist/match` means swapping `runMatch` for
 * a fetch. Nothing above this file changes.
 */

export interface ShadowRecord {
  request: MatchRequest;
  authenticated: boolean;
  durationMs: number;
  timedOut: boolean;
  breakerOpen: boolean;
  suppressed: boolean;
  rendered: number;
  cappedTotal: number;
  /** True when the matcher found something and frequency capping is the reason nothing rendered. */
  frequencyCapped: boolean;
  /** Full scoring detail, logged whether or not anything rendered. */
  matches: { sku: string; tier: number; confidence: number; copyKey: string }[];
}

/**
 * Preferences are enforced *server-side* (E8 / section 4.16). A preference the
 * UI honours but the service ignores is not a control, it is a suggestion --
 * which is why both the global setting and the per-item hide are checked here,
 * before the matcher runs, rather than by the view declining to draw.
 */
export type UserPreferences = PreferenceStore;

export interface MatchClientOptions {
  catalog: Catalog;
  wishlist: Wishlist;
  preferences?: UserPreferences;
  /** Section 7 event stream. Optional so tests can ignore it. */
  events?: EventLog;
  /** Bag, Save for Later and orders, for E14 duplicate reconciliation. */
  commerce?: CommerceState;
  arm?: ExperimentArm;
  /**
   * Phase 3. Matching runs in full and is logged in full; the response handed
   * back is empty. The user sees nothing, and the shadow topic sees everything
   * -- which is the only way to measure opportunity volume before launch.
   */
  shadowMode?: boolean;
  config?: MatchConfig;
  /** Simulated service latency in ms. The harness raises this to force misses. */
  latencyMs?: number;
  /** Force every call to time out, for testing the fail-open path. */
  forceTimeout?: boolean;
  now?: () => number;
}

export class MatchClient {
  private readonly index: MatchIndex;
  private readonly breaker: CircuitBreaker;
  readonly suppression = new SuppressionStore();
  readonly shadow: ShadowRecord[] = [];
  preferences: UserPreferences;
  shadowMode: boolean;
  arm: ExperimentArm;
  config: MatchConfig;
  latencyMs: number;
  forceTimeout: boolean;
  /**
   * Set by `applyFrequencyCaps` when it zeroed a response that actually had
   * matches, so `finish()` can log it. `applyFrequencyCaps` discards that
   * distinction from its own return value -- both a genuine miss and a fully
   * capped result come back as `EMPTY_RESPONSE` -- so this is the only place
   * left to carry it out to the shadow record.
   */
  private lastFrequencyCapped = false;

  constructor(private readonly options: MatchClientOptions) {
    this.config = options.config ?? DEFAULT_CONFIG;
    this.preferences = options.preferences ?? new PreferenceStore();
    this.shadowMode = options.shadowMode ?? false;
    this.arm = options.arm ?? "treatment_b";
    this.latencyMs = options.latencyMs ?? 60;
    this.forceTimeout = options.forceTimeout ?? false;
    this.index = buildIndex(options.catalog, options.wishlist, options.commerce);
    this.breaker = new CircuitBreaker({
      window: this.config.breakerWindow,
      timeoutRate: this.config.breakerTimeoutRate,
      cooldownMs: this.config.breakerCooldownMs,
      now: options.now,
    });
  }

  get today(): string {
    return this.options.catalog.today;
  }

  /**
   * Always resolves, never rejects, and never takes longer than the configured
   * hard timeout.
   */
  async requestMatch(
    request: MatchRequest,
    authenticated: boolean
  ): Promise<MatchResponse> {
    const started = Date.now();

    // An unauthenticated caller gets the same empty shape as any miss, on the
    // same code path, so response timing carries no signal either (C-6).
    if (!authenticated) {
      return this.finish(request, false, started, false, false, EMPTY_RESPONSE);
    }

    // The user has turned the feature off (section 4.16). Checked before the
    // matcher runs, on the same path as any other miss, so the response is
    // indistinguishable from having nothing saved -- opting out must not
    // become its own signal.
    if (!this.preferences.showWishlistInSearch) {
      return this.finish(request, true, started, false, false, EMPTY_RESPONSE);
    }

    if (this.breaker.isOpen) {
      return this.finish(request, true, started, false, true, EMPTY_RESPONSE);
    }

    if (
      this.suppression.isDismissed(
        this.options.wishlist.user_id,
        request.session_id,
        request.query
      )
    ) {
      return this.finish(request, true, started, false, false, {
        ...EMPTY_RESPONSE,
        suppressed: true,
      });
    }

    let timedOut = false;
    let response: MatchResponse = EMPTY_RESPONSE;
    try {
      response = await this.withTimeout(request);
    } catch (error) {
      if (error instanceof TimeoutError) {
        timedOut = true;
      }
      // Any other failure is also a miss. Failing open is the whole point:
      // there is no error state the user should ever be shown here.
      response = EMPTY_RESPONSE;
    }
    this.breaker.record(timedOut);

    const capped = this.applyFrequencyCaps(response);
    const frequencyCapped = this.lastFrequencyCapped;

    // Control withholds exactly the way shadow mode does: the match is still
    // computed and logged, so control's opportunity volume is measurable and
    // the treatment has something to be compared against, but nothing renders.
    // Without this the flag exists and does not gate anything -- assignment
    // that no code consults is decoration.
    const withhold = this.shadowMode || this.arm === "control";
    if (withhold && capped.matches.length > 0) {
      return this.finish(
        request,
        true,
        started,
        timedOut,
        false,
        EMPTY_RESPONSE,
        frequencyCapped,
        capped
      );
    }
    return this.finish(request, true, started, timedOut, false, capped, frequencyCapped);
  }

  /** Dismissal hides the module for this query family and this session only. */
  dismiss(request: MatchRequest): void {
    this.suppression.dismiss(
      this.options.wishlist.user_id,
      request.session_id,
      request.query,
      this.today
    );
  }

  undo(request: MatchRequest): void {
    this.suppression.undismiss(
      this.options.wishlist.user_id,
      request.session_id,
      request.query
    );
  }

  familyOf(query: string): string {
    return queryFamily(query);
  }

  private applyFrequencyCaps(response: MatchResponse): MatchResponse {
    this.lastFrequencyCapped = false;
    const userId = this.options.wishlist.user_id;
    const kept = response.matches.filter((m) => {
      const item = this.options.wishlist.items.find((i) => i.sku === m.sku);
      const itemId = item?.item_id ?? m.sku;
      if (this.suppression.isCapped(userId, this.today, itemId, this.config.perItemDailyCap)) {
        return false;
      }
      this.suppression.recordImpression(userId, this.today, itemId);
      return true;
    });
    if (kept.length === response.matches.length) return response;
    if (kept.length === 0) {
      this.lastFrequencyCapped = response.matches.length > 0;
      return EMPTY_RESPONSE;
    }
    return { ...response, matches: kept };
  }

  private withTimeout(request: MatchRequest): Promise<MatchResponse> {
    const budget = this.config.timeoutMs;
    const latency = this.forceTimeout ? budget + 50 : this.latencyMs;

    return new Promise((resolve, reject) => {
      let settled = false;
      const work = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        try {
          resolve(
            match(request, this.index, this.config, (itemId) =>
              this.preferences.isHidden(itemId)
            )
          );
        } catch (error) {
          reject(error);
        }
      }, latency);

      const deadline = setTimeout(() => {
        if (settled) return;
        settled = true;
        // Abandon the work rather than let it run on past the budget: a late
        // result has nowhere to go, and the timer would outlive the call.
        clearTimeout(work);
        reject(new TimeoutError());
      }, budget);
    });
  }

  private finish(
    request: MatchRequest,
    authenticated: boolean,
    started: number,
    timedOut: boolean,
    breakerOpen: boolean,
    response: MatchResponse,
    /** True when frequency capping is why `response` is empty despite a real match. */
    frequencyCapped: boolean = false,
    /** What the matcher produced before shadow mode withheld it. */
    withheld?: MatchResponse
  ): MatchResponse {
    const durationMs = Date.now() - started;
    const evaluatedMatches = withheld ?? response;
    // The section 7 stream. Emitted for every evaluation whether or not
    // anything rendered -- during a shadow run that is the only record there is.
    this.options.events?.emit({
      type: "match_evaluated",
      ts: this.options.catalog.today,
      user_id: authenticated ? this.options.wishlist.user_id : "anonymous",
      session_id: request.session_id,
      arm: this.arm,
      query: request.query,
      modality: request.modality,
      candidates: evaluatedMatches.matches.map((m) => ({
        sku: m.sku,
        tier: m.tier,
        confidence: m.confidence,
        copy_key: m.copy_key,
        identity_confidence: m.identity_confidence,
      })),
      rendered: response.matches.length > 0,
      shadow: this.shadowMode,
      duration_ms: durationMs,
      timed_out: timedOut,
      breaker_open: breakerOpen,
    });

    if (response.matches.length > 0) {
      this.options.events?.emit({
        type: "module_rendered",
        ts: this.options.catalog.today,
        user_id: this.options.wishlist.user_id,
        session_id: request.session_id,
        arm: this.arm,
        query: request.query,
        skus: response.matches.map((m) => m.sku),
        copy_keys: response.matches.map((m) => m.copy_key),
        tiers: response.matches.map((m) => m.tier),
      });
    }

    // E8's gate covers log lines as well as responses. An empty response has
    // nothing to log anyway, but writing that down here is what stops a future
    // change from quietly adding the item id "just for debugging".
    this.shadow.push({
      request,
      authenticated,
      durationMs,
      timedOut,
      breakerOpen,
      suppressed: response.suppressed,
      rendered: response.matches.length,
      cappedTotal: response.capped_total,
      frequencyCapped,
      matches: response.matches.map((m) => ({
        sku: m.sku,
        tier: m.tier,
        confidence: m.confidence,
        copyKey: m.copy_key,
      })),
    });
    return response;
  }
}

export class TimeoutError extends Error {
  constructor() {
    super("match service timeout");
    this.name = "TimeoutError";
  }
}
