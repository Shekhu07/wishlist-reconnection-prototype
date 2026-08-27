import type { Catalog, Wishlist } from "@/data/types";
import { DEFAULT_CONFIG, type MatchConfig, type Modality } from "@/match/contract";
import { buildIndex, match } from "@/match/matcher";
import { buildSearchIndex, search } from "@/search/localSearch";
import { buildLabelledPairs, isAcceptable, wishlistFor } from "./evalSets";

/**
 * Phase 3 (plan S8-S9): matching runs, nothing renders.
 *
 * Two things come out of a shadow run, and neither is available any other way:
 *
 *   opportunity volume -- how often the module *would* have appeared, which is
 *     what tells you whether the feature is worth running an experiment on;
 *   a threshold sweep -- what each candidate tau costs in volume and buys in
 *     precision, per modality, which is the S9 tuning deliverable.
 *
 * The plan's S8 gate is "zero measurable search latency delta", and that is
 * checked here structurally: search is timed with matching running and with it
 * absent, and the two are compared.
 */

export interface TauSweepRow {
  tau: number;
  /** Volume: share of evaluations that would have rendered something. */
  opportunityRate: number;
  /**
   * Quality: precision at this threshold, measured over the labelled pair set.
   *
   * An earlier version of this column reported the share of rendered
   * candidates with full identity confidence, which reads like a quality
   * measure and is not one -- items below the identity floor are skipped
   * before scoring, so that share is 100% at every threshold and the sweep
   * recommended the lowest tau on the table. A criterion that cannot come out
   * two different ways is not a criterion.
   */
  precision: number | null;
  meanConfidence: number;
  rendered: number;
  evaluated: number;
}

export interface ShadowRun {
  evaluated: number;
  withCandidates: number;
  opportunityRate: number;
  /**
   * Saved items permanently ineligible because their saved colourway sits
   * below the identity floor. A static property of the wishlist, not a
   * per-query outcome -- those items are skipped before scoring.
   */
  ineligibleOnIdentity: number;
  tierMix: { tier1: number; tier2: number };
  sweep: TauSweepRow[];
  latency: { searchAlone: number; searchWithMatch: number; deltaMs: number };
}

const QUERY_MODALITIES: Modality[] = ["text", "voice", "image"];

/**
 * Run the matcher across every query the catalog can generate, record what it
 * would have shown, and render nothing.
 */
export function runShadow(
  catalog: Catalog,
  wishlist: Wishlist,
  config: MatchConfig = DEFAULT_CONFIG
): ShadowRun {
  const index = buildIndex(catalog, wishlist);
  const searchIndex = buildSearchIndex(catalog);

  const queries = catalog.parents.flatMap((parent) => [
    `${parent.brand} ${parent.articleType}`.toLowerCase(),
    parent.articleType.toLowerCase(),
  ]);

  let evaluated = 0;
  let withCandidates = 0;
  let tier1 = 0;
  let tier2 = 0;

  const ineligibleOnIdentity = wishlist.items.filter((item) => {
    const parent = index.parents.get(item.parent_product_id);
    const saved = parent?.colourways.find((c) => c.product_id === item.product_id);
    return saved !== undefined && saved.identity_confidence < config.minIdentityConfidence;
  }).length;

  // Scored candidates are kept so the sweep can be recomputed at any tau
  // without re-running the matcher, which is what makes a sweep cheap enough
  // to be worth doing across three modalities.
  const scored: { modality: Modality; confidence: number; identity: number; tier: number }[] = [];

  for (const modality of QUERY_MODALITIES) {
    for (const query of queries) {
      evaluated += 1;
      // Sweeping needs candidates below the live threshold too, so evaluation
      // runs at tau 0 and the thresholds are applied afterwards.
      const response = match(
        {
          query,
          modality,
          filters: {},
          delivery_pincode: wishlist.pincode,
          session_id: `shadow_${evaluated}`,
        },
        index,
        { ...config, tau: { ...config.tau, [modality]: 0 } }
      );

      if (response.matches.length > 0) withCandidates += 1;
      for (const candidate of response.matches) {
        scored.push({
          modality,
          confidence: candidate.confidence,
          identity: candidate.identity_confidence,
          tier: candidate.tier,
        });
        if (candidate.tier === 1) tier1 += 1;
        else tier2 += 1;
      }
    }
  }

  // Precision per threshold, over the labelled pairs. This is what makes the
  // sweep a tradeoff curve rather than a list: each row costs volume and buys
  // precision, and the reader can see the exchange rate.
  const pairs = buildLabelledPairs(catalog, 500);
  const scoredPairs = pairs
    .map((pair) => {
      const pairWishlist = wishlistFor(pair, catalog);
      if (!pairWishlist) return null;
      const response = match(
        {
          query: pair.query,
          modality: "text",
          filters: {},
          delivery_pincode: pairWishlist.pincode,
          session_id: pair.id,
        },
        buildIndex(catalog, pairWishlist),
        { ...config, tau: { ...config.tau, text: 0 } }
      );
      const top = response.matches[0];
      if (!top) return null;
      return {
        confidence: top.confidence,
        correct: isAcceptable(pair, top, pairWishlist.items[0].sku),
      };
    })
    .filter((row): row is { confidence: number; correct: boolean } => row !== null);

  // One sweep, not three. Confidence does not depend on modality -- modality
  // sets which threshold you apply, not what a candidate scores. Publishing a
  // table per modality would imply three independent measurements when the
  // three are identical by construction.
  const perModality = scored.filter((row) => row.modality === "text");
  const sweep: TauSweepRow[] = [0.6, 0.65, 0.7, 0.72, 0.75, 0.8, 0.85, 0.9].map((tau) => {
    const above = perModality.filter((row) => row.confidence >= tau);
    const pairsAbove = scoredPairs.filter((row) => row.confidence >= tau);
    return {
      tau,
      opportunityRate: above.length / queries.length,
      precision:
        pairsAbove.length === 0
          ? null
          : pairsAbove.filter((row) => row.correct).length / pairsAbove.length,
      meanConfidence:
        above.length === 0
          ? 0
          : above.reduce((sum, row) => sum + row.confidence, 0) / above.length,
      rendered: above.length,
      evaluated: queries.length,
    };
  });

  // The S8 gate. Search is timed on its own, then timed while the matcher runs
  // in the same tick. Because search takes no wishlist argument there is no
  // ordering in which it could block, so the expected delta is noise.
  const sampleQueries = queries.slice(0, 200);
  const timeSearch = (withMatch: boolean) => {
    const started = process.hrtime.bigint();
    for (const query of sampleQueries) {
      search(query, searchIndex);
      if (withMatch) {
        match(
          {
            query,
            modality: "text",
            filters: {},
            delivery_pincode: wishlist.pincode,
            session_id: "latency",
          },
          index,
          config
        );
      }
    }
    return Number(process.hrtime.bigint() - started) / 1e6 / sampleQueries.length;
  };

  // Warm both paths first, or the first one measured pays for compilation.
  timeSearch(false);
  timeSearch(true);
  const searchAlone = timeSearch(false);
  const searchWithMatch = timeSearch(true);
  // At this magnitude (sub-millisecond, in-process) the sign of this delta
  // is dominated by scheduler/JIT noise -- an earlier version of this file
  // sampled it repeatedly to report "N of M runs positive", which produced a
  // different, contradictory finding depending on which run got committed.
  // Repetition can't fix that; it only relocates the coin flip. Report the
  // magnitude only, which is what the S8 gate (search does not wait on
  // matching) actually needs.
  const deltaMs = searchWithMatch - searchAlone;

  return {
    evaluated,
    withCandidates,
    opportunityRate: withCandidates / evaluated,
    ineligibleOnIdentity,
    tierMix: { tier1, tier2 },
    sweep,
    latency: {
      searchAlone,
      searchWithMatch,
      deltaMs,
    },
  };
}

