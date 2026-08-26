import type { AnalyticsEvent } from "@/analytics/events";
import { latencyAndErrorRate, searchToPurchaseRate } from "@/analytics/metrics";

/**
 * E10: the three guardrails that flip the flag without waiting for a human.
 *
 * Section 7 names them: search-to-purchase rate, latency p95, and error rate.
 * The first is relative -- it only means anything against control -- while the
 * other two are absolute limits the service must hold regardless of arm.
 *
 * Two design choices worth stating, because both are the difference between a
 * kill switch and a nuisance:
 *
 *   **A minimum sample.** A breach declared on nine sessions is noise, and a
 *   switch that fires on noise gets disabled by the first person it wakes.
 *
 *   **Stickiness.** Once tripped the switch stays tripped until a human clears
 *   it. Auto-recovery would let a genuinely broken treatment flap in and out
 *   of the population, which is worse than either state on its own.
 */

export type GuardrailId = "search_to_purchase" | "latency_p95" | "error_rate";

export interface GuardrailThresholds {
  /** Relative drop against control that counts as a breach, e.g. 0.05 = 5%. */
  searchToPurchaseRelativeDrop: number;
  latencyP95Ms: number;
  errorRate: number;
  /** Below this many observations, no breach is declared either way. */
  minimumSample: number;
}

export const DEFAULT_THRESHOLDS: GuardrailThresholds = {
  // The plan's launch criterion is "no degradation in search-to-purchase rate".
  // A hard zero would trip on noise, so the switch fires on a drop large
  // enough to be worth acting on, and the sequential test is what decides
  // whether a smaller one is real.
  searchToPurchaseRelativeDrop: 0.05,
  latencyP95Ms: 120,
  errorRate: 0.01,
  minimumSample: 200,
};

export interface GuardrailReading {
  id: GuardrailId;
  label: string;
  control: number | null;
  treatment: number | null;
  threshold: string;
  breached: boolean;
  /** True when there was not enough data to judge. */
  undetermined: boolean;
  detail: string;
}

export function evaluateGuardrails(
  events: readonly AnalyticsEvent[],
  thresholds: GuardrailThresholds = DEFAULT_THRESHOLDS
): GuardrailReading[] {
  const controlFunnel = searchToPurchaseRate(events, "control");
  const treatmentFunnel = [
    searchToPurchaseRate(events, "treatment_a"),
    searchToPurchaseRate(events, "treatment_b"),
  ];
  const treatmentNumerator = treatmentFunnel.reduce((sum, r) => sum + r.numerator, 0);
  const treatmentDenominator = treatmentFunnel.reduce((sum, r) => sum + r.denominator, 0);
  const treatmentRate =
    treatmentDenominator === 0 ? null : treatmentNumerator / treatmentDenominator;

  const sampleTooSmall =
    controlFunnel.denominator < thresholds.minimumSample ||
    treatmentDenominator < thresholds.minimumSample;

  const relativeDrop =
    controlFunnel.value === null || treatmentRate === null || controlFunnel.value === 0
      ? null
      : (controlFunnel.value - treatmentRate) / controlFunnel.value;

  const funnel: GuardrailReading = {
    id: "search_to_purchase",
    label: "Search-to-purchase rate",
    control: controlFunnel.value,
    treatment: treatmentRate,
    threshold: `no more than ${(thresholds.searchToPurchaseRelativeDrop * 100).toFixed(0)}% relative drop`,
    breached:
      !sampleTooSmall &&
      relativeDrop !== null &&
      relativeDrop > thresholds.searchToPurchaseRelativeDrop,
    undetermined: sampleTooSmall || relativeDrop === null,
    detail:
      relativeDrop === null
        ? "no comparable traffic yet"
        : `${(relativeDrop * 100).toFixed(1)}% relative change against control`,
  };

  // Latency and errors are absolute: a treatment that is fast for its own
  // users and slow for everyone else is still a broken service.
  const health = latencyAndErrorRate(events);
  const healthSample = events.filter((event) => event.type === "match_evaluated").length;
  const healthTooSmall = healthSample < thresholds.minimumSample;

  const latency: GuardrailReading = {
    id: "latency_p95",
    label: "Match latency p95",
    control: null,
    treatment: health.p95,
    threshold: `≤ ${thresholds.latencyP95Ms} ms`,
    breached: !healthTooSmall && health.p95 > thresholds.latencyP95Ms,
    undetermined: healthTooSmall,
    detail: `p95 ${health.p95.toFixed(1)} ms over ${healthSample.toLocaleString("en-IN")} evaluations`,
  };

  const errors: GuardrailReading = {
    id: "error_rate",
    label: "Match error rate",
    control: null,
    treatment: health.errorRate.value,
    threshold: `≤ ${(thresholds.errorRate * 100).toFixed(1)}%`,
    breached:
      !healthTooSmall &&
      health.errorRate.value !== null &&
      health.errorRate.value > thresholds.errorRate,
    undetermined: healthTooSmall || health.errorRate.value === null,
    detail: `${health.errorRate.numerator} of ${health.errorRate.denominator} evaluations failed or timed out`,
  };

  return [funnel, latency, errors];
}

export function anyBreached(readings: GuardrailReading[]): boolean {
  return readings.some((reading) => reading.breached);
}
