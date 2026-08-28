import { Image, StyleSheet, Text, View } from "react-native";
import { CATALOG_IMAGES } from "@/data/images";
import { discountPercent, formatMrp } from "@/copy/catalog";
import { formatPrice } from "@/copy/bundle";
import { color, radius, space, type } from "@/design/tokens";
import type { BrowseTile } from "@/search/catalogBrowse";

/**
 * The inner content of a catalog grid tile -- image, brand, name, rating and
 * the price row -- shared by HomeScreen, SearchResultsScreen and
 * BrowseScreen so the three didn't carry three copies of the same six lines.
 * Each screen keeps its own outer Pressable/View, testID and accessibility
 * props: those differ per screen and are load-bearing for existing tests, so
 * this component owns layout only, never the wrapper.
 *
 * The wishlist heart is decorative, not a Pressable -- wiring it to actually
 * save/unsave is a separate feature, and an unwired tap target reads as a
 * broken control (see Task 9's review, which flagged exactly that class of
 * defect elsewhere in this shell).
 */
export function ProductTileBody({
  tile,
  size,
}: {
  tile: BrowseTile;
  size: { width: number; height: number };
}) {
  const { parent, colourway } = tile;
  return (
    <>
      <View style={styles.imageWrap}>
        <Image
          source={CATALOG_IMAGES[colourway.product_id]}
          style={[styles.image, size]}
          resizeMode="cover"
        />
        <View
          style={styles.heart}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.heartGlyph}>♡</Text>
        </View>
      </View>
      <Text style={styles.brand} numberOfLines={1}>
        {parent.brand.toUpperCase()}
      </Text>
      <Text style={styles.name} numberOfLines={1}>
        {colourway.display_name}
      </Text>
      <View style={styles.ratingRow}>
        <Text style={styles.rating}>★ {colourway.rating.toFixed(1)}</Text>
        <Text style={styles.reviewCount}>
          ({colourway.review_count.toLocaleString("en-IN")})
        </Text>
      </View>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatPrice(colourway.price)}</Text>
        <Text style={styles.mrp}>{formatMrp(colourway.mrp)}</Text>
        <Text style={styles.discount}>
          {discountPercent(colourway.price, colourway.mrp)}% OFF
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  imageWrap: { position: "relative" },
  image: {
    borderRadius: radius.tile,
    backgroundColor: color.surfaceMuted,
  },
  heart: {
    // 6px from the corner, not space.xs -- the spec insets the heart slightly
    // further than the 4pt grid so it clears the image's 6px radius.
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  heartGlyph: { fontSize: 15, color: color.textPrimary },
  brand: { ...type.tileBrand, color: color.textPrimary, marginTop: space.sm },
  name: { ...type.tileName, color: color.textSecondary, marginTop: 2 },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  rating: { ...type.chip, color: color.textPrimary, fontWeight: "700" },
  reviewCount: { ...type.chip, color: color.textSecondary },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: space.xs,
    flexWrap: "wrap",
  },
  price: { ...type.tilePrice, color: color.textPrimary },
  mrp: {
    ...type.chip,
    color: color.textSecondary,
    textDecorationLine: "line-through",
  },
  discount: { ...type.chip, color: color.brandPink, fontWeight: "700" },
});
