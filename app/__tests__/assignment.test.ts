import { RAMP_STEPS, assign, bucket, tally } from "@/experiment/assignment";

const users = Array.from({ length: 20_000 }, (_, i) => `u_${i}`);

/**
 * The two properties the experiment rests on. Both fail silently: a reshuffling
 * ramp and a drifting assignment each produce a perfectly normal-looking run
 * whose numbers mean nothing.
 */
describe("experiment assignment (E10)", () => {
  it("gives a user the same arm every time", () => {
    for (const userId of users.slice(0, 500)) {
      const first = assign(userId, { ramp: 0.5 });
      for (let i = 0; i < 5; i += 1) {
        expect(assign(userId, { ramp: 0.5 })).toEqual(first);
      }
    }
  });

  it("never moves an assigned user when the ramp increases", () => {
    // The property that makes a staged ramp valid. Without it, every ramp step
    // silently restarts the experiment.
    let previous = new Map(users.map((u) => [u, assign(u, { ramp: RAMP_STEPS[1] })]));
    for (const ramp of RAMP_STEPS.slice(2)) {
      const current = new Map(users.map((u) => [u, assign(u, { ramp })]));
      for (const [userId, before] of previous) {
        if (!before.exposed) continue;
        const after = current.get(userId)!;
        expect(after.exposed).toBe(true);
        expect(after.arm).toBe(before.arm);
      }
      previous = current;
    }
  });

  it("exposes approximately the ramp share", () => {
    for (const ramp of [0.01, 0.05, 0.2, 0.5]) {
      const counts = tally(users, { ramp });
      const observed = counts.exposed / counts.total;
      // Three standard errors at n = 20,000.
      const tolerance = 3 * Math.sqrt((ramp * (1 - ramp)) / users.length);
      expect(Math.abs(observed - ramp)).toBeLessThan(tolerance + 0.002);
    }
  });

  it("splits the exposed population evenly between the two treatments", () => {
    const counts = tally(users, { ramp: 0.5 });
    const split = counts.treatment_a / (counts.treatment_a + counts.treatment_b);
    expect(split).toBeGreaterThan(0.47);
    expect(split).toBeLessThan(0.53);
  });

  it("puts everyone in control at a zero ramp", () => {
    const counts = tally(users.slice(0, 2000), { ramp: 0 });
    expect(counts.control).toBe(2000);
    expect(counts.exposed).toBe(0);
  });

  it("sends everyone to control when killed, whatever the ramp", () => {
    for (const userId of users.slice(0, 1000)) {
      const killed = assign(userId, { ramp: 1, killed: true });
      expect(killed.arm).toBe("control");
      expect(killed.overridden).toBe(true);
    }
  });

  it("restores the original arms when the kill switch is lifted", () => {
    // The switch overrides the answer without rewriting it, so a recovered
    // experiment continues rather than restarting.
    for (const userId of users.slice(0, 1000)) {
      const before = assign(userId, { ramp: 0.5 });
      assign(userId, { ramp: 0.5, killed: true });
      expect(assign(userId, { ramp: 0.5 })).toEqual(before);
    }
  });

  it("reshuffles completely under a different salt", () => {
    // A new salt is how you start a genuinely new experiment rather than
    // silently continuing the old one.
    const sample = users.slice(0, 3000);
    const before = sample.map((u) => assign(u, { ramp: 0.5 }).arm);
    const after = sample.map((u) => assign(u, { ramp: 0.5, salt: "different" }).arm);
    const identical = before.filter((arm, i) => arm === after[i]).length;
    expect(identical / sample.length).toBeLessThan(0.75);
  });

  it("spreads buckets across the unit interval", () => {
    const values = users.slice(0, 5000).map((u) => bucket(u, "s", "exposure"));
    const deciles = new Array(10).fill(0);
    for (const value of values) deciles[Math.min(9, Math.floor(value * 10))] += 1;
    for (const count of deciles) expect(count).toBeGreaterThan(350);
  });
});
