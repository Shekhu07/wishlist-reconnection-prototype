import { sequentialMultiplier } from "@/experiment/sequential";

/**
 * Panel sizing for the Phase 4 experiment.
 *
 * The plan guesses 300-500 recruited testers (section 7.4 and the risk
 * register) and nothing has ever checked that guess. This checks it.
 *
 * Sample size is the easy half. The hard half is the chain between a recruited
 * person and a usable observation, and three links in it cost far more than
 * the arithmetic does:
 *
 *   **Five arms, not two.** Control, A, B, C and D. The panel splits five ways
 *   before anything else happens.
 *
 *   **The comparison that matters is B minus A.** Section 7 is explicit that
 *   the point of splitting the treatments is to learn *where* the lift comes
 *   from. But if A lifts 3 points and B lifts 5, B minus A is 2 -- a smaller
 *   effect than either, measured on two arms rather than against the whole
 *   control group. Powering for "B beats control" and calling it done leaves
 *   the actual question unanswerable.
 *
 *   **Intent-to-treat dilution.** A user assigned to a treatment who never
 *   sees the module behaves exactly like control. The observed effect is the
 *   true effect on the exposed, scaled by how many were ever exposed, and
 *   sample size scales with the square of that.
 *
 * Every input is labelled measured or assumed in the report. The base
 * conversion rate is assumed, it is the input the answer is most sensitive to,
 * and no data for it exists.
 */

/** Two-sided 5%, 80% power, unless a caller says otherwise. */
export const Z_ALPHA = 1.959964;
export const Z_POWER = 0.8416212;

export interface PowerInputs {
  baseRate: number;
  /** Absolute lift, in proportion units. 0.02 is two percentage points. */
  mde: number;
  zAlpha?: number;
  zPower?: number;
}

/** Fixed-horizon: valid only if you look once, at a size fixed in advance. */
export function perArmFixedHorizon({
  baseRate,
  mde,
  zAlpha = Z_ALPHA,
  zPower = Z_POWER,
}: PowerInputs): number {
  const p1 = baseRate;
  const p2 = Math.min(0.999, baseRate + mde);
  const variance = p1 * (1 - p1) + p2 * (1 - p2);
  return Math.ceil(((zAlpha + zPower) ** 2 * variance) / mde ** 2);
}

/**
 * Sequential: valid at every moment, so a staged ramp may stop whenever it
 * likes. The multiplier depends on the sample size, which depends on the
 * multiplier, so this iterates to a fixed point. It converges in a handful of
 * passes because the multiplier moves slowly in n.
 */
export function perArmSequential(inputs: PowerInputs): number {
  let n = perArmFixedHorizon(inputs);
  for (let i = 0; i < 40; i += 1) {
    const multiplier = sequentialMultiplier(n, 0.05);
    const next = perArmFixedHorizon({ ...inputs, zAlpha: multiplier });
    if (Math.abs(next - n) <= Math.max(1, n * 0.001)) return next;
    n = next;
  }
  return n;
}

export interface PanelInputs {
  /** Lift worth shipping, on the users who actually see the module. */
  effectOnExposed: number;
  baseRate: number;
  /** Of recruited panellists, how many use the app at all during the study. */
  engagementRate: number;
  /** Of engaged panellists, how many save at least one item. */
  saveRate: number;
  /** Of treatment users, how many are exposed to the module at least once. */
  exposureRate: number;
  arms: number;
  sequential: boolean;
  /**
   * Whether the target comparison is treatment-vs-control or the harder
   * B-minus-A that section 7 actually asks for.
   */
  comparison: "treatment_vs_control" | "b_minus_a";
  /** Only used for b_minus_a: how much of B's lift A already delivers. */
  sharedFraction?: number;
}

export interface PanelResult extends PanelInputs {
  /** The effect the estimator actually sees, after ITT dilution and B-minus-A. */
  observableEffect: number;
  perArm: number;
  cohortEntrants: number;
  panelSize: number;
}

export function panelSizeFor(inputs: PanelInputs): PanelResult {
  // ITT: a treatment user who never sees the module behaves like control, so
  // the effect the estimator sees is scaled by exposure.
  let observableEffect = inputs.effectOnExposed * inputs.exposureRate;

  if (inputs.comparison === "b_minus_a") {
    // B minus A is only the part of B's lift that A does not already deliver.
    observableEffect *= 1 - (inputs.sharedFraction ?? 0.6);
  }

  const perArm = inputs.sequential
    ? perArmSequential({ baseRate: inputs.baseRate, mde: observableEffect })
    : perArmFixedHorizon({ baseRate: inputs.baseRate, mde: observableEffect });

  const cohortEntrants = perArm * inputs.arms;
  const panelSize = Math.ceil(cohortEntrants / (inputs.engagementRate * inputs.saveRate));

  return { ...inputs, observableEffect, perArm, cohortEntrants, panelSize };
}

/** What a panel of this size can actually detect, which is the useful inverse. */
export function detectableEffect(
  panelSize: number,
  inputs: Omit<PanelInputs, "effectOnExposed">
): number {
  const entrants = panelSize * inputs.engagementRate * inputs.saveRate;
  const perArm = Math.floor(entrants / inputs.arms);
  if (perArm < 2) return Number.POSITIVE_INFINITY;

  // A rate cannot be lifted past 1, so nothing above this is a real answer.
  const maxObservable = 1 - inputs.baseRate;
  const requiredAtMax = inputs.sequential
    ? perArmSequential({ baseRate: inputs.baseRate, mde: maxObservable })
    : perArmFixedHorizon({ baseRate: inputs.baseRate, mde: maxObservable });

  // If even the largest arithmetically possible effect is out of reach, the
  // honest answer is "nothing", not a number. Rescaling a binary search that
  // ran off the end of its range produced figures like "detects a 127-point
  // lift", which is not a conservative estimate -- it is not an estimate.
  if (requiredAtMax > perArm) return Number.POSITIVE_INFINITY;

  let low = 0;
  let high = maxObservable;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const required = inputs.sequential
      ? perArmSequential({ baseRate: inputs.baseRate, mde: mid })
      : perArmFixedHorizon({ baseRate: inputs.baseRate, mde: mid });
    if (required > perArm) low = mid;
    else high = mid;
  }

  // Undo the dilution to express it as an effect on the exposed, which is the
  // number a product person can reason about. Undoing it can push the answer
  // back past what is possible, which is still "not detectable".
  let effect = high / inputs.exposureRate;
  if (inputs.comparison === "b_minus_a") {
    effect /= 1 - (inputs.sharedFraction ?? 0.6);
  }
  return effect > maxObservable ? Number.POSITIVE_INFINITY : effect;
}

/**
 * How long the study has to run.
 *
 * Censoring is cheap to fix and expensive to ignore: a 30-day window that has
 * not closed cannot be counted either way, so the study simply has to outlast
 * the last save by the window length. For a recruited panel this is a
 * scheduling fact rather than a sample-size problem.
 */
export function studyDurationDays(recruitmentDays: number, windowDays = 30): number {
  return recruitmentDays + windowDays;
}
