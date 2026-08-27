import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { pathFor, type Nav } from "./nav";

/**
 * Browser back is a swipe people make without thinking. A prototype that
 * exits to the previous site when they do has lost the session, and on a
 * phone that is the end of the test.
 *
 * Native is a no-op: there is no history stack to mirror.
 */
export function useSyncedHistory(
  nav: Nav,
  query: string,
  onPopState: (nav: Nav) => void
) {
  const latest = useRef(nav);
  latest.current = nav;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;
    const handler = (event: PopStateEvent) => {
      const state = event.state as { nav?: Nav } | null;
      if (state?.nav) onPopState(state.nav);
    };
    window.addEventListener("popstate", handler);
    window.history.replaceState({ nav: latest.current }, "", pathFor(latest.current, query));
    return () => window.removeEventListener("popstate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const path = pathFor(nav, query);
    if (window.location.pathname + window.location.search === path) return;
    window.history.pushState({ nav }, "", path);
  }, [nav, query]);
}
