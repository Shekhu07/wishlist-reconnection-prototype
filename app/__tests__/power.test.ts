import {
  detectableEffect,
  panelSizeFor,
  perArmFixedHorizon,
  perArmSequential,
  studyDurationDays,
  type PanelInputs,
} from "@/analytics/power";

const BASE: PanelInputs = {
  effectOnExposed: 0.05,
  baseRate: 0.18,
  engagementRate: 0.8,
  saveRate: 0.85,
  exposureRate: 0.856,
  arms: 3,
  sequential: true,
  comparison: "treatment_vs_control",
};

const inverse = { ...BASE } as Omit<PanelInputs, "effectOnExposed">;

describe("panel sizing", () => {
  it("needs a bigger sample for a smaller effect, at the square", () => {
    const half = perArmFixedHorizon({ baseRate: 0.18, mde: 0.02 });
    const full = perArmFixedHorizon({ baseRate: 0.18, mde: 0.04 });
    expect(half / full).toBeGreaterThan(3.5);
    expect(half / full).toBeLessThan(4.5);
  });

  it("charges more for the right to peek", () => {
    const fixed = perArmFixedHorizon({ baseRate: 0.18, mde: 0.04 });
    const sequential = perArmSequential({ baseRate: 0.18, mde: 0.04 });
    expect(sequential).toBeGreaterThan(fixed);
  });

  it("prices intent-to-treat dilution into the sample", () => {
    const full = panelSizeFor({ ...BASE, exposureRate: 1 });
    const diluted = panelSizeFor({ ...BASE, exposureRate: 0.5 });
    // Halving exposure roughly quadruples the requirement.
    expect(diluted.panelSize / full.panelSize).toBeGreaterThan(3.5);
  });

  it("makes B minus A far more expensive than B against control", () => {
    // The comparison section 7 actually asks for is the one nobody powers for.
    const vsControl = panelSizeFor(BASE);
    const bMinusA = panelSizeFor({ ...BASE, comparison: "b_minus_a", sharedFraction: 0.6 });
    expect(bMinusA.panelSize).toBeGreaterThan(vsControl.panelSize * 4);
  });

  it("refuses to name an effect a small panel could never see", () => {
    // Rescaling a binary search that ran off its range produced "detects a
    // 127-point lift", which is not a conservative estimate; it is not an
    // estimate. Infinity is the honest answer.
    const tiny = detectableEffect(400, { ...inverse, comparison: "b_minus_a" });
    expect(tiny).toBe(Number.POSITIVE_INFINITY);
  });

  it("never claims a detectable lift larger than the rate allows", () => {
    for (const panel of [50, 200, 400, 1000, 5000, 50_000]) {
      const effect = detectableEffect(panel, inverse);
      if (Number.isFinite(effect)) {
        expect(effect).toBeLessThanOrEqual(1 - BASE.baseRate);
      }
    }
  });

  it("detects smaller effects as the panel grows", () => {
    const small = detectableEffect(5_000, inverse);
    const large = detectableEffect(50_000, inverse);
    expect(large).toBeLessThan(small);
  });

  it("round-trips: the panel it sizes can see the effect it sized for", () => {
    const sized = panelSizeFor(BASE);
    const detects = detectableEffect(sized.panelSize, inverse);
    expect(detects).toBeLessThanOrEqual(BASE.effectOnExposed * 1.05);
  });

  it("treats censoring as a scheduling fact rather than a sample-size problem", () => {
    expect(studyDurationDays(14)).toBe(44);
    expect(studyDurationDays(0)).toBe(30);
  });

  it("shows the plan's guess is short by more than an order of magnitude", () => {
    expect(panelSizeFor(BASE).panelSize).toBeGreaterThan(500 * 10);
  });
});
