import { StyleSheet, Text, View } from "react-native";
import type { Catalog } from "@/data/types";
import { color, radius, space, type } from "@/design/tokens";

/** Two distinct brand names drawn from the catalog, not hardcoded strings. */
function pickBrands(catalog: Catalog): string[] {
  const brands: string[] = [];
  for (const parent of catalog.parents) {
    if (!brands.includes(parent.brand)) {
      brands.push(parent.brand);
    }
    if (brands.length === 2) break;
  }
  return brands;
}

export function PartnerStrip({ catalog }: { catalog: Catalog }) {
  const brands = pickBrands(catalog);
  return (
    <View style={styles.row} testID="partner-strip">
      {brands.map((brand) => (
        <View key={brand} style={styles.card}>
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
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: color.surfaceMuted,
    alignItems: "center",
  },
  label: { ...type.brand, color: color.textPrimary },
});
