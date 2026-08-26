import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import catalogJson from "@/data/catalog.json";
import scenariosJson from "@/data/scenarios.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Scenario, Wishlist } from "@/data/types";
import type { MatchRequest } from "@/match/contract";
import { MatchClient } from "@/match/transport";
import { FRAME_MAX_WIDTH, SearchResultsScreen } from "@/screens/SearchResultsScreen";
import { StateSwitcher } from "@/harness/StateSwitcher";
import { color, space, type } from "@/design/tokens";
import { useWishlistMatch, type SuppressionReason } from "@/state/useWishlistMatch";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;
const scenarios = scenariosJson as unknown as Scenario[];

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(scenarios[1] ?? scenarios[0]);
  const [latencyMs, setLatencyMs] = useState(60);
  const [swapFills, setSwapFills] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // One client for the session: suppression, frequency caps and the breaker
  // are all session state, so rebuilding it per render would erase them.
  const client = useMemo(() => new MatchClient({ catalog, wishlist }), []);

  const request: MatchRequest = useMemo(
    () => ({
      query: scenario.query,
      modality: scenario.modality,
      filters: scenario.filters as MatchRequest["filters"],
      delivery_pincode: wishlist.pincode,
      session_id: `sess_${scenario.id}`,
    }),
    [scenario]
  );

  const { response, suppressionReason, dismiss, undo, rerun } = useWishlistMatch(
    client,
    request,
    scenario.authenticated
  );

  // Changing the simulated latency has to re-run the match, otherwise the
  // control does nothing until the researcher also changes scenario.
  useEffect(() => {
    client.latencyMs = latencyMs;
    rerun();
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

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <StateSwitcher
        scenarios={scenarios}
        activeId={scenario.id}
        onSelect={(next) => {
          client.suppression.reset();
          setScenario(next);
        }}
        latencyMs={latencyMs}
        onLatencyChange={setLatencyMs}
        swapFills={swapFills}
        onSwapFills={setSwapFills}
        note={scenario.note}
      />

      <View style={styles.frame}>
        <SearchResultsScreen
          catalog={catalog}
          query={scenario.query}
          matchResponse={response}
          onDismiss={() => {
            dismiss();
            setToast("Dismissal logged as a relevance signal");
          }}
          onUndo={undo}
          onAction={(action, sku) =>
            setToast(
              action === "primary"
                ? `Buy path is Slice 2 — would open ${sku} with the saved variant preselected`
                : `Compare view is Slice 2 — would open alternatives for ${sku}`
            )
          }
          swapFills={swapFills}
        />
      </View>

      {suppressionReason ? (
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
