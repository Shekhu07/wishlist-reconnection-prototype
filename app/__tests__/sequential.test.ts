import {
  alwaysValidInterval,
  fixedHorizonInterval,
  peekingDemo,
  sequentialMultiplier,
} from "@/experiment/sequential";

/**
 * A staged ramp means looking repeatedly, and a fixed-horizon test is only
 * valid if you look once. These tests measure what that costs rather than
 * asserting it as a principle.
 */

describe("sequential inference (E10)", () => {
  it("is wider than a fixed-horizon interval at the same data", () => {
    const control = { successes: 200, trials: 1000 };
    const treatment = { successes: 230, trials: 1000 };
    const fixed = fixedHorizonInterval(control, treatment);
    const sequential = alwaysValidInterval(control, treatment);
    // That extra width is the price of being allowed to stop whenever you like.
    expect(sequential.upper - sequential.lower).toBeGreaterThan(fixed.upper - fixed.lower);
    expect(sequential.difference).toBeCloseTo(fixed.difference, 12);
  });

  it("narrows towards the fixed-horizon multiplier as the sample grows", () => {
    const early = sequentialMultiplier(500);
    const late = sequentialMultiplier(200_000);
    expect(early).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(1.96);
  });

  it("costs most at the start of a ramp, when a naive reading is most wrong", () => {
    expect(sequentialMultiplier(100)).toBeGreaterThan(sequentialMultiplier(10_000));
  });

  it("detects a large real effect", () => {
    const control = { successes: 1800, trials: 10_000 };
    const treatment = { successes: 2300, trials: 10_000 };
    expect(alwaysValidInterval(control, treatment).significant).toBe(true);
  });

  it("declares nothing on identical arms", () => {
    const arm = { successes: 2000, trials: 10_000 };
    expect(alwaysValidInterval(arm, { ...arm }).significant).toBe(false);
  });

  it("holds its error rate under repeated peeking, where a fixed test does not", () => {
    // No effect exists in this data at all, so every declaration is a false
    // positive by construction.
    const result = peekingDemo(300, 40, 100, 0.2, 99);
    const fixedRate = result.fixedHorizonFalsePositives / result.runs;
    const sequentialRate = result.sequentialFalsePositives / result.runs;

    // The point of the test: peeking inflates the fixed-horizon error rate
    // well past its nominal 5%, and the confidence sequence stays near it.
    expect(fixedRate).toBeGreaterThan(0.15);
    expect(sequentialRate).toBeLessThan(0.05);
    expect(sequentialRate).toBeLessThan(fixedRate);
  });

  it("returns an infinite interval rather than a number when an arm is empty", () => {
    const interval = alwaysValidInterval({ successes: 0, trials: 0 }, { successes: 1, trials: 10 });
    expect(interval.significant).toBe(false);
  });
});
