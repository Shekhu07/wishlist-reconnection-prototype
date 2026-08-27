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
  /** Increments per search. session_id derives from it, so the funnel counts
   *  searches rather than scenario selections. */
  seq: number;
}

export function contextFromScenario(scenario: Scenario, seq: number): SearchContext {
  return {
    query: scenario.query,
    modality: scenario.modality,
    filters: scenario.filters as MatchRequest["filters"],
    authenticated: scenario.authenticated,
    source: "scenario",
    seq,
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
  };
}

export function requestFrom(context: SearchContext, pincode: string): MatchRequest {
  return {
    query: context.query,
    modality: context.modality,
    // MatchRequest.filters is required; an unstaged search has none to apply.
    filters: context.filters ?? {},
    delivery_pincode: pincode,
    session_id: `sess_${context.seq}`,
  };
}
