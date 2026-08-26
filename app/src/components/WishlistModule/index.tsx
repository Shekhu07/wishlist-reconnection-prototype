import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MatchResponse } from "@/match/contract";
import {
  COPY,
  DISMISSED_COPY,
  DISMISS_LABEL,
  UNDO_LABEL,
  VIEW_ALL,
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
  onPrimary: (sku: string) => void;
  onSecondary: (sku: string) => void;
  swapFills?: boolean;
}

const UNDO_WINDOW_MS = 5000;

export function WishlistModule({
  response,
  onDismiss,
  onUndo,
  onPrimary,
  onSecondary,
  swapFills,
}: WishlistModuleProps) {
  const [dismissed, setDismissed] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);

  useEffect(() => {
    // A new result set is a new question; the old dismissal does not carry.
    setDismissed(false);
    setUndoVisible(false);
  }, [response]);

  useEffect(() => {
    if (!undoVisible) return undefined;
    const timer = setTimeout(() => setUndoVisible(false), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoVisible]);

  if (response.matches.length === 0) return null;

  if (dismissed) {
    if (!undoVisible) return null;
    return (
      <View style={styles.undoStrip} testID="wishlist-module-dismissed">
        <Text style={styles.undoText}>{DISMISSED_COPY}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={UNDO_LABEL}
          hitSlop={hitSlopFor(24)}
          onPress={() => {
            setDismissed(false);
            setUndoVisible(false);
            onUndo();
          }}
        >
          <Text style={styles.undoAction}>{UNDO_LABEL}</Text>
        </Pressable>
      </View>
    );
  }

  const primary = response.matches[0];
  const copy = COPY[primary.copy_key];
  const multi = response.matches.length > 1;
  const context = {
    count: response.capped_total,
    savedSize: primary.saved.size,
    savedColour: primary.saved.color,
  };
  // A dead-end Buy button is worse than no button: when the saved variant
  // cannot be bought, the primary action changes rather than disappearing
  // (source doc 4.1, FR-7). Slice 1 routes both actions to a stub screen.
  const overflow = response.capped_total - response.matches.length;

  return (
    <View style={styles.container} testID="wishlist-module">
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
              <SavedItemCard match={match} compact />
            </View>
          ))}
        </ScrollView>
      ) : (
        <SavedItemCard match={primary} />
      )}

      {overflow > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={VIEW_ALL}
          hitSlop={hitSlopFor(24)}
          onPress={() => onSecondary(primary.sku)}
        >
          <Text style={styles.viewAll}>{VIEW_ALL}</Text>
        </Pressable>
      ) : null}

      <ActionRow
        primaryLabel={copy.primaryAction}
        secondaryLabel={copy.secondaryAction}
        onPrimary={() => onPrimary(primary.sku)}
        onSecondary={() => onSecondary(primary.sku)}
        swapFills={swapFills}
      />
    </View>
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
  undoAction: { ...type.body, fontWeight: "700", color: color.brandPink },
});
