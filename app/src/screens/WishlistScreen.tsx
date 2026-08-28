import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ADVISORY_COPY,
  NOT_DELIVERABLE,
  RECOVERY_COPY,
  formatDelivery,
  formatPrice,
} from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import type { RevalidationResult } from "@/revalidation/revalidate";
import { CARD_IMAGE, MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * The Wishlist itself, reached from the heart on the home header.
 *
 * Until now the shell could show a saved item (from a search match, or a
 * comparison) but had no screen that simply listed what the user had saved --
 * and the home header's heart was wired to `() => {}`, which is the
 * unwired-control defect this codebase has flagged before.
 *
 * Every row is held to the same constraints as the reconnection module,
 * because these are the same saved items:
 *
 *   C-1  Price is neutral state text. No strike-through, no was/now, no
 *        savings, no discount badge, no urgency -- which is why these rows
 *        cannot reuse ProductTileBody, whose price row carries an MRP and a
 *        "% OFF" chip. That tile is correct for the catalog and wrong here.
 *   FR-4 The saved colour and size are always stated explicitly.
 *   FR-7 A saved variant is never silently replaced by an available one. When
 *        the saved size is gone the row says so, in the named words for that
 *        reason (section 4.14 rules out a generic error).
 *
 * The status each row shows is advisory, the same as the module's: it comes
 * from the same revalidate() the detail screen runs, so the two agree, and the
 * binding read still happens at the action boundary a tap later.
 */

export interface WishlistScreenProps {
  results: RevalidationResult[];
  pincode: string;
  onSelectItem: (itemId: string) => void;
}

/** Short, named state for a row. Never a generic "unavailable". */
function statusFor(result: RevalidationResult, pincode: string): string {
  const { blocking, current, item } = result;
  if (blocking) {
    return RECOVERY_COPY[blocking]({
      size: item.size,
      colour: item.colour,
      seller: current.seller,
      pincode,
    }).title;
  }
  const delivery = current.delivery_by ? formatDelivery(current.delivery_by) : NOT_DELIVERABLE;
  return `${formatPrice(current.price)} · ${delivery}`;
}

export function WishlistScreen({ results, pincode, onSelectItem }: WishlistScreenProps) {
  return (
    <ScrollView style={styles.screen} testID="wishlist-screen">
      <Text style={styles.heading}>Wishlist</Text>
      <Text style={styles.count}>
        {results.length === 1 ? "1 item" : `${results.length} items`}
      </Text>

      {results.length === 0 ? (
        <Text style={styles.empty} testID="wishlist-empty">
          Nothing saved yet. Tap the heart on a product to save it here.
        </Text>
      ) : null}

      {results.map((result) => {
        const { item, parent, colourway, advisories } = result;
        const savedVariant = `${item.colour} · ${item.size}`;
        const status = statusFor(result, pincode);
        return (
          <Pressable
            key={item.item_id}
            testID={`wishlist-row-${item.item_id}`}
            accessibilityRole="button"
            accessibilityLabel={[
              parent.brand,
              colourway.display_name,
              `saved ${savedVariant}`,
              status,
            ].join(", ")}
            onPress={() => onSelectItem(item.item_id)}
            style={styles.row}
          >
            <Image
              source={CATALOG_IMAGES[colourway.product_id]}
              style={styles.image}
              resizeMode="cover"
              // The row carries a full label already; a second description
              // makes a screen reader announce the product twice.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <View style={styles.details}>
              <Text style={styles.brand} numberOfLines={1}>
                {parent.brand.toUpperCase()}
              </Text>
              <Text style={styles.name} numberOfLines={2}>
                {colourway.display_name}
              </Text>
              <View style={styles.chip}>
                <Text style={styles.chipText}>Saved: {savedVariant}</Text>
              </View>
              <Text style={styles.status} numberOfLines={2} testID={`wishlist-status-${item.item_id}`}>
                {status}
              </Text>
              {/* One advisory at most. A row stacking every change becomes a
                  notification feed; the rest is on the detail screen. */}
              {advisories.length > 0 ? (
                <Text style={styles.advisory} numberOfLines={1}>
                  {ADVISORY_COPY[advisories[0]]}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  heading: {
    ...type.sectionHeader,
    color: color.textPrimary,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  count: {
    ...type.body,
    color: color.textSecondary,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  empty: {
    ...type.body,
    color: color.textSecondary,
    padding: space.lg,
  },
  row: {
    flexDirection: "row",
    gap: space.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSubtle,
  },
  image: {
    width: CARD_IMAGE.width,
    height: CARD_IMAGE.height,
    borderRadius: radius.card - 6,
    backgroundColor: color.surfaceMuted,
  },
  details: { flex: 1 },
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
  // Neutral state text. C-1 is enforced here as much as in the copy bundle.
  status: { ...type.body, color: color.textSecondary, marginTop: space.sm },
  advisory: { ...type.chip, color: color.textSecondary, marginTop: 2 },
});
