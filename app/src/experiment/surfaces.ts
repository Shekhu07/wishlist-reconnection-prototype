import type { ExperimentArm } from "@/analytics/events";

/**
 * Whether a surface derived from the user's wishlist may render at all.
 *
 * Control withholds, and shadow mode withholds, for the same reason: the match
 * is still computed and logged so control's opportunity volume is measurable,
 * but nothing about the wishlist reaches the screen. A control user who sees a
 * wishlist surface anywhere is no longer a control user, and every comparison
 * against them is contaminated.
 *
 * This exists as one function because the rule now has more than one caller.
 * The search module has always enforced it inside transport.ts; the home
 * screen's reconnection teaser is the second surface to need it, and a second
 * hand-written copy of `arm === "control"` is how the two would drift apart --
 * silently, and in the direction that invalidates the experiment rather than
 * the direction that breaks a test.
 */
export function wishlistSurfaceVisible(
  arm: ExperimentArm,
  shadowMode: boolean
): boolean {
  return !shadowMode && arm !== "control";
}
