import { Platform, StyleSheet, Text, View } from "react-native";
import { color, radius, space, spec, type } from "@/design/tokens";

/**
 * The seasonal sale card from the design spec.
 *
 * Constraint C-1 again, and the same reasoning as BannerCarousel: a sale may
 * be advertised, never one attached to a saved item. Every line here is a
 * constant, so no catalog or wishlist value can reach this surface.
 */
export function SaleStrip() {
  return (
    <View style={styles.card} testID="sale-strip">
      <Text style={styles.eyebrow}>END OF SEASON SALE</Text>
      <Text style={styles.headline}>40–70% Off</Text>
      <Text style={styles.detail}>On top brands · Extra 10% off on prepaid orders</Text>
    </View>
  );
}

const GRADIENT = `linear-gradient(135deg, ${spec.saleSurfaceFrom}, ${color.surfaceMuted})`;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: 20,
    borderRadius: radius.banner,
    backgroundColor: spec.saleSurfaceFrom,
    ...(Platform.OS === "web"
      ? ({ backgroundImage: GRADIENT } as unknown as object)
      : null),
  },
  eyebrow: { ...type.tileBrand, letterSpacing: 0.4, color: color.brandPink },
  headline: {
    fontSize: 23,
    fontWeight: "800",
    color: color.textPrimary,
    marginTop: 6,
  },
  detail: { ...type.body, color: color.textSecondary, marginTop: space.xs },
});
