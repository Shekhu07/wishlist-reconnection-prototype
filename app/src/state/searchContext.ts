import type { MatchRequest, Modality } from "@/match/contract";
import type { Scenario } from "@/data/types";

/**
 * Who owns the query.
 *
 * It was scenario.query, full stop: the scenario carried query, modality,
 * filters and authentication into MatchRequest, and session_id was derived
 * from the scenario id. A live search field is a second writer of the same
 * fields. Unified here so there is exactly one path into MatchRequest.
 */
export interface SearchContext {
  query: string;
  modality: Modality;
  filters?: MatchRequest["filters"];
  authenticated: boolean;
  source: "scenario" | "user";
  /**
   * Increments per search. `search_id` derives from it, so the funnel counts
   * searches rather than scenario selections.
   */
  seq: number;
  /**
   * Stable for as long as the app is open, and deliberately *not* derived from
   * `seq`.
   *
   * These were one string, which quietly made a session last exactly one
   * search. Suppression is keyed per (user x query-family x session x day), so
   * "hidden for this session" survived only until the user typed again -- FR-8
   * asks for the remainder of the session, not the remainder of the query. The
   * same collision would throw away a resumable comparison at the moment the
   * user goes back to Search, which is the entire journey CR-02 exists for.
   */
  sessionId: string;
}

let sessionCounter = 0;

/** A new session. One per app launch, not one per search. */
export function newSessionId(): string {
  sessionCounter += 1;
  return `sess_${Date.now().toString(36)}_${sessionCounter}`;
}

/** The context a freshly opened app starts from. */
export function startSession(sessionId: string): SearchContext {
  return {
    query: "",
    modality: "text",
    authenticated: true,
    source: "user",
    seq: 0,
    sessionId,
  };
}

export function contextFromScenario(
  scenario: Scenario,
  seq: number,
  sessionId: string
): SearchContext {
  return {
    query: scenario.query,
    modality: scenario.modality,
    filters: scenario.filters as MatchRequest["filters"],
    authenticated: scenario.authenticated,
    source: "scenario",
    seq,
    sessionId,
  };
}

export function contextFromQuery(
  query: string,
  previous: SearchContext,
  seq: number
): SearchContext {
  return {
    query,
    // Modality and authentication describe the session, not the query, so a
    // typed search inside state 10 is still logged out.
    modality: previous.modality,
    authenticated: previous.authenticated,
    // Filters staged a state. The user asking for something else is not that
    // state any more.
    filters: undefined,
    source: "user",
    seq,
    // The session is the thing the user is in; typing again does not end it.
    sessionId: previous.sessionId,
  };
}

export function requestFrom(context: SearchContext, pincode: string): MatchRequest {
  return {
    query: context.query,
    modality: context.modality,
    // MatchRequest.filters is required; an unstaged search has none to apply.
    filters: context.filters ?? {},
    delivery_pincode: pincode,
    session_id: context.sessionId,
    // Kept distinct so the funnel can still count searches. Conflating the two
    // is what made a session one query long.
    search_id: `search_${context.seq}`,
  };
}
