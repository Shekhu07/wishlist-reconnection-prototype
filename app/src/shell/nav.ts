import { CATEGORIES, type CategoryKey } from "@/search/catalogBrowse";

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
  /** A home category circle: Fashion, Beauty, Kids, Footwear, ... */
  | { name: "category"; key: CategoryKey }
  /** Everything the user saved, opened from the heart on the home header. */
  | { name: "wishlist" }
  /** The account screen, opened from the person icon on the home header. */
  | { name: "profile" }
  /** Checkout, reached from the bag. */
  | { name: "checkout" }
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
    case "category":
      return `/category/${screen.key}`;
    case "wishlist":
      return "/wishlist";
    case "profile":
      return "/profile";
    case "checkout":
      return "/checkout";
    case "stub":
      return "/soon";
  }
}

/**
 * The inverse of pathFor, for a page loaded fresh -- a reload, a shared
 * link, a bookmark. Without this, useSyncedHistory only ever *wrote* the
 * URL, so any entry that didn't come through an in-app tap silently landed
 * on Home with the rest of the path discarded and no error.
 *
 * Returns null for anything it doesn't recognise (including "/soon", which
 * pathFor never actually reproduces since it drops the reason string) so
 * the caller can fall back to Home exactly as before -- unparseable is not
 * the same failure as "home", so it stays distinct here rather than
 * defaulting silently.
 */
export function navFromPath(pathname: string, search: string): { nav: Nav; query: string } | null {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(search).get("q") ?? "";
  const home: Screen = { name: "home" };
  const onHome = (screen: Screen): Nav => ({ tab: "home", stack: [home, screen] });

  if (segments.length === 0) {
    return { nav: { tab: "home", stack: [home] }, query: "" };
  }

  switch (segments[0]) {
    case "search":
      return segments.length === 1
        ? { nav: onHome({ name: "searchEntry" }), query: "" }
        : null;

    case "results":
      return { nav: onHome({ name: "results" }), query };

    case "saved":
      return segments.length === 2
        ? { nav: onHome({ name: "saved", itemId: segments[1] }), query: "" }
        : null;

    case "compare": {
      if (segments.length === 2) {
        return {
          nav: { tab: "home", stack: [home, { name: "compare", itemId: segments[1] }] },
          query: "",
        };
      }
      if (segments.length === 4 && segments[2] === "option") {
        const productId = Number(segments[3]);
        if (!Number.isFinite(productId)) return null;
        return {
          nav: {
            tab: "home",
            stack: [
              home,
              { name: "compare", itemId: segments[1] },
              { name: "alternative", itemId: segments[1], productId },
            ],
          },
          query: "",
        };
      }
      return null;
    }

    case "product": {
      if (segments.length !== 2) return null;
      const productId = Number(segments[1]);
      return Number.isFinite(productId)
        ? { nav: onHome({ name: "product", productId }), query: "" }
        : null;
    }

    case "bag":
      return segments.length === 1
        ? { nav: { tab: "bag", stack: [{ name: "bag" }] }, query: "" }
        : null;

    case "browse": {
      if (segments.length !== 2) return null;
      if (segments[1] !== "under999" && segments[1] !== "luxury") return null;
      const tab = segments[1] as Tab;
      return { nav: { tab, stack: [rootFor(tab)] }, query: "" };
    }

    case "category": {
      if (segments.length !== 2) return null;
      const key = segments[1];
      const known = CATEGORIES.some((c) => c.key === key);
      return known ? { nav: onHome({ name: "category", key: key as CategoryKey }), query: "" } : null;
    }

    case "wishlist":
      return segments.length === 1 ? { nav: onHome({ name: "wishlist" }), query: "" } : null;

    case "profile":
      return segments.length === 1 ? { nav: onHome({ name: "profile" }), query: "" } : null;

    case "checkout":
      return segments.length === 1
        ? { nav: { tab: "bag", stack: [{ name: "bag" }, { name: "checkout" }] }, query: "" }
        : null;

    default:
      return null;
  }
}