/** The E1 gate is 99% precision, so that is what a threshold has to buy. */
export const PRECISION_TARGET = 0.99;

export interface TauRecommendation {
  modality: Modality;
  current: number;
  recommended: number;
  /** False when the sweep cannot discriminate and the current value stands. */
  supported: boolean;
  rationale: string;
}

/**
 * What the sweep supports for a modality -- including "nothing".
 *
 * If precision already meets the target at the *lowest* threshold tested, the
 * sweep has not found the point where tau starts to matter; it has only shown
 * that something else (the hard predicates, the colour-intent rule) is
 * absorbing the false positives in this eval set. Reading that as "tau can
 * safely come down" would be treating an absence of evidence as evidence of
 * absence, and it would ship a lower threshold on the strength of a test that
 * cannot see the risk. So the recommendation in that case is to change
 * nothing, and to say why.
 */
export function recommendTau(
  sweep: TauSweepRow[],
  modality: Modality,
  config: MatchConfig = DEFAULT_CONFIG
): TauRecommendation {
  const current = config.tau[modality];
  const rows = sweep
    .filter((row) => row.rendered > 0 && row.precision !== null)
    .sort((a, b) => a.tau - b.tau);

  if (rows.length === 0) {
    return {
      modality,
      current,
      recommended: current,
      supported: false,
      rationale: "No candidates cleared any threshold; the sweep is empty.",
    };
  }

  if ((rows[0].precision ?? 0) >= PRECISION_TARGET) {
    return {
      modality,
      current,
      recommended: current,
      supported: false,
      rationale:
        `Precision is already ${(rows[0].precision! * 100).toFixed(1)}% at the lowest threshold tested ` +
        `(${rows[0].tau.toFixed(2)}), so this sweep never observes tau doing the work. It cannot ` +
        "support lowering the threshold -- it can only show that the hard predicates absorb the " +
        "false positives this eval set contains.",
    };
  }

  const cleanIndex = rows.findIndex((row) => (row.precision ?? 0) >= PRECISION_TARGET);
  const baseIndex = cleanIndex === -1 ? rows.length - 1 : cleanIndex;
  const step = modality === "voice" || modality === "image" ? 1 : 0;
  const chosen = rows[Math.min(rows.length - 1, baseIndex + step)];
  return {
    modality,
    current,
    recommended: chosen.tau,
    supported: true,
    rationale:
      `Lowest threshold meeting the ${(PRECISION_TARGET * 100).toFixed(0)}% target` +
      (step > 0 ? ", stepped up one rung for constraint C-8." : "."),
  };
}
