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
import { EventLog, type ExperimentArm } from "@/analytics/events";
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
import { CompareScreen } from "@/screens/CompareScreen";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { FRAME_MAX_WIDTH, SearchResultsScreen } from "@/screens/SearchResultsScreen";
import { StateSwitcher } from "@/harness/StateSwitcher";
import { color, space, type } from "@/design/tokens";
import { useWishlistMatch, type SuppressionReason } from "@/state/useWishlistMatch";
import {
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

/**
 * A three-screen stack rather than a router: search, the saved product, and
 * compare. It stays this small on purpose -- the E5 gate is that search
 * context survives back-navigation, and the surest way to guarantee that is
 * for search never to unmount its state in the first place.
 */
type Route =
  | { name: "search" }
  | { name: "saved"; itemId: string }
  | { name: "compare"; itemId: string };

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(scenarios[1] ?? scenarios[0]);
  const [seq, setSeq] = useState(1);
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
  const [route, setRoute] = useState<Route>({ name: "search" });
  const [pincode, setPincode] = useState(wishlist.pincode);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  // Stock lives outside React, so a change has to be announced to re-render.
  const [stockVersion, setStockVersion] = useState(0);

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

  const activeItem =
    route.name === "search"
      ? undefined
      : wishlist.items.find((candidate) => candidate.item_id === route.itemId);

  // Recomputed on every visit, because the whole point is that it may now
  // disagree with what the module rendered. stockVersion and pincode are
  // dependencies for exactly that reason.
  const revalidation = useMemo(
    () => (activeItem ? revalidate(activeItem, catalog, inventory, pincode) : null),
    [activeItem, inventory, pincode, stockVersion]
  );

  /** Re-run the current match without charging it to the user's daily cap. */
  const restage = useCallback(() => {
    client.suppression.resetImpressions();
    rerun();
  }, [client, rerun]);

  const goBack = useCallback(() => {
    setRoute({ name: "search" });
    setSelectedSize(null);
  }, []);

  const noteStockChange = () => setStockVersion((version) => version + 1);

  const firstMatchItem = response?.matches.length
    ? itemFor(response.matches[0].sku)
    : undefined;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <StateSwitcher
        scenarios={scenarios}
        activeId={scenario.id}
        onSelect={(next) => {
          client.suppression.reset();
          setScenario(next);
          setSeq((n) => n + 1);
          setContext(contextFromScenario(next, seq + 1));
          goBack();
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

      <View style={styles.frame}>
        {route.name === "search" || !activeItem || !revalidation ? (
          <SearchResultsScreen
            catalog={catalog}
            query={context.query}
            matchResponse={response}
            onDismiss={() => {
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
              setToast("Dismissal logged as a relevance signal");
            }}
            onUndo={undo}
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
              setRoute(
                action === "primary"
                  ? { name: "saved", itemId: item.item_id }
                  : { name: "compare", itemId: item.item_id }
              );
            }}
            swapFills={swapFills}
          />
        ) : route.name === "saved" ? (
          <SavedProductScreen
            result={revalidation}
            pincode={pincode}
            selectedSize={selectedSize ?? activeItem.size}
            onBack={goBack}
            onChooseSize={setSelectedSize}
            onMoveToBag={() => {
              const size = selectedSize ?? activeItem.size;
              const duplicate = wouldDuplicate(activeItem, commerce);
              // FR-11: never silently stack a second copy of something the
              // module has just told the user is already in their bag.
              if (!duplicate) addToBag(activeItem, size, commerce);
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
              setToast(
                duplicate
                  ? "Already in your Bag — not added twice"
                  : `Moved to Bag: ${activeItem.colour} · ${size}, revalidated at the boundary`
              );
              restage();
            }}
            onRecoveryPrimary={() => {
              if (revalidation.blocking === "variant_unavailable") {
                const available = revalidation.current.sizesInStock[0];
                if (available) {
                  setSelectedSize(available);
                  return setToast(`Size ${available} selected. Your saved size is unchanged.`);
                }
                return setRoute({ name: "compare", itemId: activeItem.item_id });
              }
              if (revalidation.blocking === "product_unavailable") {
                return setRoute({ name: "compare", itemId: activeItem.item_id });
              }
              setToast("Pick a different delivery pincode in the harness bar above");
            }}
            onRecoverySecondary={() => {
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
                ? setRoute({ name: "saved", itemId: activeItem.item_id })
                : setToast("Opening an alternative is outside the reconnection flow")
            }
          />
        )}
      </View>

      {route.name === "search" && suppressionReason ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{SUPPRESSION_COPY[suppressionReason]}</Text>
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
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
