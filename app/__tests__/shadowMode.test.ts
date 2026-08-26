import { EventLog } from "@/analytics/events";
import { matchExposureRate, shadowOpportunityRate } from "@/analytics/metrics";
import { MatchClient } from "@/match/transport";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

/**
 * Phase 3 (plan S8): matching runs, nothing renders.
 *
 * The distinction that matters is between "found nothing" and "found something
 * and withheld it". If shadow mode short-circuited before matching, the run
 * would be cheap and would measure nothing at all -- which is the failure mode
 * worth testing for.
 */

const request = {
  query: "mark taylor shirt",
  modality: "text" as const,
  filters: {},
  delivery_pincode: "560034",
  session_id: "s1",
};

function client(shadowMode: boolean, events: EventLog) {
  return new MatchClient({
    catalog: makeCatalog(),
    wishlist: makeWishlist(),
    latencyMs: 5,
    shadowMode,
    events,
  });
}

describe("shadow mode (E9 / plan S8)", () => {
  it("renders nothing to the user", async () => {
    const events = new EventLog();
    const response = await client(true, events).requestMatch(request, true);
    expect(response.matches).toHaveLength(0);
  });

  it("still does the matching work and logs the full scoring detail", async () => {
    const events = new EventLog();
    await client(true, events).requestMatch(request, true);
    const evaluated = events.ofType("match_evaluated");
    expect(evaluated).toHaveLength(1);
    // The candidate is recorded even though the user never saw it.
    expect(evaluated[0].candidates).toHaveLength(1);
    expect(evaluated[0].candidates[0].confidence).toBeGreaterThan(0);
    expect(evaluated[0].rendered).toBe(false);
    expect(evaluated[0].shadow).toBe(true);
  });

  it("emits no render event, so exposure and opportunity diverge", async () => {
    const events = new EventLog();
    await client(true, events).requestMatch(request, true);
    expect(events.ofType("module_rendered")).toHaveLength(0);

    // This divergence is the whole instrument: exposure is zero because
    // nothing rendered, while opportunity shows what the launch would produce.
    expect(matchExposureRate(events.all()).value).toBeNull();
    expect(shadowOpportunityRate(events.all()).value).toBe(1);
  });

  it("renders and reports an exposure once shadow mode is off", async () => {
    const events = new EventLog();
    const response = await client(false, events).requestMatch(request, true);
    expect(response.matches).toHaveLength(1);
    expect(events.ofType("module_rendered")).toHaveLength(1);
    expect(events.ofType("match_evaluated")[0].rendered).toBe(true);
  });

  it("logs a miss as an evaluation with no candidates, not as silence", async () => {
    const events = new EventLog();
    await client(true, events).requestMatch({ ...request, query: "formal blazer" }, true);
    const evaluated = events.ofType("match_evaluated");
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0].candidates).toHaveLength(0);
    expect(shadowOpportunityRate(events.all()).value).toBe(0);
  });

  it("attributes an unauthenticated evaluation to nobody", async () => {
    const events = new EventLog();
    await client(true, events).requestMatch(request, false);
    const evaluated = events.ofType("match_evaluated");
    expect(evaluated[0].user_id).toBe("anonymous");
    expect(evaluated[0].candidates).toHaveLength(0);
  });
});
