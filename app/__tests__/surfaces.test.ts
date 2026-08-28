import type { ExperimentArm } from "@/analytics/events";
import { wishlistSurfaceVisible } from "@/experiment/surfaces";

/**
 * The home teaser made the wishlist a two-surface feature, and the rule about
 * who may see one now has two callers. These tests exist because the way this
 * breaks is not a crash: control quietly starts seeing a wishlist surface, the
 * suite stays green, and every comparison against control is contaminated
 * without anything failing.
 */

const TREATMENTS: ExperimentArm[] = [
  "treatment_a",
  "treatment_b",
  "treatment_c",
  "treatment_d",
];

describe("who may see a wishlist surface", () => {
  it("withholds from control", () => {
    expect(wishlistSurfaceVisible("control", false)).toBe(false);
  });

  it("withholds in shadow mode, from every arm", () => {
    expect(wishlistSurfaceVisible("control", true)).toBe(false);
    for (const arm of TREATMENTS) {
      expect([arm, wishlistSurfaceVisible(arm, true)]).toEqual([arm, false]);
    }
  });

  it("shows to every treatment arm outside shadow mode", () => {
    for (const arm of TREATMENTS) {
      expect([arm, wishlistSurfaceVisible(arm, false)]).toEqual([arm, true]);
    }
  });
});
