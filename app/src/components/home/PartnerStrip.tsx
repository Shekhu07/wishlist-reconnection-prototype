import { Image, StyleSheet, Text, View } from "react-native";
import type { Catalog } from "@/data/types";
import { CATALOG_IMAGES } from "@/data/images";
import { brandRail, categoryCoverIds } from "@/search/catalogBrowse";
import { color, radius, space, type } from "@/design/tokens";

/**
 * Two distinct brands drawn from the catalog, not hardcoded strings.
 *
 * Skipping the products already on the category rail is not fussiness: the
 * first brand in the catalog also wins the Fashion circle by review count,
 * so taking the first two outright put the same photo twice on one screen,
 * a hand's width apart.
 */
function pickBrands(catalog: Catalog) {
  const onTheRail = categoryCoverIds(catalog);
  return brandRail(catalog, 12)
    .filter((tile) => !onTheRail.has(tile.colourway.product_id))
    .slice(0, 2)
    .map((tile) => ({
      brand: tile.parent.brand,
      productId: tile.colourway.product_id,
    }));
}

/**
 * Each card carries a product shot from that brand rather than a grey
 * rectangle -- brandRail already returns one tile per brand, so the image is
 * the brand's own product and not a stand-in.
 */
export function PartnerStrip({ catalog }: { catalog: Catalog }) {
  const brands = pickBrands(catalog);
  return (
    <View style={styles.row} testID="partner-strip">
      {brands.map(({ brand, productId }) => (
        <View key={brand} style={styles.card}>
          <Image
            testID={`partner-image-${productId}`}
            source={CATALOG_IMAGES[productId]}
            style={styles.image}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.label} numberOfLines={1}>
            {brand}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  card: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: color.surfaceMuted,
    alignItems: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: 120 },
  label: { ...type.brand, color: color.textPrimary, padding: space.md },
});
