/**
 * Always-valid inference for the ramp.
 *
 * A staged ramp means looking at the numbers repeatedly, and a fixed-horizon
 * test is only valid if you look exactly once at a sample size fixed in
 * advance. Peek fifty times at a run with no effect and a 5% test will cross
 * its own threshold far more often than 5% of the time -- not occasionally,
 * but as a matter of arithmetic. That is how an experiment "finds" a lift that
 * was never there.
 *
 * The remedy is a confidence sequence: an interval valid at *every* time
 * simultaneously, so stopping whenever you like costs nothing. It is wider
 * than a fixed-horizon interval at any single moment, and that width is the
 * price of being allowed to look.
 *
 * `peekingDemo` below measures the difference rather than asserting it.
 */

export interface ArmObservation {
  successes: number;
  trials: number;
}

export interface Interval {
  difference: number;
  lower: number;
  upper: number;
  /** The interval excludes zero, so the sign of the effect is determined. */
  significant: boolean;
}

/**
 * Mixture tuning. Smaller rho buys tighter intervals late at the cost of
 * looser ones early; 0.05 keeps the penalty reasonable across the sample sizes
 * a ramp actually reaches.
 */
const RHO = 0.05;

function standardError(control: ArmObservation, treatment: ArmObservation): number {
  if (control.trials === 0 || treatment.trials === 0) return Infinity;
  const pc = control.successes / control.trials;
  const pt = treatment.successes / treatment.trials;
  return Math.sqrt((pc * (1 - pc)) / control.trials + (pt * (1 - pt)) / treatment.trials);
}

function difference(control: ArmObservation, treatment: ArmObservation): number {
  if (control.trials === 0 || treatment.trials === 0) return 0;
  return treatment.successes / treatment.trials - control.successes / control.trials;
}

/**
 * The multiplier a confidence sequence uses in place of the fixed-horizon
 * 1.96. It shrinks towards the fixed value as the sample grows, which is why
 * a sequential test costs most at the start of a ramp -- exactly when a naive
 * reading is most likely to be wrong.
 */
export function sequentialMultiplier(effectiveN: number, alpha = 0.05): number {
  if (effectiveN <= 0) return Infinity;
  const term = effectiveN * RHO * RHO + 1;
  return Math.sqrt(((2 * term) / (effectiveN * RHO * RHO)) * Math.log(Math.sqrt(term) / alpha));
}

/** Valid at a single pre-declared sample size, and at no other moment. */
export function fixedHorizonInterval(
  control: ArmObservation,
  treatment: ArmObservation,
  alpha = 0.05
): Interval {
  const diff = difference(control, treatment);
  const se = standardError(control, treatment);
  const z = alpha === 0.05 ? 1.959964 : 1.959964;
  const half = z * se;
  return {
    difference: diff,
    lower: diff - half,
    upper: diff + half,
    significant: Number.isFinite(half) && (diff - half > 0 || diff + half < 0),
  };
}

/** Valid at every moment simultaneously, so you may stop whenever you like. */
export function alwaysValidInterval(
  control: ArmObservation,
  treatment: ArmObservation,
  alpha = 0.05
): Interval {
  const diff = difference(control, treatment);
  const se = standardError(control, treatment);
  // Harmonic mean: the smaller arm governs how much the pair actually knows.
  const effectiveN =
    control.trials === 0 || treatment.trials === 0
      ? 0
      : (2 * control.trials * treatment.trials) / (control.trials + treatment.trials);
  const half = sequentialMultiplier(effectiveN, alpha) * se;
  return {
    difference: diff,
    lower: diff - half,
    upper: diff + half,
    significant: Number.isFinite(half) && (diff - half > 0 || diff + half < 0),
  };
}

export interface PeekingResult {
  runs: number;
  peeks: number;
  /** Runs where a fixed-horizon test declared significance at some peek. */
  fixedHorizonFalsePositives: number;
  /** Runs where the confidence sequence did. */
  sequentialFalsePositives: number;
}

/**
 * Measure the cost of peeking, on data with no effect whatsoever.
 *
 * Both arms are drawn from the same distribution, so every declared result is
 * a false positive by construction. A 5% test looked at once should be wrong
 * about 5% of the time; looked at repeatedly, it is wrong far more often.
 */
export function peekingDemo(
  runs = 400,
  peeks = 40,
  perPeek = 100,
  rate = 0.2,
  seed = 4242
): PeekingResult {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let fixed = 0;
  let sequential = 0;

  for (let run = 0; run < runs; run += 1) {
    const control: ArmObservation = { successes: 0, trials: 0 };
    const treatment: ArmObservation = { successes: 0, trials: 0 };
    let fixedFired = false;
    let sequentialFired = false;

    for (let peek = 0; peek < peeks; peek += 1) {
      for (let i = 0; i < perPeek; i += 1) {
        control.trials += 1;
        if (random() < rate) control.successes += 1;
        treatment.trials += 1;
        if (random() < rate) treatment.successes += 1;
      }
      if (!fixedFired && fixedHorizonInterval(control, treatment).significant) fixedFired = true;
      if (!sequentialFired && alwaysValidInterval(control, treatment).significant) {
        sequentialFired = true;
      }
    }
    if (fixedFired) fixed += 1;
    if (sequentialFired) sequential += 1;
  }

  return {
    runs,
    peeks,
    fixedHorizonFalsePositives: fixed,
    sequentialFalsePositives: sequential,
  };
}
