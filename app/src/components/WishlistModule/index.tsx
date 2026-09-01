import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FadeIn } from "@/components/FadeIn";
import type { MatchResponse } from "@/match/contract";
import {
  COPY,
  DISMISSED_COPY,
  DISMISS_LABEL,
  HIDDEN_FOREVER_COPY,
  HIDE_FOREVER_LABEL,
  UNDO_LABEL,
  VIEW_ALL,
  WHY_LINK,
} from "@/copy/bundle";
import {
  CAROUSEL_CARD_WIDTH,
  MIN_TOUCH_TARGET,
  color,
  radius,
  space,
  type,
} from "@/design/tokens";
import { ActionRow } from "./ActionRow";
import { SavedItemCard } from "./SavedItemCard";

/**
 * "From your Wishlist" (E4).
 *
 * Placement and treatment follow section 4.2: a neutral bordered container,
 * deliberately untinted. The home screen is already dense with promotional
 * colour, so a tinted container would read as another ad and inherit exactly
 * the tone constraint C-1 forbids. A neutral container reads as state.
 */

export interface WishlistModuleProps {
  response: MatchResponse;
  onDismiss: () => void;
  onUndo: () => void;
  /** E16: the durable opt-out, distinct from dismissing (FR-8). */
  onHideForever?: (sku: string) => void;
  onPrimary: (sku: string) => void;
  onSecondary: (sku: string) => void;
  /** Raises DC-02. The shell renders the sheet; see AppShell's `sheet` slot. */
  onWhy?: () => void;
  /** Improvement 7: at most one intent line per card, by sku. Never inferred. */
  intentFor?: (sku: string) => string | null;
  /**
   * A dismissal raised from outside the module -- today, DC-02's "Hide for this
   * search".
   *
   * The module going away is local state, not a consequence of the service-side
   * suppression: `client.dismiss()` records the signal for the *next* match and
   * leaves the current response alone. So a second entry point that only called
   * dismiss() logged the relevance signal and left the module sitting there,
   * having just been asked to hide. Bumping this nonce takes the same path the
   * close box does, undo strip included, because FR-8 requires a dismissal stay
   * reversible however it was raised.
   */
  externalDismiss?: number;
  swapFills?: boolean;
}

const UNDO_WINDOW_MS = 5000;

