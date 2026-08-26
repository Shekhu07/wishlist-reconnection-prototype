import type { AnalyticsEvent, ExperimentArm } from "@/analytics/events";
import { assign, DEFAULT_SALT, RAMP_STEPS, type Assignment } from "./assignment";
import {
  DEFAULT_THRESHOLDS,
  anyBreached,
  evaluateGuardrails,
  type GuardrailReading,
  type GuardrailThresholds,
} from "./guardrails";

/**
 * E10: the flag, the ramp, and the kill switch, in one place.
 *
 * The plan puts this in GrowthBook. What GrowthBook actually provides is a
 * small state machine plus a discipline about who is allowed to change what,
 * and that is what this is: the ramp only moves on a deliberate call, the kill
 * switch moves on its own, and only a human can undo it.
 */

export interface ExperimentState {
  salt: string;
  rampIndex: number;
  killed: boolean;
  killedReason: string | null;
  killedAt: string | null;
}

export interface RampEvent {
  at: string;
  from: number;
  to: number;
  reason: string;
}

export class ExperimentFlag {
  private state: ExperimentState;
  readonly history: RampEvent[] = [];
  private lastReadings: GuardrailReading[] = [];

  constructor(
    private readonly thresholds: GuardrailThresholds = DEFAULT_THRESHOLDS,
    salt: string = DEFAULT_SALT
  ) {
    this.state = { salt, rampIndex: 0, killed: false, killedReason: null, killedAt: null };
  }

  get ramp(): number {
    return RAMP_STEPS[this.state.rampIndex];
  }

  get killed(): boolean {
    return this.state.killed;
  }

  get killedReason(): string | null {
    return this.state.killedReason;
  }

  get readings(): GuardrailReading[] {
    return this.lastReadings;
  }

  get atFullRamp(): boolean {
    return this.state.rampIndex >= RAMP_STEPS.length - 1;
  }

  armFor(userId: string): Assignment {
    return assign(userId, {
      salt: this.state.salt,
      ramp: this.ramp,
      killed: this.state.killed,
    });
  }

  /** Convenience for callers that only need the arm. */
  arm(userId: string): ExperimentArm {
    return this.armFor(userId).arm;
  }

  /**
   * Advance one step. Refuses while killed: resuming a ramp on a treatment
   * that already tripped a guardrail is the one thing the switch exists to
   * prevent, and it should take a deliberate `clearKill` to get there.
   */
  advance(at: string, reason = "scheduled ramp step"): boolean {
    if (this.state.killed) return false;
    if (this.atFullRamp) return false;
    const from = this.ramp;
    this.state = { ...this.state, rampIndex: this.state.rampIndex + 1 };
    this.history.push({ at, from, to: this.ramp, reason });
    return true;
  }

  /**
   * Evaluate the guardrails and trip the switch if any has breached.
   *
   * Returns true when this call caused the kill. Section 7 requires the flip
   * to happen "without waiting for a human", so the decision lives here rather
   * than in an alert someone has to read.
   */
  check(events: readonly AnalyticsEvent[], at: string): boolean {
    this.lastReadings = evaluateGuardrails(events, this.thresholds);
    if (this.state.killed) return false;
    if (!anyBreached(this.lastReadings)) return false;

    const breached = this.lastReadings.filter((reading) => reading.breached);
    this.state = {
      ...this.state,
      killed: true,
      killedAt: at,
      killedReason: breached.map((reading) => `${reading.label}: ${reading.detail}`).join("; "),
    };
    this.history.push({
      at,
      from: this.ramp,
      to: 0,
      reason: `kill switch — ${this.state.killedReason}`,
    });
    return true;
  }

  /**
   * Deliberate, human-only. The switch is sticky by design: a treatment that
   * recovers on its own would otherwise flap in and out of the population,
   * which is worse for users and for the data than either state alone.
   */
  clearKill(at: string, by: string): void {
    if (!this.state.killed) return;
    this.state = { ...this.state, killed: false, killedReason: null, killedAt: null };
    this.history.push({ at, from: 0, to: this.ramp, reason: `kill cleared by ${by}` });
  }

  snapshot(): ExperimentState {
    return { ...this.state };
  }
}
