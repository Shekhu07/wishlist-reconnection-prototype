import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import bagJson from "@/data/bag.json";
import catalogJson from "@/data/catalog.json";
import ordersJson from "@/data/orders.json";
import savedForLaterJson from "@/data/saved-for-later.json";
import scenariosJson from "@/data/scenarios.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Scenario, Wishlist } from "@/data/types";
import type { MatchRequest } from "@/match/contract";
import { MatchClient } from "@/match/transport";
import {
  EventLog,
  type CompareEventName,
  type ConfidenceEventName,
  type PairingEventName,
  type ExperimentArm,
} from "@/analytics/events";
import { PreferenceStore } from "@/preferences/store";
import {
  addToBag,
  addAlternativeToBag,
  wouldDuplicate,
  type Bag,
  type CommerceState,
  type Orders,
  type SavedForLater,
} from "@/commerce/reconcile";
import { destinationFor, type Match } from "@/match/contract";
import { RAMP_STEPS } from "@/experiment/assignment";
import { ExperimentFlag } from "@/experiment/flags";
import { InventorySimulator } from "@/revalidation/inventory";
import { deliveryDateFor, revalidate, servesPincode } from "@/revalidation/revalidate";
import {
  ComparisonStore,
  changesSince,
  describeSession,
  findProduct,
} from "@/state/comparisonSession";
import { TagStore, surfacedCopy, type IntentTag } from "@/wishlist/tags";
import { completeTheLook } from "@/wishlist/lookCompletion";
import { LookStrip } from "@/components/LookStrip";
import { LOOK_HEADING_PDP } from "@/copy/bundle";
import { ResumeBar } from "@/components/ResumeBar";
import { ResumeSheet } from "@/components/ResumeSheet";
import { BagScreen, bagTotal } from "@/screens/BagScreen";
import { CheckoutScreen } from "@/screens/CheckoutScreen";
import { CompareScreen } from "@/screens/CompareScreen";
import { BrowseScreen } from "@/screens/BrowseScreen";
import { CategoryScreen } from "@/screens/CategoryScreen";
import { WishlistScreen } from "@/screens/WishlistScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { AlternativeProductScreen } from "@/screens/AlternativeProductScreen";
import { ProductScreen } from "@/screens/ProductScreen";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { WhySheet } from "@/components/WishlistModule/WhySheet";
import { COMPARISON_KEPT, RETURN_TO_COMPARISON, START_FRESH_DONE } from "@/copy/bundle";
import { SearchEntryScreen } from "@/screens/SearchEntryScreen";
import { FRAME_MAX_WIDTH, SearchResultsScreen } from "@/screens/SearchResultsScreen";
import { StubScreen } from "@/screens/StubScreen";
import { StateSwitcher } from "@/harness/StateSwitcher";
import { resolveHarnessEnabled } from "@/harness/enabled";
import { wishlistSurfaceVisible } from "@/experiment/surfaces";
import { AppShell } from "@/shell/AppShell";
import { HarnessPill } from "@/shell/HarnessPill";
import { pop, push, rootFor, switchTab, top, type Nav } from "@/shell/nav";
import { useSyncedHistory } from "@/shell/useSyncedHistory";
import { color, radius, space, type } from "@/design/tokens";
import { useWishlistMatch, type SuppressionReason } from "@/state/useWishlistMatch";
import {
  contextFromQuery,
  contextFromScenario,
  newSessionId,
  requestFrom,
  type SearchContext,
} from "@/state/searchContext";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;
const scenarios = scenariosJson as unknown as Scenario[];

/**
 * Bag, Save for Later and order history as their own records. The module's
 * duplicate labels are derived from these rather than asserted by the wishlist
 * item, which is what lets them go stale correctly (E14 / FR-11).
 */
const initialCommerce: CommerceState = {
  bag: bagJson as unknown as Bag,
  savedForLater: savedForLaterJson as unknown as SavedForLater,
  orders: ordersJson as unknown as Orders,
};

/**
 * A synthetic breach for the kill-switch drill: control converts, the treatment
 * barely does. In production the same `flag.check` runs against live events and
 * needs nobody to press anything.
 */
