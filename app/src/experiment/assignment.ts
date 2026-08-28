import type { ExperimentArm } from "@/analytics/events";

/**
 * E10: deterministic assignment and the staged ramp.
 *
 * Two properties carry the whole experiment, and both are easy to lose:
 *
 *   **Stability.** A user's arm is a pure function of their id and the salt.
 *   No storage, no lookup, no session state. If assignment could drift, a
 *   user could see the module on Monday and not on Tuesday, and every metric
 *   computed per-user would be measuring a mixture.
 *
 *   **Monotonicity.** Raising the ramp from 5% to 20% must only *add* users.
 *   Anyone already in an arm stays in that arm. The obvious implementation --
 *   bucket into arms, then take the first N% of each -- looks right and
 *   silently reshuffles at every ramp step, which invalidates the run without
 *   producing any visible symptom. `assign` is written so that the exposure
 *   decision and the arm decision use *independent* hashes, which is what
 *   makes the property hold.
 */

export const DEFAULT_SALT = "wishlist-reconnection-v1";

/** The plan's staged ramp (S12+). */
export const RAMP_STEPS = [0, 0.01, 0.05, 0.2, 0.5] as const;

/**
 * FNV-1a with a MurmurHash3 finaliser.
 *
 * FNV-1a alone is stable and fast but avalanches poorly on short, nearly
 * identical keys -- exactly what user ids are. Bucketing 5,000 sequential ids
 * with the raw hash left one decile 30% light and pushed the exposed share
 * 1.5 points off the ramp, which is unbalanced arms and a biased experiment.
 * The finaliser mixes the low bits back through the whole word.
 */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/** A stable float in [0, 1) for a user under a named purpose. */
export function bucket(userId: string, salt: string, purpose: string): number {
  return hash(`${salt}|${purpose}|${userId}`) / 0x100000000;
}

export interface AssignmentOptions {
  salt?: string;
  /** Share of users exposed to any treatment. The rest are control. */
  ramp: number;
  /** When true, everyone resolves to control regardless of ramp. */
  killed?: boolean;
}

export interface Assignment {
  arm: ExperimentArm;
  /** True when the user is inside the ramp, whatever arm they landed in. */
  exposed: boolean;
  /** True when the kill switch, not the ramp, decided this. */
  overridden: boolean;
}

export function assign(userId: string, options: AssignmentOptions): Assignment {
  const salt = options.salt ?? DEFAULT_SALT;

  // The kill switch wins over everything, and does so without changing the
  // underlying assignment -- so when it is lifted, users return to the arms
  // they already had rather than being reshuffled mid-experiment.
  if (options.killed) {
    return { arm: "control", exposed: false, overridden: true };
  }

  // Exposure is a separate hash from arm choice. Because it is a fixed value
  // per user, raising the ramp can only bring more users below the line; it
  // can never move someone who was already below it.
  const exposureRoll = bucket(userId, salt, "exposure");
  if (exposureRoll >= options.ramp) {
    return { arm: "control", exposed: false, overridden: false };
  }

  // Arm choice is independent of the ramp, so a user's arm is fixed from the
  // moment they first qualify.
  //
  // Three equal treatments now that C exists. Adding an arm does move users
  // between A and B compared with the two-arm split -- unavoidable, and
  // harmless before launch, but it is *not* the monotonicity property: that
  // one is about the ramp, the exposure hash is untouched, and nobody already
  // exposed becomes unexposed. The experiment report measures it either way
  // rather than taking this paragraph's word for it.
  const armRoll = bucket(userId, salt, "arm");
  const arm: ExperimentArm =
    armRoll < 1 / 3 ? "treatment_a" : armRoll < 2 / 3 ? "treatment_b" : "treatment_c";
  return { arm, exposed: true, overridden: false };
}

export interface ArmCounts {
  control: number;
  treatment_a: number;
  treatment_b: number;
  treatment_c: number;
  exposed: number;
  total: number;
}

export function tally(userIds: string[], options: AssignmentOptions): ArmCounts {
  const counts: ArmCounts = {
    control: 0,
    treatment_a: 0,
    treatment_b: 0,
    treatment_c: 0,
    exposed: 0,
    total: userIds.length,
  };
  for (const userId of userIds) {
    const result = assign(userId, options);
    counts[result.arm] += 1;
    if (result.exposed) counts.exposed += 1;
  }
  return counts;
}
