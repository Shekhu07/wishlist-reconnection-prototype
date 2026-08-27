import scenariosJson from "@/data/scenarios.json";
import type { Scenario } from "@/data/types";
import {
  contextFromQuery,
  contextFromScenario,
  requestFrom,
} from "@/state/searchContext";

const scenarios = scenariosJson as unknown as Scenario[];
const loggedOut = scenarios.find((s) => s.id === "state_10_logged_out")!;
const exact = scenarios.find((s) => s.id === "state_2_one_exact")!;

/**
 * The query had one owner (the scenario) and is about to have two. Both write
 * the same MatchRequest fields, and the failure mode is invisible on screen
 * and visible only as a corrupt event log -- which is what section 7's whole
 * funnel is computed from.
 */
describe("SearchContext", () => {
  it("takes everything from a scenario when the harness drives", () => {
    const intent = contextFromScenario(exact, 1);
    expect(intent.query).toBe(exact.query);
    expect(intent.source).toBe("scenario");
    expect(intent.authenticated).toBe(exact.authenticated);
  });

  it("keeps the scenario's authentication when the user types", () => {
    // Otherwise a typed search silently logs state 10 back in, and C-6 stops
    // being observable from the search box.
    const typed = contextFromQuery("nike shoes", contextFromScenario(loggedOut, 1), 2);
    expect(typed.authenticated).toBe(false);
    expect(typed.source).toBe("user");
  });

  it("drops the scenario's staged filters when the user types", () => {
    const staged = contextFromScenario(exact, 1);
    const typed = contextFromQuery("kurta", staged, 2);
    expect(typed.filters).toBeUndefined();
  });

  it("gives every search its own session id", () => {
    const a = requestFrom(contextFromScenario(exact, 1), "560034");
    const b = requestFrom(contextFromQuery("jeans", contextFromScenario(exact, 1), 2), "560034");
    expect(a.session_id).not.toBe(b.session_id);
  });
});