export function WishlistModule({
  response,
  onDismiss,
  onUndo,
  onHideForever,
  onPrimary,
  onSecondary,
  onWhy,
  intentFor,
  externalDismiss = 0,
  swapFills,
}: WishlistModuleProps) {
  const [dismissed, setDismissed] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);
  const [hiddenForever, setHiddenForever] = useState(false);
  const [selectedSku, setSelectedSku] = useState(response.matches[0]?.sku ?? "");

  useEffect(() => {
    // A new result set is a new question; the old dismissal does not carry.
    setDismissed(false);
    setUndoVisible(false);
    setHiddenForever(false);
    setSelectedSku(response.matches[0]?.sku ?? "");
  }, [response]);

  useEffect(() => {
    if (externalDismiss === 0) return;
    setDismissed(true);
    setUndoVisible(true);
  }, [externalDismiss]);

  useEffect(() => {
    if (!undoVisible) return undefined;
    const timer = setTimeout(() => setUndoVisible(false), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoVisible]);

  if (response.matches.length === 0) return null;

  // Declared before the dismissed branch because the hide callback closes over
  // it. TypeScript cannot see the temporal dead zone through a closure, so
  // leaving it below compiled cleanly and threw the moment anyone tapped.
  const primary = response.matches[0];

  if (dismissed) {
    if (!undoVisible) return null;
    return (
      <View style={styles.undoStrip} testID="wishlist-module-dismissed">
        <Text style={styles.undoText}>
          {hiddenForever ? HIDDEN_FOREVER_COPY : DISMISSED_COPY}
        </Text>
        <View style={styles.undoActions}>
          {/* Escalation, not a replacement. Dismissing is the light action and
              stays a relevance signal; this is the deliberate, durable one. */}
          {!hiddenForever && onHideForever ? (
            <Pressable
              testID="wishlist-hide-forever"
              accessibilityRole="button"
              accessibilityLabel={HIDE_FOREVER_LABEL}
              hitSlop={hitSlopFor(24)}
              onPress={() => {
                setHiddenForever(true);
                onHideForever(primary.sku);
              }}
            >
              <Text style={styles.undoSecondary}>{HIDE_FOREVER_LABEL}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={UNDO_LABEL}
            hitSlop={hitSlopFor(24)}
            onPress={() => {
              setDismissed(false);
              setUndoVisible(false);
              setHiddenForever(false);
              onUndo();
            }}
          >
            <Text style={styles.undoAction}>{UNDO_LABEL}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentMatch = response.matches.find((m) => m.sku === selectedSku) ?? primary;
  const copy = COPY[currentMatch.copy_key] ?? COPY.exact_variant_available;
  const multi = response.matches.length > 1;
  const context = {
    count: response.capped_total,
    savedSize: currentMatch.saved.size,
    savedColour: currentMatch.saved.color,
  };
  // A dead-end Buy button is worse than no button: when the saved variant
  // cannot be bought, the primary action changes rather than disappearing
  // (source doc 4.1, FR-7). Slice 1 routes both actions to a stub screen.
  const overflow = response.capped_total - response.matches.length;

  return (
    <FadeIn style={styles.container} testID="wishlist-module">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            <Text style={styles.heart}>♥ </Text>
            {copy.title}
          </Text>
          <Text style={styles.subtitle}>{copy.subtitle(context)}</Text>
        </View>
        <Pressable
          testID="wishlist-dismiss"
          accessibilityRole="button"
          accessibilityLabel={DISMISS_LABEL}
          hitSlop={hitSlopFor(MIN_TOUCH_TARGET)}
          onPress={() => {
            setDismissed(true);
            setUndoVisible(true);
            onDismiss();
          }}
          style={styles.dismiss}
        >
          <Text style={styles.dismissGlyph}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      {multi ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
        >
          {response.matches.map((match) => (
            <View key={match.sku} style={styles.carouselCard}>
              <SavedItemCard
                match={match}
                compact
                selected={match.sku === selectedSku}
                intent={intentFor?.(match.sku)}
                onPress={() => {
                  setSelectedSku(match.sku);
                  onPrimary(match.sku);
                }}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <SavedItemCard
          match={primary}
          intent={intentFor?.(primary.sku)}
          onPress={() => onPrimary(primary.sku)}
        />
      )}

      {overflow > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={VIEW_ALL}
          hitSlop={hitSlopFor(24)}
          onPress={() => onSecondary(currentMatch.sku)}
        >
          <Text style={styles.viewAll}>{VIEW_ALL}</Text>
        </Pressable>
      ) : null}

      <ActionRow
        primaryLabel={copy.primaryAction}
        secondaryLabel={copy.secondaryAction}
        onPrimary={() => onPrimary(currentMatch.sku)}
        onSecondary={() => onSecondary(currentMatch.sku)}
        swapFills={swapFills}
      />

      {/* DC-01 places this below the two actions rather than beside them: it is
          a question about the module, not a third thing to do with the item,
          and giving it equal weight would make three co-equal actions out of
          the two FR-5 asks for. */}
      <Pressable
        testID="wishlist-why"
        accessibilityRole="button"
        accessibilityLabel={WHY_LINK}
        hitSlop={hitSlopFor(MIN_TOUCH_TARGET)}
        onPress={() => onWhy?.()}
        style={styles.why}
      >
        <Text style={styles.whyText}>{WHY_LINK}</Text>
      </Pressable>

    </FadeIn>
  );
}

/** Grows a small glyph to the minimum touch target (constraint C-7). */
function hitSlopFor(target: number) {
  const pad = Math.max(0, (target - 20) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: color.surface,
    borderColor: color.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  header: { flexDirection: "row", alignItems: "flex-start" },
  headerText: { flex: 1 },
  title: { ...type.moduleHeader, color: color.textPrimary },
  heart: { color: color.brandPink },
  subtitle: { ...type.body, color: color.textSecondary, marginTop: 2 },
  dismiss: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissGlyph: { fontSize: 15, color: color.textSecondary },
  divider: {
    height: 1,
    backgroundColor: color.borderSubtle,
    marginVertical: space.md,
  },
  carousel: { gap: space.md },
  carouselCard: { width: CAROUSEL_CARD_WIDTH },
  why: { marginTop: space.sm, alignSelf: "flex-start" },
  whyText: { ...type.chip, color: color.textSecondary, textDecorationLine: "underline" },
  viewAll: {
    ...type.body,
    color: color.brandPink,
    fontWeight: "700",
    marginTop: space.md,
  },
  undoStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: color.surfaceMuted,
    borderRadius: radius.card,
  },
  undoText: { ...type.body, color: color.textSecondary },
  undoActions: { flexDirection: "row", alignItems: "center", gap: space.md },
  undoSecondary: { ...type.body, color: color.textSecondary },
  undoAction: { ...type.body, fontWeight: "700", color: color.brandPink },
});
