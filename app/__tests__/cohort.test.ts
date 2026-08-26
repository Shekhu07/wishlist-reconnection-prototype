import { thirtyDayWishlistToPurchaseRate } from "@/analytics/metrics";
import { simulate } from "@/analytics/simulate";
import { alwaysValidInterval } from "@/experiment/sequential";

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
    // 30,000 users, because only about a third clear the 30-day window and an
    // arbitrary point tolerance at 500 per arm fails on noise alone. The
    // assertion is an interval rather than a tolerance, so "recovered" means
    // something statistical instead of something chosen.
    const { log, asOf, injected } = simulate({ users: 30_000, seed: 11 });
    const events = log.all();

    const control = thirtyDayWishlistToPurchaseRate(events, asOf, "control");
    const arms = ["treatment_a", "treatment_b"] as const;

    for (const name of arms) {
      const arm = thirtyDayWishlistToPurchaseRate(events, asOf, name);
      const interval = alwaysValidInterval(
        { successes: control.converted, trials: control.entered },
        { successes: arm.converted, trials: arm.entered }
      );
      const planted = injected[name];
      // The planted effect lies inside the interval, and zero does not: the
      // model both finds the effect and rules out its absence.
      expect(interval.lower).toBeLessThan(planted);
      expect(interval.upper).toBeGreaterThan(planted);
      expect(interval.significant).toBe(true);
    }
  });

  it("finds no lift when none was planted", () => {
    const { log, asOf } = simulate({
      users: 30_000,
      seed: 12,
      liftTreatmentA: 0,
      liftTreatmentB: 0,
    });
    const events = log.all();
    const control = thirtyDayWishlistToPurchaseRate(events, asOf, "control");
    const a = thirtyDayWishlistToPurchaseRate(events, asOf, "treatment_a");
    const interval = alwaysValidInterval(
      { successes: control.converted, trials: control.entered },
      { successes: a.converted, trials: a.entered }
    );
    // No effect planted, so the interval must not rule zero out. A model that
    // finds a lift in data with none is worse than no model.
    expect(interval.significant).toBe(false);
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
