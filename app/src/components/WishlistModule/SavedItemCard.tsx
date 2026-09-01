import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Match } from "@/match/contract";
import { FIT_PROMPT, NOT_DELIVERABLE, formatDelivery, formatPrice } from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import { CARD_IMAGE, CAROUSEL_CARD_WIDTH, MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * The saved wishlist item card: 96x128 image left, details right (section 4.3).
 *
 * Clickable to allow direct selection and navigation to any individual item
 * in the multi-item carousel or single-item module.
 */

export interface SavedItemCardProps {
  match: Match;
  compact?: boolean;
  /** Improvement 7: at most one line, and only if the user wrote it. */
  intent?: string | null;
  selected?: boolean;
  onPress?: () => void;
}

export function SavedItemCard({
  match,
  compact = false,
  intent,
  selected = false,
  onPress,
}: SavedItemCardProps) {
  const savedVariant = `${match.saved.color} · ${match.saved.size}`;
  const unavailable =
    match.current.state === "variant_unavailable" ||
    match.current.state === "product_unavailable";

  return (
    <Pressable
      testID={`saved-card-${match.sku}`}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[
        match.display.brand,
        match.display.name,
        `saved ${savedVariant}`,
        unavailable ? "saved size unavailable" : formatPrice(match.current.price),
      ].join(", ")}
      accessibilityState={selected ? { selected: true } : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.card,
        compact && styles.cardCompact,
        compact && selected && styles.cardSelected,
      ]}
    >
      <View style={styles.imageWrap}>
        <Image
          source={CATALOG_IMAGES[match.display.imageId]}
          style={[styles.image, compact && styles.imageCompact]}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        {compact && selected ? (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>✓</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.details, compact && styles.detailsCompact]}>
        <Text style={[styles.brand, compact && styles.brandCompact]} numberOfLines={1}>
          {match.display.brand.toUpperCase()}
        </Text>
        <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={2}>
          {match.display.name}
        </Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>Saved: {savedVariant}</Text>
        </View>
        <Text style={styles.meta} numberOfLines={compact ? 1 : 2}>
          {unavailable
            ? "Saved size unavailable"
            : `${formatPrice(match.current.price)} · ${
                match.current.delivery_by
                  ? formatDelivery(match.current.delivery_by)
                  : NOT_DELIVERABLE
              }`}
        </Text>

        {intent ? (
          <Text style={styles.intent} numberOfLines={1} testID="intent-tag">
            {intent}
          </Text>
        ) : null}

        {!unavailable ? (
          <View style={styles.confidencePill}>
            <View style={styles.confidenceDot} />
            <Text style={styles.summary} numberOfLines={1} testID="confidence-summary">
              {`Size ${match.saved.size} available · ${FIT_PROMPT}`}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: space.md, minHeight: CARD_IMAGE.height },
  cardCompact: {
    flexDirection: "column",
    gap: space.sm,
    padding: 6,
    borderRadius: radius.card - 2,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: "#FFFFFF",
    minHeight: MIN_TOUCH_TARGET,
  },
  cardSelected: {
    borderColor: color.brandPink,
    backgroundColor: "#FFF5F8",
  },
  imageWrap: {
    position: "relative",
  },
  selectedBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.brandPink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  selectedBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  image: {
    width: CARD_IMAGE.width,
    height: CARD_IMAGE.height,
    borderRadius: radius.card - 6,
    backgroundColor: color.surfaceMuted,
  },
  imageCompact: { width: "100%", height: Math.round((CAROUSEL_CARD_WIDTH * 4) / 3) },
  details: { flex: 1, justifyContent: "flex-start" },
  detailsCompact: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  brand: { ...type.brand, color: color.textPrimary },
  name: { ...type.body, color: color.textSecondary, marginTop: 2 },
  brandCompact: { ...type.tileBrand },
  nameCompact: { ...type.tileName, marginTop: 1 },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: color.surfaceMuted,
    borderRadius: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    marginTop: space.sm,
  },
  chipText: { ...type.chip, color: color.textPrimary },
  meta: { ...type.body, color: color.textSecondary, marginTop: space.sm },
  confidencePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
    gap: 5,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#059669",
  },
  summary: { fontSize: 11, color: "#047857", fontWeight: "600" },
  intent: { ...type.chip, color: color.brandPink, marginTop: space.xs, fontWeight: "500" },
});
