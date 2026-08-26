import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import catalogJson from "@/data/catalog.json";
import scenariosJson from "@/data/scenarios.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Scenario, Wishlist } from "@/data/types";
import type { MatchRequest } from "@/match/contract";
import { MatchClient } from "@/match/transport";
import { EventLog } from "@/analytics/events";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";
import { CompareScreen } from "@/screens/CompareScreen";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { FRAME_MAX_WIDTH, SearchResultsScreen } from "@/screens/SearchResultsScreen";
import { StateSwitcher } from "@/harness/StateSwitcher";
import { color, space, type } from "@/design/tokens";
import { useWishlistMatch, type SuppressionReason } from "@/state/useWishlistMatch";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;
const scenarios = scenariosJson as unknown as Scenario[];

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
  const [latencyMs, setLatencyMs] = useState(60);
  const [swapFills, setSwapFills] = useState(false);
  const [showWishlistInSearch, setShowWishlistInSearch] = useState(true);
  const [shadowMode, setShadowMode] = useState(false);
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
  const client = useMemo(() => new MatchClient({ catalog, wishlist, events }), [events]);
  const note = useCallback(() => setEventCount(events.size), [events]);
  const inventory = useMemo(() => new InventorySimulator(catalog), []);

  const request: MatchRequest = useMemo(
    () => ({
      query: scenario.query,
      modality: scenario.modality,
      filters: scenario.filters as MatchRequest["filters"],
      delivery_pincode: pincode,
      session_id: `sess_${scenario.id}`,
    }),
    [scenario, pincode]
  );

  const { response, suppressionReason, dismiss, undo, rerun } = useWishlistMatch(
    client,
    request,
    scenario.authenticated
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
  }, [scenario.id]);

  // Section 7's search funnel. Emitted per view of a scenario, which is what a
  // search is in this harness.
  useEffect(() => {
    events.emit({
      type: "search_performed",
      ts: catalog.today,
      user_id: wishlist.user_id,
      session_id: `sess_${scenario.id}`,
      arm: client.arm,
      query: scenario.query,
      modality: scenario.modality,
      result_count: 0,
    });
    note();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id]);

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
            query={scenario.query}
            matchResponse={response}
            onDismiss={() => {
              dismiss();
              events.emit({
                type: "module_dismissed",
                ts: catalog.today,
                user_id: wishlist.user_id,
                session_id: request.session_id,
                arm: client.arm,
                query_family: client.familyOf(scenario.query),
                skus: response?.matches.map((m) => m.sku) ?? [],
              });
              note();
              setToast("Dismissal logged as a relevance signal");
            }}
            onUndo={undo}
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
              note();
              setSelectedSize(item.size);
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
              events.emit({
                type: "moved_to_bag",
                ts: catalog.today,
                user_id: wishlist.user_id,
                session_id: request.session_id,
                arm: client.arm,
                sku: activeItem.sku,
                via_wishlist_module: true,
                size_deviated: size !== activeItem.size,
                duplicate: activeItem.state === "in_bag",
              });
              note();
              setToast(
                `Moved to Bag: ${activeItem.colour} · ${size}, revalidated at the boundary`
              );
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
            query={scenario.query}
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
