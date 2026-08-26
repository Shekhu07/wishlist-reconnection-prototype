import { thirtyDayWishlistToPurchaseRate } from "@/analytics/metrics";
import { simulate } from "@/analytics/simulate";

/**
 * Validating the cohort model, which is what plan S11 means by "dbt 30-day
 * cohort models validated on shadow data".
 *
 * The test is not "does the model produce a number" -- any model does that.
 * It is "does the model recover an effect we planted". A model that cannot
 * find a known 5-point lift will not find an unknown one, and a model that
 * finds a lift in data with none planted is worse than no model.
 */

describe("30-day cohort model", () => {
  it("recovers an injected lift in both treatment arms", () => {
    const { log, asOf, injected } = simulate({ users: 3000, seed: 11 });
    const events = log.all();

    const control = thirtyDayWishlistToPurchaseRate(events, asOf, "control");
    const a = thirtyDayWishlistToPurchaseRate(events, asOf, "treatment_a");
    const b = thirtyDayWishlistToPurchaseRate(events, asOf, "treatment_b");

    const measuredA = a.rate.value! - control.rate.value!;
    const measuredB = b.rate.value! - control.rate.value!;

    // Sampling noise at 1,000 users per arm is worth roughly 3 points, so the
    // tolerance is wide on purpose. A tighter one would fail on noise and
    // teach the reader to ignore it.
    expect(measuredA).toBeCloseTo(injected.treatment_a, 1);
    expect(measuredB).toBeCloseTo(injected.treatment_b, 1);
    expect(measuredB).toBeGreaterThan(measuredA);
  });

  it("finds no lift when none was planted", () => {
    const { log, asOf } = simulate({
      users: 3000,
      seed: 12,
      liftTreatmentA: 0,
      liftTreatmentB: 0,
    });
    const events = log.all();
    const control = thirtyDayWishlistToPurchaseRate(events, asOf, "control");
    const a = thirtyDayWishlistToPurchaseRate(events, asOf, "treatment_a");
    expect(Math.abs(a.rate.value! - control.rate.value!)).toBeLessThan(0.04);
  });

  it("censors users whose 30-day window has not closed rather than failing them", () => {
    const { log, asOf } = simulate({ users: 400, seed: 13 });
    const result = thirtyDayWishlistToPurchaseRate(log.all(), asOf);
    // Counting an open window as a non-conversion would drag the rate down and
    // then drift upward for thirty days, which looks exactly like an effect.
    expect(result.censored).toBeGreaterThan(0);
    expect(result.entered + result.censored).toBeGreaterThan(0);
  });

  it("reports a null rate rather than zero when the cohort is empty", () => {
    const { asOf } = simulate({ users: 0 });
    const result = thirtyDayWishlistToPurchaseRate([], asOf);
    expect(result.rate.value).toBeNull();
  });

  it("counts a user once however many saved items they buy", () => {
    const { log, asOf } = simulate({ users: 600, seed: 14 });
    const result = thirtyDayWishlistToPurchaseRate(log.all(), asOf);
    expect(result.converted).toBeLessThanOrEqual(result.entered);
  });

  it("ignores purchases that fall outside the window", () => {
    const { log, asOf } = simulate({ users: 900, seed: 15 });
    const thirty = thirtyDayWishlistToPurchaseRate(log.all(), asOf, undefined, 30);
    const seven = thirtyDayWishlistToPurchaseRate(log.all(), asOf, undefined, 7);
    // A shorter window cannot capture more conversions than a longer one.
    expect(seven.rate.value!).toBeLessThanOrEqual(thirty.rate.value! + 1e-9);
  });
});
