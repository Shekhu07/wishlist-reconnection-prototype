import scenariosJson from "@/data/scenarios.json";
import type { Scenario } from "@/data/types";
import {
  contextFromQuery,
  contextFromScenario,
  requestFrom,
} from "@/state/searchContext";

const SESSION = "sess_test";

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
    const intent = contextFromScenario(exact, 1, SESSION);
    expect(intent.query).toBe(exact.query);
    expect(intent.source).toBe("scenario");
    expect(intent.authenticated).toBe(exact.authenticated);
  });

  it("keeps the scenario's authentication when the user types", () => {
    // Otherwise a typed search silently logs state 10 back in, and C-6 stops
    // being observable from the search box.
    const typed = contextFromQuery("nike shoes", contextFromScenario(loggedOut, 1, SESSION), 2);
    expect(typed.authenticated).toBe(false);
    expect(typed.source).toBe("user");
  });

  it("drops the scenario's staged filters when the user types", () => {
    const staged = contextFromScenario(exact, 1, SESSION);
    const typed = contextFromQuery("kurta", staged, 2);
    expect(typed.filters).toBeUndefined();
  });

  it("gives every search its own id, inside one session", () => {
    // This test used to assert that every search got a new *session* id, which
    // was the defect written down as a requirement: it made "hidden for this
    // session" last exactly one query, contradicting FR-8, and would have
    // discarded a resumable comparison the moment the user searched again.
    const a = requestFrom(contextFromScenario(exact, 1, SESSION), "560034");
    const b = requestFrom(
      contextFromQuery("jeans", contextFromScenario(exact, 1, SESSION), 2),
      "560034"
    );
    expect(a.session_id).toBe(b.session_id);
    expect(a.search_id).not.toBe(b.search_id);
  });
});