const BREACHING_EVENTS = [
  ...Array.from({ length: 600 }, (_, i) => ({
    event_id: `drill_${i}`,
    type: "search_performed" as const,
    ts: "2026-08-26",
    user_id: `drill_${i}`,
    session_id: `drill_s${i}`,
    search_id: "search_1",
    arm: (i % 2 === 0 ? "control" : "treatment_b") as ExperimentArm,
    query: "shirt",
    modality: "text" as const,
    result_count: 10,
  })),
  ...Array.from({ length: 120 }, (_, i) => ({
    event_id: `drill_order_${i}`,
    type: "order_placed" as const,
    ts: "2026-08-26",
    user_id: `drill_${i * 2}`,
    session_id: `drill_s${i * 2}`,
    search_id: "search_1",
    arm: "control" as ExperimentArm,
    skus: ["sku"],
    saved_skus: [] as string[],
    via_wishlist_module: false,
  })),
];

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(scenarios[1] ?? scenarios[0]);
  // context.seq is the single source of truth for the sequence number --
  // there is no separate counter to keep in sync. The next value is always
  // derived from the current context, read via the functional setState form
  // so a typed search's contextFromQuery bump (Tasks 7/9/10) can never be
  // raced by a stale closure here.
  // One session for as long as the app is open. Not derived from seq: that
  // conflation is what made "for the remainder of the session" mean "until the
  // next search", and it would throw away a resumable comparison at exactly
  // the moment CR-02 needs one.
  const sessionId = useRef(newSessionId()).current;
  // Session-scoped, like suppression: in memory, Redis-shaped key, cleared
  // with the session rather than persisted (wireframes section 11).
  const comparisons = useRef(new ComparisonStore()).current;
  // Improvement 7: runtime, because data/wishlist.json is generated and must
  // not be hand-edited. Seeded empty -- a tag exists only if someone wrote it.
  const tagStore = useRef(new TagStore()).current;
  const [context, setContext] = useState<SearchContext>(() =>
    contextFromScenario(scenarios[1] ?? scenarios[0], 1, sessionId)
  );
  const [latencyMs, setLatencyMs] = useState(60);
  const [swapFills, setSwapFills] = useState(false);
  const [showWishlistInSearch, setShowWishlistInSearch] = useState(true);
  const [shadowMode, setShadowMode] = useState(false);
  const [arm, setArm] = useState<ExperimentArm>("treatment_b");
  const [flagVersion, setFlagVersion] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({ tab: "home", stack: [rootFor("home")] });
  const [harnessOpen, setHarnessOpen] = useState(false);
  // Resolved once per mount, not per render: the answer depends on the URL the
  // researcher arrived on, and the app rewrites that URL as it navigates.
  const [harnessOn] = useState(resolveHarnessEnabled);
  // DC-02 lives in the shell's sheet slot, not in the module: an overlay
  // rendered inside the module is clipped to the module.
  const [whyOpen, setWhyOpen] = useState(false);
  // Bumped to make the module take its own dismissal path when the hide was
  // raised from the DC-02 sheet rather than from the close box.
  const [externalDismiss, setExternalDismiss] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [pincode, setPincode] = useState(wishlist.pincode);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  // DC-06. Null means "the colour they saved", which is what the screen opens
  // on -- the saved variant is the default, never a replacement for it.
  const [selectedColour, setSelectedColour] = useState<string | null>(null);
  // Improvement 3's post-add confirmation, which replaces the Move to Bag
  // button rather than flashing past as a toast.
  const [added, setAdded] = useState<"added" | "duplicate" | null>(null);
  // The alternative-product screen's own selection and confirmation. Kept
  // apart from the saved item's: they are different products and conflating
  // their state is how a size chosen for one leaks onto the other.
  const [altSize, setAltSize] = useState<string | null>(null);
  const [altAdded, setAltAdded] = useState(false);
  // Improvement 5 is explicit that this is not shown to every user by default.
  // Until treatment_c exists it lives behind the harness, off, so it is never
  // a third co-equal action competing with Buy and Compare (FR-5).
  const [helpMeDecide, setHelpMeDecide] = useState(false);
  // Improvements 7, 9 and 10, all later-phase and all off unless asked for.
  const [tagsOn, setTagsOn] = useState(false);
  const [lookCompletion, setLookCompletion] = useState(false);
  // Write-only on purpose. The tag store lives outside React, so the setter is
  // the re-render; the values themselves are read inline during render rather
  // than through a memo, so nothing needs to depend on this. Same reason
  // stockVersion and bagVersion exist, minus the memo.
  const [, setTagVersion] = useState(0);
  const [resumeOpen, setResumeOpen] = useState(false);
  // Bumped when the comparison session mutates, because the store lives
  // outside React -- same pattern as stockVersion and bagVersion.
  const [comparisonVersion, setComparisonVersion] = useState(0);
  // Improvement 3, step 8: the query survives a return from the saved product
  // via SearchContext, but the scroll position did not -- the results screen
  // unmounts on navigation and remounts at the top. Held here so it outlives
  // the unmount, and reset per search, because a new query is a new page.
  const resultsOffset = useRef(0);
  // Stock lives outside React, so a change has to be announced to re-render.
  const [stockVersion, setStockVersion] = useState(0);
  // commerce.bag.items is mutated in place by addToBag, which is imperative,
  // not React state, so nothing re-renders when the bag changes unless
  // something forces it -- same pattern as stockVersion above.
  const [bagVersion, setBagVersion] = useState(0);
  // Checkout's terminal state. Reset by Continue Shopping, so a second order
  // is placeable in the same session.
  const [orderPlaced, setOrderPlaced] = useState(false);

  // One client and one inventory for the session. Suppression, frequency caps,
  // the breaker and live stock are all session state; rebuilding either per
  // render would erase them.
  // The section 7 stream. One log for the session, so a researcher can see the
  // pipeline filling up as they drive the harness.
  const events = useMemo(() => new EventLog(), []);
  const commerce = useMemo<CommerceState>(
    () => ({
      bag: { items: [...initialCommerce.bag.items] },
      savedForLater: { items: [...initialCommerce.savedForLater.items] },
      orders: { orders: [...initialCommerce.orders.orders] },
    }),
    []
  );
  // One preference store for the session: the per-item hide is durable, so
  // rebuilding it per render would make it exactly the session-scoped thing
  // FR-8 says dismissal already is.
  const preferences = useMemo(() => new PreferenceStore(), []);
  const client = useMemo(
    () => new MatchClient({ catalog, wishlist, events, commerce, preferences }),
    [events, commerce, preferences]
  );
  // The flag owns the ramp and the kill switch. The harness overrides the arm
  // directly so a researcher can see each treatment without waiting to be
  // bucketed into it.
  const flag = useMemo(() => new ExperimentFlag(), []);
  const note = useCallback(() => setEventCount(events.size), [events]);
  const inventory = useMemo(() => new InventorySimulator(catalog), []);

  const request: MatchRequest = useMemo(
    () => requestFrom(context, pincode),
    [context, pincode]
  );

  const { response, suppressionReason, dismiss, undo, rerun } = useWishlistMatch(
    client,
    request,
    context.authenticated
  );

  // Skip the first pass: on mount the match has already run once, and firing a
  // second one here spent an impression against the per-item daily cap before
  // the researcher had touched anything.
  const latencyMounted = useRef(false);
  useEffect(() => {
    client.latencyMs = latencyMs;
    if (!latencyMounted.current) {
      latencyMounted.current = true;
      return;
    }
    restage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latencyMs]);

  // State 9 is the post-dismissal view, so the harness dismisses on entry
  // rather than asking the researcher to perform it first.
  useEffect(() => {
    if (!scenario.dismissFirst) return;
    client.dismiss(request);
    rerun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.seq]);

  // Section 7's search funnel. Emitted per search -- keyed on context.seq
  // rather than scenario.id so a typed search (or re-picking the same
  // scenario) still logs, instead of being silently dropped from the funnel.
  useEffect(() => {
    // A new query is a new page, so the remembered scroll position does not
    // carry across it -- restoring one search's offset onto another's results
    // would land the user somewhere arbitrary.
    resultsOffset.current = 0;
    events.emit({
      type: "search_performed",
      ts: catalog.today,
      user_id: wishlist.user_id,
      session_id: `sess_${context.seq}`,
      search_id: "search_1",
      arm: client.arm,
      query: context.query,
      modality: context.modality,
      result_count: 0,
    });
    note();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.seq]);

  // MatchClient writes match_evaluated and module_rendered straight to the log
  // without going through React, so the counter has to be refreshed whenever a
  // match resolves. Without this it freezes and reads as a broken pipeline.
  useEffect(() => {
    note();
  }, [response, note]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const itemFor = useCallback(
    (sku: string) => wishlist.items.find((candidate) => candidate.sku === sku),
    []
  );

  const screen = top(nav);

  // The alternative screen carries the same itemId, because an alternative is
  // only meaningful relative to the saved item it is being compared against --
  // and CR-04 has to know which comparison to return to.
  const activeItem =
    screen.name === "saved" || screen.name === "compare" || screen.name === "alternative"
      ? wishlist.items.find((candidate) => candidate.item_id === screen.itemId)
      : undefined;

  /**
   * The E5 recovery telemetry.
   *
   * `variant_recovery_shown` and `variant_recovery_resolved` were declared in
   * events.ts and consumed by section 7's variantRecoveryRate, but nothing in
   * the app ever emitted either -- only the simulator did. The metric therefore
   * read entirely off synthetic data while looking like it measured the
   * product. It now measures the product.
   */
  const emitRecoveryResolved = useCallback(
    (resolvedBy: "other_size" | "other_colour" | "changed_address" | "abandoned") => {
      if (!activeItem) return;
      events.emit({
        type: "variant_recovery_resolved",
        ts: catalog.today,
        user_id: wishlist.user_id,
        session_id: request.session_id,
        search_id: "search_1",
        arm: client.arm,
        sku: activeItem.sku,
        resolved_by: resolvedBy,
      });
      note();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItem, client.arm, request.session_id]
  );

  /**
   * One definition of "the user dismissed the module".
   *
   * FR-8 makes dismissal a relevance signal, and section 7 reads the dismissal
   * rate off it -- so a second entry point that suppressed without logging
   * would silently deflate the metric rather than obviously break it.
   */
  const dismissModule = useCallback(
    (toast: string) => {
      dismiss();
      events.emit({
        type: "module_dismissed",
        ts: catalog.today,
        user_id: wishlist.user_id,
        session_id: request.session_id,
        search_id: "search_1",
        arm: client.arm,
        query_family: client.familyOf(context.query),
        skus: response?.matches.map((m) => m.sku) ?? [],
      });
      note();
      setToast(toast);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dismiss, client, context.query, request.session_id, response]
  );

  /**
   * The typeahead's saved group.
   *
   * Goes through the same MatchClient as the module, so it inherits the auth
   * gate, the suppression rules, the frequency caps, the circuit breaker and
   * the 250 ms fail-open. If it does not resolve, `typeaheadSaved` stays empty
   * and the dropdown simply shows organic suggestions -- which is C-3 applied
   * to the surface where latency is most visible, between two keystrokes.
   */
  const pairingReported = useRef(new Set<string>());

  const [typeaheadQuery, setTypeaheadQuery] = useState("");
  const [typeaheadSaved, setTypeaheadSaved] = useState<Match[]>([]);

  useEffect(() => {
    const query = typeaheadQuery.trim();
    if (query.length < 2) {
      setTypeaheadSaved([]);
      return undefined;
    }
    let live = true;
    // Debounced, because a match call per keystroke would burn the frequency
    // cap on typing rather than on searching.
    const timer = setTimeout(() => {
      client
        .requestMatch(
          { ...requestFrom(context, pincode), query },
          context.authenticated
        )
        .then((response) => {
          if (live) setTypeaheadSaved(response.matches.slice(0, 2));
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeaheadQuery, pincode]);

  /**
   * The product the look-completion strip pairs against on Search: whatever the
   * module surfaced, not a category guessed from the query string.
   */
  const lookSeed = useMemo(() => {
    const sku = response?.matches[0]?.sku;
    const item = sku ? itemFor(sku) : undefined;
    if (!item) return null;
    const parent = catalog.parents.find(
      (candidate) => candidate.parent_product_id === item.parent_product_id
    );
    const colourway = parent?.colourways.find(
      (candidate) => candidate.product_id === item.product_id
    );
    return parent && colourway ? { parent, colourway } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  /**
   * The pairing surfaces.
   *
   * Emitted, not merely declared. An event type that nothing sends is the
   * defect this session already fixed once, in variant_recovery: the metric
   * looked healthy because a simulator filled it in while the product sent
   * nothing at all.
   */
  const emitPairing = useCallback(
    (
      name: PairingEventName,
      detail: {
        product_id?: number;
        from_saved_group?: boolean;
        suggestion_count?: number;
        via?: "search" | "pairing" | "home";
      } = {}
    ) => {
      events.emit({
        type: "pairing_interaction",
        ts: catalog.today,
        user_id: wishlist.user_id,
        session_id: sessionId,
        search_id: `search_${context.seq}`,
        arm: client.arm,
        name,
        ...detail,
      });
      note();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.arm, context.seq, sessionId]
  );

  /** The comparison's interactions, including re-entry (wireframes section 21). */
  const emitCompare = useCallback(
    (name: CompareEventName, sku: string, extra: { priority?: string; chosen_sku?: string } = {}) => {
      events.emit({
        type: "compare_interaction",
        ts: catalog.today,
        user_id: wishlist.user_id,
        session_id: sessionId,
        search_id: `search_${context.seq}`,
        arm: client.arm,
        sku,
        name,
        ...extra,
      });
      note();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.arm, context.seq, sessionId]
  );

  /** The confidence layer's interactions (wireframes section 21). */
  const emitConfidence = useCallback(
    (
      name: ConfidenceEventName,
      detail: { signal_type?: string; changed?: "size" | "colour"; to?: string }
    ) => {
      if (!activeItem) return;
      events.emit({
        type: "confidence_interaction",
        ts: catalog.today,
        user_id: wishlist.user_id,
        session_id: request.session_id,
        search_id: "search_1",
        arm: client.arm,
        sku: activeItem.sku,
        name,
        ...detail,
      });
      note();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItem, client.arm, request.session_id]
  );

  /**
   * The live comparison, and what has moved under it.
   *
   * Both derived on every render, never stored. E14's lesson applied before it
   * bites twice: caching a staleness flag reproduces exactly the staleness the
   * flag exists to detect. The session pins which items were compared; whether
   * they are still available is a question for right now.
   */
  const comparison = comparisons.current(sessionId);
  const comparisonItem = comparison
    ? wishlist.items.find((candidate) => candidate.item_id === comparison.savedItemId)
    : undefined;
  const comparisonChanges = useMemo(
    () =>
      comparison && comparisonItem
        ? changesSince(comparison, catalog, inventory, pincode, comparisonItem.size)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comparison, comparisonItem, pincode, stockVersion, comparisonVersion]
  );

  // CR-05. Emitted once per (comparison, change set) so the rate counts
  // occasions the catalog moved under a user, not renders.
  const staleReported = useRef(new Set<string>());
  useEffect(() => {
    if (!comparison || !comparisonItem || comparisonChanges.length === 0) return;
    const key = `${comparison.comparisonId}|${comparisonChanges
      .map((change) => `${change.productId}:${change.kind}`)
      .sort()
      .join(",")}`;
    if (staleReported.current.has(key)) return;
    staleReported.current.add(key);
    emitCompare("comparison_stale_state_shown", comparisonItem.sku, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison?.comparisonId, comparisonChanges]);

  // Recomputed on every visit, because the whole point is that it may now
  // disagree with what the module rendered. stockVersion and pincode are
  // dependencies for exactly that reason.
  const revalidation = useMemo(
    () => (activeItem ? revalidate(activeItem, catalog, inventory, pincode) : null),
    [activeItem, inventory, pincode, stockVersion]
  );

  // Every saved item, for the Wishlist screen. Deliberately the same
  // revalidate() the detail screen runs, against the same inventory and the
  // same pincode -- so a row and the screen it opens cannot disagree, and both
  // stay advisory until the binding read at the action boundary.
  const wishlistResults = useMemo(
    () =>
      wishlist.items
        .map((item) => revalidate(item, catalog, inventory, pincode))
        .filter((result): result is NonNullable<typeof result> => result !== null),
    [inventory, pincode, stockVersion]
  );

  // The other half of the pair: emitted when a blocking state actually renders,
  // once per (item, reason), so the rate has a denominator that is not the
  // number of times React re-rendered.
  const recoveryShown = useRef(new Set<string>());
  useEffect(() => {
    const reason = revalidation?.blocking;
    if (!activeItem || !reason) return;
    const key = `${activeItem.sku}|${reason}`;
    if (recoveryShown.current.has(key)) return;
    recoveryShown.current.add(key);
    events.emit({
      type: "variant_recovery_shown",
      ts: catalog.today,
      user_id: wishlist.user_id,
      session_id: request.session_id,
      search_id: "search_1",
      arm: client.arm,
      sku: activeItem.sku,
      reason,
    });
    note();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.sku, revalidation?.blocking]);

  /** Re-run the current match without charging it to the user's daily cap. */
  const restage = useCallback(() => {
    client.suppression.resetImpressions();
    rerun();
  }, [client, rerun]);

  const goBack = useCallback(() => {
    setNav((prev) => pop(prev));
    setSelectedSize(null);
    setSelectedColour(null);
    setAdded(null);
  }, []);

  // Picking a scenario from the harness has to land on its results
  // regardless of where the nav stack currently is -- pop() only goes up one
  // level, which isn't reliably "results" once Home is a real screen the
  // stack can sit under. This resets the stack to the same shape the real
  // home -> search -> submit path produces, on the home tab -- "search" is
  // the bottom nav's unrelated "From 30 min" tab, and landing there would
  // have BottomNav highlight the wrong destination while results are shown.
  const resetToResults = useCallback(() => {
    setNav({
      tab: "home",
      stack: [rootFor("home"), { name: "searchEntry" }, { name: "results" }],
    });
    setSelectedSize(null);
    setSelectedColour(null);
    setAdded(null);
  }, []);

  const noteStockChange = () => setStockVersion((version) => version + 1);

  const firstMatchItem = response?.matches.length
    ? itemFor(response.matches[0].sku)
    : undefined;

  const bagCount = useMemo(
    () => commerce.bag.items.reduce((sum, line) => sum + line.quantity, 0),
    [commerce, bagVersion]
  );

  useSyncedHistory(nav, context.query, setNav);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <AppShell
        nav={nav}
        bagCount={bagCount}
        onTab={(tab) =>
          setNav(
            tab === "search"
              ? { tab, stack: [{ name: "stub", reason: "Delivery in 30 minutes is not in this prototype." }] }
              : switchTab(nav, tab)
          )
        }
        onBack={() => setNav(pop(nav))}
        onOpenSearch={() => setNav(push(nav, { name: "searchEntry" }))}
        onOpenWishlist={() => setNav(push(nav, { name: "wishlist" }))}
        onOpenProfile={() => setNav(push(nav, { name: "profile" }))}
        wishlistCount={wishlist.items.length}
        sheet={
          <>
          {comparison && comparisonItem ? (
            <ResumeSheet
              open={resumeOpen}
              query={comparison.query}
              count={comparison.productIds.length}
              detail={describeSession(comparison, comparisonItem).detail}
              changes={comparisonChanges}
              nameFor={(productId) => {
                const found = findProduct(catalog, productId);
                // Colour included, for the same reason the trade-off labels
                // carry it: several colourways of one product can be compared
                // at once, and three identical lines saying "no longer
                // available" tell the user nothing about which is which.
                return found
                  ? `${found.parent.brand} ${found.colourway.display_name} · ${found.colourway.colour}`
                  : "An item";
              }}
              onClose={() => setResumeOpen(false)}
              onResume={() => {
                setResumeOpen(false);
                if (comparisonChanges.length) {
                  emitCompare("comparison_change_reviewed", comparisonItem.sku, {});
                }
                emitCompare("comparison_reentry_opened", comparisonItem.sku);
                setNav((prev) =>
                  push(prev, { name: "compare", itemId: comparisonItem.item_id })
                );
              }}
              onStartFresh={() => {
                setResumeOpen(false);
                comparisons.startFresh(sessionId);
                setComparisonVersion((v) => v + 1);
                emitCompare("comparison_start_fresh_clicked", comparisonItem.sku);
                setToast(START_FRESH_DONE);
              }}
            />
          ) : null}
          <WhySheet
            open={whyOpen}
            onClose={() => setWhyOpen(false)}
            onViewItem={() => {
              setWhyOpen(false);
              const item = firstMatchItem;
              if (item) setNav((prev) => push(prev, { name: "saved", itemId: item.item_id }));
            }}
            onHideForSearch={() => {
              setWhyOpen(false);
              // The same relevance signal as the close box, not a quieter one:
              // section 7's dismissal rate counts both or it counts neither.
              setExternalDismiss((n) => n + 1);
              dismissModule("Hidden for this search — logged as a relevance signal");
            }}
            onHideAlways={() => {
              // Section 4.16's control, enforced service-side rather than in the
              // view -- a preference the UI honours and the service ignores is
              // not a control.
              setWhyOpen(false);
              setShowWishlistInSearch(false);
              client.preferences.showWishlistInSearch = false;
              setToast("Wishlist matches hidden in Search — change it in the harness");
              restage();
            }}
          />
          </>
        }
        harness={
          !harnessOn ? null : (
          <HarnessPill
            stateNumber={scenarios.indexOf(scenario) + 1}
            suppression={suppressionReason}
            open={harnessOpen}
            onToggle={() => setHarnessOpen((v) => !v)}
          >
          <StateSwitcher
        scenarios={scenarios}
        activeId={scenario.id}
        onSelect={(next) => {
          client.suppression.reset();
          setScenario(next);
          setContext((prev) => contextFromScenario(next, prev.seq + 1, sessionId));
          resetToResults();
        }}
        latencyMs={latencyMs}
        onLatencyChange={setLatencyMs}
        swapFills={swapFills}
        onSwapFills={setSwapFills}
        note={scenario.note}
        pincode={pincode}
        onPincodeChange={setPincode}
        onSellOutSize={() => {
          const target = activeItem ?? firstMatchItem;
          if (!target) return setToast("No saved item in view to sell out");
          inventory.sellOut(target.sku);
          noteStockChange();
          setToast(`Size ${target.size} is now out of stock. Tap Buy from Wishlist.`);
        }}
        helpMeDecide={helpMeDecide}
        onToggleHelpMeDecide={setHelpMeDecide}
        tagsOn={tagsOn}
        onToggleTags={(value) => {
          setTagsOn(value);
          // Seeded on first enable so a researcher sees the state without
          // typing seven tags. Real tags stay whatever the user set.
          if (value && tagStore.taggedCount === 0) {
            tagStore.seedDemo(wishlist.items.slice(0, 3).map((item) => item.item_id));
          }
          setTagVersion((v) => v + 1);
        }}
        lookCompletion={lookCompletion}
        onToggleLookCompletion={setLookCompletion}
        modality={context.modality}
        onModalityChange={(modality) => {
          // A real threshold change, not a label: tau is already per-modality
          // in the contract (C-8), so switching mode genuinely raises the bar.
          setContext((prev) => ({ ...prev, modality, seq: prev.seq + 1 }));
        }}
        onSellOutSizeSilently={() => {
          const target = activeItem ?? firstMatchItem;
          if (!target) return setToast("No saved item in view to sell out");
          // Deliberately no noteStockChange(): the point is to leave the
          // rendered card stale, so the binding read at the tap is what catches
          // it rather than a re-render beating the user to it. Without this,
          // boundaryBlockRate could only ever read zero.
          inventory.sellOut(target.sku);
          setToast("Sold out silently. The card is stale — now tap Move to Bag.");
        }}
        onSellOutProduct={() => {
          const target = activeItem ?? firstMatchItem;
          if (!target) return setToast("No saved item in view to sell out");
          inventory.sellOutProduct(target.parent_product_id);
          noteStockChange();
          setToast("Product withdrawn in every variant. Tap Buy from Wishlist.");
        }}
        onResetStock={() => {
          inventory.reset();
          noteStockChange();
          setToast("Stock reset to the seeded catalog");
        }}
        stockChanged={inventory.changes.length > 0}
        shadowMode={shadowMode}
        onToggleShadowMode={(value) => {
          client.shadowMode = value;
          setShadowMode(value);
          restage();
        }}
        eventCount={eventCount}
        hiddenCount={hiddenCount}
        onUnhideAll={() => {
          preferences.unhideAll();
          setHiddenCount(0);
          setToast("All hidden items restored");
          restage();
        }}
        arm={arm}
        onArmChange={(next) => {
          client.arm = next;
          setArm(next);
          restage();
        }}
        ramp={flag.ramp}
        killed={flag.killed}
        rampSteps={[...RAMP_STEPS]}
        flagVersion={flagVersion}
        onAdvanceRamp={() => {
          const moved = flag.advance(catalog.today);
          setFlagVersion((version) => version + 1);
          setToast(
            moved
              ? `Ramp at ${(flag.ramp * 100).toFixed(0)}%`
              : flag.killed
                ? "Killed — clear the switch before ramping again"
                : "Already at the final ramp step"
          );
        }}
        onToggleKill={() => {
          if (flag.killed) {
            flag.clearKill(catalog.today, "researcher");
            setToast("Kill switch cleared — users return to their original arms");
          } else {
            flag.check(BREACHING_EVENTS as never, catalog.today);
            client.arm = "control";
            setArm("control");
            setToast(`Killed: ${flag.killedReason ?? "guardrail breach"}`);
          }
          setFlagVersion((version) => version + 1);
          restage();
        }}
        showWishlistInSearch={showWishlistInSearch}
        onToggleWishlistInSearch={(value) => {
          // Set on the client, not on the view: section 4.16 is enforced
          // server-side, so the toggle has to reach the service.
          client.preferences.showWishlistInSearch = value;
          setShowWishlistInSearch(value);
          restage();
        }}
          />
          </HarnessPill>
          )
        }
      >
      <View style={styles.frame}>
        {(screen.name === "home") ? (
          <HomeScreen
            catalog={catalog}
            onOpenSearch={() => setNav(push(nav, { name: "searchEntry" }))}
            onSelectCategory={(key) => setNav(push(nav, { name: "category", key }))}
            onSelectTile={(tile) => {
              // This used to discard the tile and route to a stub. There is a
              // product screen now.
              setAltSize(null);
              setAltAdded(false);
              setNav((prev) =>
                push(prev, { name: "product", productId: tile.colourway.product_id })
              );
            }}
            onSelectBrand={(brand) => {
              // A brand card is a search for that brand, not a new screen --
              // the results grid already ranks by brand and the wishlist
              // module already knows what to do with a brand query.
              setContext((prev) => contextFromQuery(brand, prev, prev.seq + 1));
              setRecents((prev) => [brand, ...prev.filter((q) => q !== brand)].slice(0, 8));
              setNav((prev) => push(prev, { name: "results" }));
            }}
            // Withheld for control and in shadow mode: a control user who sees
            // a wishlist surface is no longer a control user.
            wishlist={
              wishlistSurfaceVisible(client.arm, shadowMode) && wishlist.items.length > 0
                ? {
                    count: wishlist.items.length,
                    imageId: wishlistResults[0]?.colourway.product_id ?? null,
                    onOpen: () => setNav((prev) => push(prev, { name: "wishlist" })),
                  }
                : undefined
            }
          />
        ) : screen.name === "searchEntry" ? (
          <SearchEntryScreen
            catalog={catalog}
            recents={recents}
            onSubmit={(query) => {
              setContext((prev) => contextFromQuery(query, prev, prev.seq + 1));
              setRecents((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, 8));
              setNav((prev) => push(prev, { name: "results" }));
            }}
            savedSuggestions={typeaheadSaved}
            onQueryChange={setTypeaheadQuery}
            onOpenSaved={(sku) => {
              const item = itemFor(sku);
              if (!item) return;
              // The field that makes the dropdown falsifiable: without it there
              // is no way to tell whether the saved group does any work.
              emitPairing("suggestion_selected", { from_saved_group: true });
              setNav((prev) => push(prev, { name: "saved", itemId: item.item_id }));
            }}
            onOpenProduct={(productId) => {
              setAltSize(null);
              setAltAdded(false);
              emitPairing("suggestion_selected", {
                product_id: productId,
                from_saved_group: false,
              });
              setNav((prev) => push(prev, { name: "product", productId }));
            }}
            onClearRecents={() => setRecents([])}
            onBack={() => setNav((prev) => pop(prev))}
            onNotImplemented={() => setToast("Not available in this prototype.")}
          />
        ) : screen.name === "bag" ? (
          <BagScreen
            catalog={catalog}
            commerce={commerce}
            onCheckout={() => setNav((prev) => push(prev, { name: "checkout" }))}
          />
        ) : screen.name === "checkout" ? (
          <CheckoutScreen
            summary={{
              count: commerce.bag.items.reduce((n, line) => n + line.quantity, 0),
              total: bagTotal(catalog, commerce),
            }}
            placed={orderPlaced}
            pincode={pincode}
            onPlaceOrder={() => {
              // The bag becomes an order rather than simply emptying. E14's
              // duplicate states are derived from order history, so a purchase
              // has to land there or the module will keep offering to buy
              // something the user just bought.
              if (commerce.bag.items.length === 0) return;
              const placedAt = catalog.today;
              commerce.orders.orders = [
                ...commerce.orders.orders,
                {
                  order_id: `ord_${placedAt}_${commerce.orders.orders.length + 1}`,
                  placed_at: placedAt,
                  delivered_at: null,
                  lines: commerce.bag.items.map((line) => {
                    const parent = catalog.parents.find(
                      (p) => p.parent_product_id === line.parent_product_id
                    );
                    const colourway = parent?.colourways.find((c) =>
                      c.skus.some((s) => s.sku === line.sku)
                    );
                    return {
                      sku: line.sku,
                      parent_product_id: line.parent_product_id,
                      size: line.size,
                      colour: line.colour,
                      quantity: line.quantity,
                      price_paid: colourway?.price ?? 0,
                    };
                  }),
                },
              ];
              const skus = commerce.bag.items.map((line) => line.sku);
              const savedSkus = wishlist.items
                .filter((item) => skus.includes(item.sku))
                .map((item) => item.sku);
              commerce.bag.items = [];
              setBagVersion((v) => v + 1);
              setOrderPlaced(true);
              events.emit({
                type: "order_placed",
                ts: placedAt,
                user_id: wishlist.user_id,
                session_id: request.session_id,
                search_id: "search_1",
                arm: client.arm,
                skus,
                saved_skus: savedSkus,
                via_wishlist_module: savedSkus.length > 0,
              });
            }}
            onContinueShopping={() => {
              setOrderPlaced(false);
              setNav({ tab: "home", stack: [rootFor("home")] });
            }}
          />
        ) : screen.name === "product" ? (
          (() => {
            const found = findProduct(catalog, screen.productId);
            if (!found) return <StubScreen reason="That product is no longer in the catalog." />;
            const sizes = inventory.sizesInStock(found.parent, found.colourway.product_id);
            const pairs = completeTheLook(found.parent, found.colourway, {
              catalog,
              wishlist,
              commerce,
              inventory,
            });
            const deliverable = servesPincode(found.colourway.seller, pincode);
            const viewKey = `${found.colourway.product_id}|${pairs.length}`;
            if (!pairingReported.current.has(viewKey)) {
              pairingReported.current.add(viewKey);
              // Fired with the count even when it is zero. "The section never
              // appears" is a finding, and a finding needs a denominator.
              queueMicrotask(() =>
                emitPairing("pairing_section_viewed", {
                  product_id: found.colourway.product_id,
                  suggestion_count: pairs.length,
                })
              );
            }

            return (
              <ProductScreen
                parent={found.parent}
                colourway={found.colourway}
                sizesInStock={sizes}
                deliveryBy={
                  deliverable ? deliveryDateFor(catalog.today, found.colourway.product_id) : null
                }
                selectedSize={altSize ?? sizes[0] ?? null}
                onChooseSize={setAltSize}
                onBack={goBack}
                added={altAdded}
                pairing={
                  // The whole point of the feature, and it renders nothing when
                  // no saved item completes this look.
                  <LookStrip
                    heading={LOOK_HEADING_PDP}
                    note={null}
                    suggestions={pairs}
                    onOpen={(itemId) => {
                      setAltSize(null);
                      setAltAdded(false);
                      emitPairing("pairing_item_opened");
                      setNav((prev) => push(prev, { name: "saved", itemId }));
                    }}
                  />
                }
                onMoveToBag={(size) => {
                  const sku = found.colourway.skus.find((entry) => entry.size === size);
                  if (!sku) return setToast("That size has no listing");
                  const addedNow = addAlternativeToBag(
                    {
                      sku: sku.sku,
                      parent_product_id: found.parent.parent_product_id,
                      size,
                      colour: found.colourway.colour,
                    },
                    commerce
                  );
                  setBagVersion((version) => version + 1);
                  setAltAdded(true);
                  if (!addedNow) setToast("Already in your Bag — not added twice");
                }}
              />
            );
          })()
        ) : screen.name === "alternative" && activeItem ? (
          (() => {
            const alt = catalog.parents
              .flatMap((p) => p.colourways.map((cw) => ({ parent: p, colourway: cw })))
              .find((entry) => entry.colourway.product_id === screen.productId);
            if (!alt) return <StubScreen reason="That option is no longer in the catalog." />;
            const sizes = inventory.sizesInStock(alt.parent, alt.colourway.product_id);
            const deliverable = servesPincode(alt.colourway.seller, pincode);
            return (
              <AlternativeProductScreen
                parent={alt.parent}
                colourway={alt.colourway}
                savedLabel={`${activeItem.colour} · ${activeItem.size}`}
                savedSize={activeItem.size}
                sizesInStock={sizes}
                deliveryBy={
                  deliverable ? deliveryDateFor(catalog.today, alt.colourway.product_id) : null
                }
                contextBar={
                  comparison && comparisonItem ? (
                    <View style={styles.contextBar} testID="comparison-context-bar">
                      <Text style={styles.contextText}>
                        Comparing {comparison.productIds.length} items
                        {comparison.priority ? ` · Priority: ${comparison.priority}` : ""}
                      </Text>
                      <Pressable
                        testID="context-return"
                        accessibilityRole="button"
                        accessibilityLabel={RETURN_TO_COMPARISON}
                        onPress={() => {
                          emitCompare("comparison_reentry_opened", comparisonItem.sku);
                          goBack();
                        }}
                      >
                        <Text style={styles.contextAction}>{RETURN_TO_COMPARISON}</Text>
                      </Pressable>
                    </View>
                  ) : null
                }
                selectedSize={altSize}
                onChooseSize={setAltSize}
                onBack={goBack}
                added={altAdded}
                onMoveToBag={(size) => {
                  const sku = alt.colourway.skus.find((entry) => entry.size === size);
                  if (!sku) return setToast("That size has no listing");
                  const addedNow = addAlternativeToBag(
                    {
                      sku: sku.sku,
                      parent_product_id: alt.parent.parent_product_id,
                      size,
                      colour: alt.colourway.colour,
                    },
                    commerce
                  );
                  setBagVersion((version) => version + 1);
                  events.emit({
                    type: "compare_interaction",
                    ts: catalog.today,
                    user_id: wishlist.user_id,
                    session_id: request.session_id,
                    search_id: "search_1",
                    arm: client.arm,
                    sku: activeItem.sku,
                    name: "move_to_bag_from_comparison",
                    chosen_sku: sku.sku,
                  });
                  note();
                  setAltAdded(true);
                  if (!addedNow) setToast("Already in your Bag — not added twice");
                }}
              />
            );
          })()
        ) : (screen.name === "saved" || screen.name === "compare") && activeItem && revalidation ? (
          screen.name === "saved" ? (
            <SavedProductScreen
              result={revalidation}
              pincode={pincode}
              // Back names where it actually goes. The screen below this one
              // on the stack is the Wishlist when the user came from there.
              backFrom={
                nav.stack[nav.stack.length - 2]?.name === "wishlist" ? "wishlist" : "results"
              }
              selectedSize={selectedSize ?? activeItem.size}
              selectedColour={selectedColour ?? activeItem.colour}
              onBack={goBack}
              onChooseSize={(size) => {
                setSelectedSize(size);
                emitConfidence("saved_variant_changed", { changed: "size", to: size });
              }}
              onChooseColour={(colour) => {
                // Changing colour can invalidate the selected size, and
                // carrying a size that colour does not stock would be the
                // silent substitution FR-7 forbids. Fall back to the saved
                // size and let the size row say what is actually available.
                setSelectedColour(colour);
                setSelectedSize(null);
                emitConfidence("saved_variant_changed", { changed: "colour", to: colour });
              }}
              onConfidenceExpand={() => emitConfidence("confidence_layer_viewed", {})}
              onSignalExpand={(signal) =>
                emitConfidence("confidence_signal_expanded", { signal_type: signal })
              }
              tags={tagsOn ? tagStore.for(activeItem.item_id) : undefined}
              onToggleTag={
                tagsOn
                  ? (tag: IntentTag) => {
                      tagStore.toggle(activeItem.item_id, tag);
                      setTagVersion((v) => v + 1);
                    }
                  : undefined
              }
              added={added}
              onAfterAdd={(next) => {
                setAdded(null);
                if (next === "bag") return setNav((prev) => switchTab(prev, "bag"));
                if (next === "compare") {
                  return setNav((prev) =>
                    push(prev, { name: "compare", itemId: activeItem.item_id })
                  );
                }
                goBack();
              }}
              onMoveToBag={() => {
                const size = selectedSize ?? activeItem.size;
                emitConfidence("move_to_bag_from_confidence", {});
                // The binding read is re-taken here, not trusted from render.
                // Stock can move while the user reads the confidence panel,
                // and improvement 3 asks for a recovery state rather than a
                // generic error when it does.
                const colour = selectedColour ?? activeItem.colour;
                const fresh = revalidate(activeItem, catalog, inventory, pincode);
                const freshColourway =
                  fresh?.parent.colourways.find((c) => c.colour === colour) ?? fresh?.colourway;
                const stillStocked = freshColourway
                  ? (fresh?.sizesByColour[freshColourway.product_id] ?? []).includes(size)
                  : false;
                const attempt = (
                  result: "added" | "duplicate" | "blocked_variant_unavailable"
                ) =>
                  events.emit({
                    type: "move_to_bag_attempted",
                    ts: catalog.today,
                    user_id: wishlist.user_id,
                    session_id: request.session_id,
                    search_id: "search_1",
                    arm: client.arm,
                    sku: activeItem.sku,
                    size,
                    colour,
                    result,
                    revalidation_changed: !stillStocked,
                  });

                if (!stillStocked) {
                  attempt("blocked_variant_unavailable");
                  noteStockChange();
                  note();
                  setToast("That variant sold out while you were deciding — see the recovery state");
                  return;
                }
                const duplicate = wouldDuplicate(activeItem, commerce);
                attempt(duplicate ? "duplicate" : "added");
                // FR-11: never silently stack a second copy of something the
                // module has just told the user is already in their bag.
                if (!duplicate) addToBag(activeItem, size, commerce);
                setBagVersion((version) => version + 1);
                events.emit({
                  type: "moved_to_bag",
                  ts: catalog.today,
                  user_id: wishlist.user_id,
                  session_id: request.session_id,
                  search_id: "search_1",
                  arm: client.arm,
                  sku: activeItem.sku,
                  via_wishlist_module: true,
                  size_deviated: size !== activeItem.size,
                  duplicate,
                });
                note();
                // The confirmation is a surface on the screen now, not a toast:
                // it carries three real next moves and has to outlive 2.6s.
                setAdded(duplicate ? "duplicate" : "added");
                restage();
              }}
              onRecoveryPrimary={() => {
                emitConfidence("confidence_recovery_selected", {});
                if (revalidation.blocking === "variant_unavailable") {
                  const available = revalidation.current.sizesInStock[0];
                  if (available) {
                    setSelectedSize(available);
                    emitRecoveryResolved("other_size");
                    return setToast(`Size ${available} selected. Your saved size is unchanged.`);
                  }
                  emitRecoveryResolved("other_colour");
                  return setNav((prev) => push(prev, { name: "compare", itemId: activeItem.item_id }));
                }
                if (revalidation.blocking === "product_unavailable") {
                  emitRecoveryResolved("other_colour");
                  return setNav((prev) => push(prev, { name: "compare", itemId: activeItem.item_id }));
                }
                emitRecoveryResolved("changed_address");
                setToast("Pick a different delivery pincode in the harness bar above");
              }}
              onRecoverySecondary={() => {
                // Keeping it in the wishlist is a real outcome of the recovery
                // state, not a non-event: section 7's variant recovery rate
                // needs the denominator as much as the numerator.
                emitRecoveryResolved("abandoned");
                setToast(
                  revalidation.blocking === "product_unavailable"
                    ? "Removed from Wishlist"
                    : "Kept in your Wishlist"
                );
                goBack();
              }}
            />
          ) : (
            <CompareScreen
              catalog={catalog}
              item={activeItem}
              onOpened={(productIds) => {
                comparisons.open({
                  sessionId,
                  savedItemId: activeItem.item_id,
                  productIds,
                  query: context.query,
                  filters: context.filters ?? {},
                  pincode,
                  variant: { colour: activeItem.colour, size: activeItem.size },
                  catalog,
                  inventory,
                  savedSize: activeItem.size,
                });
                setComparisonVersion((v) => v + 1);
                emitCompare("compare_view_opened", activeItem.sku);
                emitCompare("comparison_persisted", activeItem.sku);
              }}
              parent={revalidation.parent}
              colourway={revalidation.colourway}
              query={context.query}
              pincode={pincode}
              inventory={inventory}
              onBack={goBack}
              initialPriority={comparison?.priority ?? null}
              onPriority={(priority) => {
                // Persisted, because CR-03 promises to restore it by name and a
                // priority the user chose is the most expensive part of the
                // decision to make them repeat.
                comparisons.setPriority(sessionId, priority);
                setComparisonVersion((v) => v + 1);
                emitCompare("compare_priority_selected", activeItem.sku, {
                  priority: priority ?? undefined,
                });
              }}
              helpMeDecide={helpMeDecide}
              onHelpMeDecide={() => {
                events.emit({
                  type: "compare_interaction",
                  ts: catalog.today,
                  user_id: wishlist.user_id,
                  session_id: request.session_id,
                  search_id: "search_1",
                  arm: client.arm,
                  sku: activeItem.sku,
                  name: "help_me_decide_opened",
                });
                note();
              }}
              onChoose={(productId) => {
                events.emit({
                  type: "compare_interaction",
                  ts: catalog.today,
                  user_id: wishlist.user_id,
                  session_id: request.session_id,
                  search_id: "search_1",
                  arm: client.arm,
                  sku: activeItem.sku,
                  name: "comparison_item_selected",
                  chose_saved: productId === activeItem.product_id,
                });
                note();
                setAltSize(null);
                setAltAdded(false);
                // The comparison used to dead-end on every option but the saved
                // one, which made it a table to read rather than a decision to
                // make -- and left CR-04 nothing to return from.
                setNav((prev) =>
                  productId === activeItem.product_id
                    ? push(prev, { name: "saved", itemId: activeItem.item_id })
                    : push(prev, {
                        name: "alternative",
                        itemId: activeItem.item_id,
                        productId,
                      })
                );
              }}
            />
          )
        ) : screen.name === "browse" ? (
          <BrowseScreen
            catalog={catalog}
            filter={screen.filter}
            onSelectTile={(tile) => {
              setContext((prev) =>
                contextFromQuery(`${tile.parent.brand} ${tile.parent.articleType}`, prev, prev.seq + 1)
              );
              setNav((current) => push(current, { name: "results" }));
            }}
          />
        ) : screen.name === "profile" ? (
          <ProfileScreen
            rows={[
              { key: "orders", label: "My Orders", onOpen: null },
              {
                key: "wishlist",
                label: "Wishlist",
                onOpen: () => setNav((prev) => push(prev, { name: "wishlist" })),
              },
              { key: "addresses", label: "Addresses", onOpen: null },
              { key: "payments", label: "Payment Methods", onOpen: null },
              { key: "help", label: "Help Center", onOpen: null },
              { key: "logout", label: "Logout", onOpen: null },
            ]}
            onStub={(label) =>
              setNav((prev) =>
                push(prev, {
                  name: "stub",
                  reason: `${label} is not in this prototype.`,
                })
              )
            }
          />
        ) : screen.name === "wishlist" ? (
          <WishlistScreen
            results={wishlistResults}
            pincode={pincode}
            onSelectItem={(itemId) => {
              // Reset the variant selection the way every other route into the
              // saved screen does; carrying the last item's size across would
              // preselect something this item may not stock.
              setSelectedSize(null);
              setSelectedColour(null);
              setNav((prev) => push(prev, { name: "saved", itemId }));
            }}
          />
        ) : screen.name === "category" ? (
          <CategoryScreen
            catalog={catalog}
            categoryKey={screen.key}
            onSelectTile={(tile) => {
              // Straight to the product, the way a home tile goes. Browse
              // routes through a search instead; that is Browse's own
              // behaviour and not worth copying into a category grid.
              setAltSize(null);
              setAltAdded(false);
              setNav((prev) =>
                push(prev, { name: "product", productId: tile.colourway.product_id })
              );
            }}
          />
        ) : screen.name === "stub" ? (
          <StubScreen reason={screen.reason} />
        ) : (
          <SearchResultsScreen
            catalog={catalog}
            query={context.query}
            matchResponse={response}
            onDismiss={() => dismissModule("Dismissal logged as a relevance signal")}
            onUndo={undo}
            externalDismiss={externalDismiss}
            scrollOffset={resultsOffset.current}
            onScrollOffset={(offset) => {
              resultsOffset.current = offset;
            }}
            onOpenProduct={(productId) => {
              setAltSize(null);
              setAltAdded(false);
              emitPairing("product_view_opened", { product_id: productId, via: "search" });
              setNav((prev) => push(prev, { name: "product", productId }));
            }}
            intentFor={
              tagsOn
                ? (sku: string) => {
                    const item = itemFor(sku);
                    if (!item) return null;
                    const tag = tagStore.surfacedFor(item.item_id);
                    return tag ? surfacedCopy(tag) : null;
                  }
                : undefined
            }
            lookCompletion={
              lookCompletion && lookSeed ? (
                <LookStrip
                  suggestions={completeTheLook(lookSeed.parent, lookSeed.colourway, {
                    catalog,
                    wishlist,
                    commerce,
                    inventory,
                    // Whatever the module is already showing is not a
                    // suggestion; it is on screen.
                    excludeItemIds:
                      response?.matches.map((m) => itemFor(m.sku)?.item_id ?? "") ?? [],
                  })}
                  onOpen={(itemId) => setNav((prev) => push(prev, { name: "saved", itemId }))}
                />
              ) : null
            }
            resumeBar={
              comparison && comparisonItem && !comparison.barDismissed ? (
                <ResumeBar
                  {...describeSession(comparison, comparisonItem)}
                  changedCount={comparisonChanges.length}
                  onResume={() => {
                    setResumeOpen(true);
                    emitCompare("comparison_resume_clicked", comparisonItem.sku);
                  }}
                  onDismiss={() => {
                    // Hides the bar, keeps the comparison. The wireframes are
                    // explicit that dismissing the offer is not abandoning the
                    // work -- "Start fresh" is the control that does that.
                    comparisons.dismissBar(sessionId);
                    setComparisonVersion((v) => v + 1);
                    emitCompare("comparison_resume_dismissed", comparisonItem.sku);
                    setToast("Comparison kept — reopen it from the module");
                  }}
                />
              ) : null
            }
            onWhy={() => {
              setWhyOpen(true);
              const item = firstMatchItem;
              if (!item) return;
              events.emit({
                type: "confidence_interaction",
                ts: catalog.today,
                user_id: wishlist.user_id,
                session_id: request.session_id,
                search_id: "search_1",
                arm: client.arm,
                sku: item.sku,
                name: "confidence_explanation_opened",
              });
              note();
            }}
            onHideForever={(sku) => {
              const item = itemFor(sku);
              if (!item) return;
              preferences.hide(item.item_id);
              setHiddenCount(preferences.hiddenItemIds.length);
              setToast("Hidden from search — durable, unlike a dismissal");
              restage();
            }}
            onAction={(action, sku) => {
              const item = itemFor(sku);
              if (!item) return setToast("No saved item behind that action");
              events.emit({
                type: "module_action",
                ts: catalog.today,
                user_id: wishlist.user_id,
                session_id: request.session_id,
                search_id: "search_1",
                arm: client.arm,
                action: action === "primary" ? "buy_from_wishlist" : "compare_options",
                sku,
              });
              // E16: the evidence is recorded whatever the experiment is
              // doing. Acting on it is what waits.
              preferences.recordAction(
                action === "primary" ? "buy_from_wishlist" : "compare_options"
              );
              note();
              // Treatment A is reconnection without variant continuity: the
              // module still remembers, but the Buy path opens the product the
              // way any other listing would, without carrying the saved size
              // through. B minus A is what isolates the mechanism.
              //
              // Null will not do it -- the screen falls back to the saved size,
              // which makes A and B identical.
              if (arm === "treatment_a") {
                const parent = catalog.parents.find(
                  (candidate) => candidate.parent_product_id === item.parent_product_id
                );
                const colourway = parent?.colourways.find(
                  (candidate) => candidate.product_id === item.product_id
                );
                const firstStocked = colourway?.skus.find((sku) =>
                  inventory.isInStock(sku.sku)
                );
                setSelectedSize(firstStocked?.size ?? parent?.sizes[0] ?? item.size);
              } else {
                setSelectedSize(item.size);
              }
              // Route by what the button *says*, not by which side it is on.
              //
              // The module's copy varies with the item's state -- "View Bag",
              // "Reorder", "View Save for Later" -- while the routing was
              // positional, so "View Bag" opened the product page. Every one
              // of those is a button that cannot do what it says, which is the
              // exact failure the no-dead-end-Buy rule exists to prevent; the
              // copy test asserts the label and the nav test asserts the
              // destination, and nothing asserted that they agree.
              const destination = destinationFor(
                response?.matches.find((m) => m.sku === sku)?.copy_key,
                action
              );
              if (destination === "bag") return setNav((prev) => switchTab(prev, "bag"));
              if (destination === "unbuilt") {
                return setNav((prev) =>
                  push(prev, {
                    name: "stub",
                    reason:
                      "Save for Later and order history are outside this prototype's scope.",
                  })
                );
              }
              setNav((prev) =>
                push(prev, { name: destination, itemId: item.item_id })
              );
            }}
            swapFills={swapFills}
          />
        )}
      </View>

      {screen.name === "results" && suppressionReason ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{SUPPRESSION_COPY[suppressionReason]}</Text>
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
      </AppShell>
    </SafeAreaView>
  );
}

/**
 * Harness-only explanations. These never reach a participant -- they exist so
 * a researcher can tell an intentional suppression from a broken build.
 */
const SUPPRESSION_COPY: Record<NonNullable<SuppressionReason>, string> = {
  timed_out:
    "Match exceeded the 250 ms hard timeout, so it failed open to empty. Search rendered untouched.",
  breaker_open:
    "Circuit breaker is open after a sustained timeout rate. The match call was not attempted.",
  dismissed: "Dismissed for this query family and session. Search rendered untouched.",
  too_late:
    "Match resolved after the 400 ms render grace. Suppressed rather than shifting the grid.",
  user_scrolled:
    "Match resolved after the user had already scrolled. Suppressed rather than moving content.",
  frequency_cap:
    "The item already had its two allowed impressions today. The match ran and found it -- this is the per-item daily cap doing its job, not a broken build.",
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  // The target is a phone. On a laptop the web build would otherwise stretch
  // the two-column grid to full width and render each product card enormous,
  // which tells a researcher nothing about the real layout.
  frame: { flex: 1, width: "100%", maxWidth: FRAME_MAX_WIDTH, alignSelf: "center" },
  // CR-04: a compact context bar that must not obscure the product's own CTA,
  // so it sits at the top of the screen rather than floating over the button.
  contextBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    backgroundColor: color.surfaceMuted,
  },
  contextText: { fontSize: 11, fontWeight: "500", color: color.textSecondary, flex: 1 },
  contextAction: { fontSize: 12, fontWeight: "700", color: color.brandPink },
  footer: {
    padding: space.md,
    backgroundColor: "#FFF6E5",
    borderTopWidth: 1,
    borderTopColor: "#F0DFC0",
  },
  footerText: { ...type.chip, color: "#7A5A1E", lineHeight: 16 },
  toast: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    backgroundColor: "#1A1B22",
    borderRadius: 8,
    padding: space.md,
  },
  toastText: { ...type.body, color: color.surface },
});
