export type Tab = "home" | "search" | "under999" | "luxury" | "bag";

export type Screen =
  | { name: "home" }
  | { name: "searchEntry" }
  | { name: "results" }
  | { name: "saved"; itemId: string }
  | { name: "compare"; itemId: string }
  /** An alternative opened from the comparison. Not a saved item. */
  | { name: "alternative"; itemId: string; productId: number }
  /** An ordinary catalog product, opened from Search, Home or a pairing. */
  | { name: "product"; productId: number }
  | { name: "bag" }
  | { name: "browse"; filter: "under999" | "luxury" }
  | { name: "stub"; reason: string };

export interface Nav {
  tab: Tab;
  /** Never empty. stack[0] is the tab root. */
  stack: Screen[];
}

export function rootFor(tab: Tab): Screen {
  switch (tab) {
    case "home":
      return { name: "home" };
    case "search":
      return { name: "searchEntry" };
    case "bag":
      return { name: "bag" };
    case "under999":
      return { name: "browse", filter: "under999" };
    case "luxury":
      return { name: "browse", filter: "luxury" };
  }
}

export function top(nav: Nav): Screen {
  return nav.stack[nav.stack.length - 1];
}

export function push(nav: Nav, screen: Screen): Nav {
  return { tab: nav.tab, stack: [...nav.stack, screen] };
}

/** Popping the root is a no-op: a tab always has somewhere to be. */
export function pop(nav: Nav): Nav {
  if (nav.stack.length <= 1) return nav;
  return { tab: nav.tab, stack: nav.stack.slice(0, -1) };
}

export function switchTab(nav: Nav, tab: Tab): Nav {
  return { tab, stack: [rootFor(tab)] };
}

export function pathFor(nav: Nav, query: string): string {
  const screen = top(nav);
  switch (screen.name) {
    case "home":
      return "/";
    case "searchEntry":
      return "/search";
    case "results":
      return `/results?q=${encodeURIComponent(query)}`;
    case "saved":
      return `/saved/${screen.itemId}`;
    case "compare":
      return `/compare/${screen.itemId}`;
    case "alternative":
      return `/compare/${screen.itemId}/option/${screen.productId}`;
    case "product":
      return `/product/${screen.productId}`;
    case "bag":
      return "/bag";
    case "browse":
      return `/browse/${screen.filter}`;
    case "stub":
      return "/soon";
  }
}
