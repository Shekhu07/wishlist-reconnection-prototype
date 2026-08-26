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
  /** Full scoring detail, logged whether or not anything rendered. */
  matches: { sku: string; tier: number; confidence: number; copyKey: string }[];
}

export interface MatchClientOptions {
  catalog: Catalog;
  wishlist: Wishlist;
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
  config: MatchConfig;
  latencyMs: number;
  forceTimeout: boolean;

  constructor(private readonly options: MatchClientOptions) {
    this.config = options.config ?? DEFAULT_CONFIG;
    this.latencyMs = options.latencyMs ?? 60;
    this.forceTimeout = options.forceTimeout ?? false;
    this.index = buildIndex(options.catalog, options.wishlist);
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
    return this.finish(request, true, started, timedOut, false, capped);
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
    if (kept.length === 0) return EMPTY_RESPONSE;
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
          resolve(match(request, this.index, this.config));
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
    response: MatchResponse
  ): MatchResponse {
    this.shadow.push({
      request,
      authenticated,
      durationMs: Date.now() - started,
      timedOut,
      breakerOpen,
      suppressed: response.suppressed,
      rendered: response.matches.length,
      cappedTotal: response.capped_total,
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
