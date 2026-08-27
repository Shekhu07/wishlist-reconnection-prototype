import { StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/design/tokens";

/**
 * Fixed prose, not a promise about anything the user saved (constraint C-1):
 * this is a generic seasonal banner, never a reference to a wishlist item.
 */
export function BannerCarousel() {
  return (
    <View style={styles.banner} testID="banner-carousel">
      <Text style={styles.eyebrow}>END OF SEASON SALE</Text>
      <Text style={styles.headline}>40-70% Off</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: space.lg,
    marginVertical: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surfaceMuted,
  },
  eyebrow: { ...type.brand, color: color.textSecondary },
  headline: { ...type.sectionHeader, color: color.textPrimary, marginTop: space.xs },
});
