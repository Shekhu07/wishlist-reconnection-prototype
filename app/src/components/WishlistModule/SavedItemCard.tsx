import { Image, StyleSheet, Text, View } from "react-native";
import type { Match } from "@/match/contract";
import { FIT_PROMPT, NOT_DELIVERABLE, formatDelivery, formatPrice } from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import { CARD_IMAGE, CAROUSEL_CARD_WIDTH, color, radius, space, type } from "@/design/tokens";

/**
 * The single-match card: 96x128 image left, details right (section 4.3).
 *
 * The saved variant is always shown explicitly (FR-4) and never silently
 * replaced (FR-7) -- when the saved size is gone the card says so rather than
 * quietly showing a different one.
 */

export function SavedItemCard({
  match,
  compact = false,
  intent,
}: {
  match: Match;
  compact?: boolean;
  /** Improvement 7: at most one line, and only if the user wrote it. */
  intent?: string | null;
}) {
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
                // A seller that does not ship here has no date to promise, and
                // inventing one would be contradicted by the binding read a tap
                // later. Say what is true instead.
                match.current.delivery_by
                  ? formatDelivery(match.current.delivery_by)
                  : NOT_DELIVERABLE
              }`}
        </Text>
        {/* DC-01's compact confidence summary. Advisory, and deliberately only
            two facts: this read may be contradicted by the binding one, and a
            dense block here would push the results grid the module must not
            disturb (section 4.5). The rest is a tap away on the detail screen.

            The fit line does not vary by product, and does not need to: there
            is no size chart in this catalog, so "check the size guide" is the
            only fit statement the data supports for any item. Widening the wire
            contract to carry a field that cannot change would be ceremony. */}
        {/* The user's own words about their own item. Never inferred, and
            never more than one line -- a card carrying three intent lines
            stops being a reminder and becomes a profile read back at them. */}
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
  // 3:4 at the 156pt carousel width, per the spec. The old 176 was a round
  // number rather than the card's own aspect ratio.
  imageCompact: { width: "100%", height: Math.round((CAROUSEL_CARD_WIDTH * 4) / 3) },
  details: { flex: 1, justifyContent: "flex-start" },
  // In the column layout `flex: 0` resolves to a zero flex-basis, which
  // collapses this box to zero height and clips the brand line. Sizing to
  // content is what the carousel card actually needs.
  detailsCompact: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  brand: { ...type.brand, color: color.textPrimary },
  name: { ...type.body, color: color.textSecondary, marginTop: 2 },
  // The carousel card runs one step down from the single card: the spec sets
  // 12/700 over 11 there and 14/700 over 12 in the wide single layout.
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
  // Price is neutral state text: no strike-through, no was/now, no savings
  // line. Constraint C-1 is enforced here as much as in the copy bundle.
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
