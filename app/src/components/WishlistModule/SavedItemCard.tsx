import { Image, StyleSheet, Text, View } from "react-native";
import type { Match } from "@/match/contract";
import { formatDelivery, formatPrice } from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import { CARD_IMAGE, color, radius, space, type } from "@/design/tokens";

/**
 * The single-match card: 96x128 image left, details right (section 4.3).
 *
 * The saved variant is always shown explicitly (FR-4) and never silently
 * replaced (FR-7) -- when the saved size is gone the card says so rather than
 * quietly showing a different one.
 */

export function SavedItemCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  const savedVariant = `${match.saved.color} · ${match.saved.size}`;
  const unavailable =
    match.current.state === "variant_unavailable" ||
    match.current.state === "product_unavailable";

  return (
    <View
      style={[styles.card, compact && styles.cardCompact]}
      accessible
      accessibilityLabel={[
        match.display.brand,
        match.display.name,
        `saved ${savedVariant}`,
        unavailable ? "saved size unavailable" : formatPrice(match.current.price),
      ].join(", ")}
    >
      <Image
        source={CATALOG_IMAGES[match.display.imageId]}
        style={[styles.image, compact && styles.imageCompact]}
        resizeMode="cover"
        // The card already carries a full label; a second description here
        // makes screen readers announce the product twice.
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={[styles.details, compact && styles.detailsCompact]}>
        <Text style={styles.brand} numberOfLines={1}>
          {match.display.brand.toUpperCase()}
        </Text>
        <Text style={styles.name} numberOfLines={2}>
          {match.display.name}
        </Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>Saved: {savedVariant}</Text>
        </View>
        <Text style={styles.meta} numberOfLines={compact ? 1 : 2}>
          {unavailable
            ? "Saved size unavailable"
            : `${formatPrice(match.current.price)} · ${formatDelivery(match.current.delivery_by)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: space.md },
  cardCompact: { flexDirection: "column", gap: space.sm },
  image: {
    width: CARD_IMAGE.width,
    height: CARD_IMAGE.height,
    borderRadius: radius.card - 6,
    backgroundColor: color.surfaceMuted,
  },
  imageCompact: { width: "100%", height: 176 },
  details: { flex: 1, justifyContent: "flex-start" },
  // In the column layout `flex: 0` resolves to a zero flex-basis, which
  // collapses this box to zero height and clips the brand line. Sizing to
  // content is what the carousel card actually needs.
  detailsCompact: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  brand: { ...type.brand, color: color.textPrimary },
  name: { ...type.body, color: color.textSecondary, marginTop: 2 },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: color.surfaceMuted,
    borderRadius: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    marginTop: space.sm,
  },
  chipText: { ...type.chip, color: color.textPrimary },
  // Price is neutral state text: no strike-through, no was/now, no savings
  // line. Constraint C-1 is enforced here as much as in the copy bundle.
  meta: { ...type.body, color: color.textSecondary, marginTop: space.sm },
});
