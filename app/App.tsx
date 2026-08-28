import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
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
  type ConfidenceEventName,
  type ExperimentArm,
} from "@/analytics/events";
import { PreferenceStore } from "@/preferences/store";
import {
  addToBag,
  wouldDuplicate,
  type Bag,
  type CommerceState,
  type Orders,
  type SavedForLater,
} from "@/commerce/reconcile";
import { RAMP_STEPS } from "@/experiment/assignment";
import { ExperimentFlag } from "@/experiment/flags";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";
import { BagScreen } from "@/screens/BagScreen";
import { CompareScreen } from "@/screens/CompareScreen";
import { BrowseScreen } from "@/screens/BrowseScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { WhySheet } from "@/components/WishlistModule/WhySheet";
import { SearchEntryScreen } from "@/screens/SearchEntryScreen";
import { FRAME_MAX_WIDTH, SearchResultsScreen } from "@/screens/SearchResultsScreen";
import { StubScreen } from "@/screens/StubScreen";
import { StateSwitcher } from "@/harness/StateSwitcher";
import { AppShell } from "@/shell/AppShell";
import { HarnessPill } from "@/shell/HarnessPill";
import { pop, push, rootFor, switchTab, top, type Nav } from "@/shell/nav";
import { useSyncedHistory } from "@/shell/useSyncedHistory";
import { color, space, type } from "@/design/tokens";
import { useWishlistMatch, type SuppressionReason } from "@/state/useWishlistMatch";
import {
  contextFromQuery,
  contextFromScenario,
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
  const [context, setContext] = useState<SearchContext>(() =>
    contextFromScenario(scenarios[1] ?? scenarios[0], 1)
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

  const activeItem =
    screen.name === "saved" || screen.name === "compare"
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

  // Recomputed on every visit, because the whole point is that it may now
  // disagree with what the module rendered. stockVersion and pincode are
  // dependencies for exactly that reason.
  const revalidation = useMemo(
    () => (activeItem ? revalidate(activeItem, catalog, inventory, pincode) : null),
    [activeItem, inventory, pincode, stockVersion]
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
        sheet={
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
        }
        harness={
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
          setContext((prev) => contextFromScenario(next, prev.seq + 1));
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
        }
      >
      <View style={styles.frame}>
        {(screen.name === "home") ? (
          <HomeScreen
            catalog={catalog}
            onOpenSearch={() => setNav(push(nav, { name: "searchEntry" }))}
            onSelectCategory={() =>
              setNav(
                push(nav, {
                  name: "stub",
                  reason: "Browsing by category is not in this prototype.",
                })
              )
            }
            onSelectTile={() =>
              setNav(
                push(nav, {
                  name: "stub",
                  reason: "Opening a product from Home is not in this prototype.",
                })
              )
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
            onClearRecents={() => setRecents([])}
            onBack={() => setNav((prev) => pop(prev))}
            onNotImplemented={() => setToast("Not available in this prototype.")}
          />
        ) : screen.name === "bag" ? (
          <BagScreen catalog={catalog} commerce={commerce} />
        ) : (screen.name === "saved" || screen.name === "compare") && activeItem && revalidation ? (
          screen.name === "saved" ? (
            <SavedProductScreen
              result={revalidation}
              pincode={pincode}
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
              parent={revalidation.parent}
              colourway={revalidation.colourway}
              query={context.query}
              pincode={pincode}
              inventory={inventory}
              onBack={goBack}
              onChoose={(productId) =>
                productId === activeItem.product_id
                  ? setNav((prev) => push(prev, { name: "saved", itemId: activeItem.item_id }))
                  : setToast("Opening an alternative is outside the reconnection flow")
              }
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
            onWhy={() => {
              setWhyOpen(true);
              const item = firstMatchItem;
              if (!item) return;
              events.emit({
                type: "confidence_interaction",
                ts: catalog.today,
                user_id: wishlist.user_id,
                session_id: request.session_id,
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
              setNav((prev) =>
                push(prev, {
                  name: action === "primary" ? "saved" : "compare",
                  itemId: item.item_id,
                })
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
