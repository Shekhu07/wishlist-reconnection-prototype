import { contextFromQuery, newSessionId, requestFrom, startSession } from "@/state/searchContext";
import { SuppressionStore, queryFamily } from "@/match/suppression";

/**
 * What a session is, and what a search is.
 *
 * `session_id` was `sess_${seq}` and `seq` increments on every search, so the
 * two ideas were the same string. That made "for the remainder of the session"
 * mean "until the next search", which is a live FR-8 violation: dismiss the
 * module, search the same thing again, and it is back. It also made any state
 * keyed on the session -- a resume bar above all -- get thrown away by exactly
 * the journey CR-02 exists to serve.
 *
 * They are separated now. A session lasts as long as the app is open; a search
 * is one query within it. The funnel keeps the per-search id, because that is
 * what makes a funnel a funnel.
 */

describe("session identity", () => {
  it("keeps one session id across many searches", () => {
    const session = newSessionId();
    let context = startSession(session);
    const first = requestFrom(context, "560034");

    context = contextFromQuery("jeans", context, context.seq + 1);
    const second = requestFrom(context, "560034");

    expect(second.session_id).toBe(first.session_id);
    // ...while the search still gets its own identity for the funnel.
    expect(second.search_id).not.toBe(first.search_id);
  });

  it("gives different sessions different ids", () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });

  it("keeps a dismissal dismissed across a later search", () => {
    // The behaviour FR-8 asks for and the old key could not deliver. Before
    // the split, the second search produced a new session id and the store
    // looked the dismissal up under a key nothing had ever written.
    const store = new SuppressionStore();
    const session = newSessionId();
    store.dismiss("u_demo", session, "black blazer", "2026-08-26");

    expect(store.isDismissed("u_demo", session, "black blazer")).toBe(true);
    // Same query family, later in the same session.
    expect(store.isDismissed("u_demo", session, "blazer black")).toBe(true);
    // A different query is untouched: dismissal is a relevance signal about
    // this query family, never a blanket opt-out.
    expect(store.isDismissed("u_demo", session, "jeans")).toBe(false);
  });

  it("does not carry a dismissal into a genuinely new session", () => {
    const store = new SuppressionStore();
    store.dismiss("u_demo", newSessionId(), "black blazer", "2026-08-26");
    expect(store.isDismissed("u_demo", newSessionId(), "black blazer")).toBe(false);
  });

  it("still groups queries into families the same way", () => {
    expect(queryFamily("check shirt")).toBe(queryFamily("shirt check"));
    expect(queryFamily("check shirt")).not.toBe(queryFamily("jeans"));
  });
});
