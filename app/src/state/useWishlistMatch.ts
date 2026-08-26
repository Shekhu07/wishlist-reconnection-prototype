import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchRequest, MatchResponse } from "@/match/contract";
import type { MatchClient } from "@/match/transport";

/**
 * Owns the render rule from section 4.5.
 *
 * There is no skeleton placeholder: a skeleton that resolves to nothing both
 * teases the user and shifts the grid. So the module renders only if the match
 * resolves before the grid's first paint, or within `graceMs` of it and the
 * user has not yet scrolled. Anything later is suppressed for that query and
 * recorded as a latency miss rather than being allowed to push the grid down.
 */

export const RENDER_GRACE_MS = 400;

export interface LatencyMiss {
  query: string;
  resolvedAfterMs: number;
  reason: "too_late" | "user_scrolled";
}

/** Why the module is not on screen, for the harness to display. */
export type SuppressionReason =
  | "timed_out"
  | "breaker_open"
  | "dismissed"
  | "too_late"
  | "user_scrolled"
  | null;

export interface UseWishlistMatchResult {
  response: MatchResponse | null;
  latencyMisses: LatencyMiss[];
  /** Populated only while the module is absent for a reason worth explaining. */
  suppressionReason: SuppressionReason;
  noteScroll: () => void;
  dismiss: () => void;
  undo: () => void;
  rerun: () => void;
}

export function useWishlistMatch(
  client: MatchClient,
  request: MatchRequest,
  authenticated: boolean,
  graceMs: number = RENDER_GRACE_MS
): UseWishlistMatchResult {
  const [response, setResponse] = useState<MatchResponse | null>(null);
  const [latencyMisses, setLatencyMisses] = useState<LatencyMiss[]>([]);
  const [suppressionReason, setSuppressionReason] = useState<SuppressionReason>(null);
  const [nonce, setNonce] = useState(0);
  const scrolledRef = useRef(false);
  const paintedAtRef = useRef(0);

  const key = `${request.query}|${request.session_id}|${authenticated}|${nonce}`;

  useEffect(() => {
    let cancelled = false;
    scrolledRef.current = false;
    paintedAtRef.current = Date.now();
    setResponse(null);
    setSuppressionReason(null);

    client.requestMatch(request, authenticated).then((result) => {
      if (cancelled) return;
      const elapsed = Date.now() - paintedAtRef.current;

      if (result.matches.length > 0) {
        if (scrolledRef.current) {
          setLatencyMisses((prev) => [
            ...prev,
            { query: request.query, resolvedAfterMs: elapsed, reason: "user_scrolled" },
          ]);
          setSuppressionReason("user_scrolled");
          setResponse({ ...result, matches: [] });
          return;
        }
        if (elapsed > graceMs) {
          setLatencyMisses((prev) => [
            ...prev,
            { query: request.query, resolvedAfterMs: elapsed, reason: "too_late" },
          ]);
          setSuppressionReason("too_late");
          setResponse({ ...result, matches: [] });
          return;
        }
      } else {
        // With a 250 ms hard timeout and a 400 ms grace, a slow match is cut
        // off by the timeout long before the render rule can apply. The
        // researcher still needs to know why the module vanished, so the
        // reason comes from the shadow record rather than being inferred.
        const record = client.shadow[client.shadow.length - 1];
        if (record?.timedOut) setSuppressionReason("timed_out");
        else if (record?.breakerOpen) setSuppressionReason("breaker_open");
        else if (result.suppressed) setSuppressionReason("dismissed");
      }
      setResponse(result);
    });

    return () => {
      cancelled = true;
    };
    // `key` collapses the request identity; request is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client, graceMs]);

  const noteScroll = useCallback(() => {
    scrolledRef.current = true;
  }, []);

  const dismiss = useCallback(() => {
    client.dismiss(request);
  }, [client, request]);

  const undo = useCallback(() => {
    client.undo(request);
  }, [client, request]);

  const rerun = useCallback(() => setNonce((n) => n + 1), []);

  return { response, latencyMisses, suppressionReason, noteScroll, dismiss, undo, rerun };
}
