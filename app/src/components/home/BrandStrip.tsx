import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Catalog } from "@/data/types";
import { discountPercent } from "@/copy/catalog";
import { color, radius, space, type } from "@/design/tokens";

/**
 * "Shop by Brand" -- the horizontal brand rail from the design spec.
 *
 * The spec's mock hardcodes "Min. 40% off" under every brand. That would be a
 * fabricated claim on real catalog rows, so the tagline is computed instead:
 * the smallest discount any of that brand's colourways actually carries, which
 * is what "Min. N% off" means. A brand whose cheapest markdown is 12% says 12.
 *
 * C-1 is not in play here. The ban is on a monetary incentive attached to a
 * *saved* item; this rail is ordinary catalog merchandising and is never keyed
 * on the wishlist -- it takes no wishlist argument, the same structural
 * guarantee search() uses for FR-2.
 */

export interface BrandCard {
  brand: string;
  brandKey: string;
  tagline: string;
}

export function brandCards(catalog: Catalog, limit = 6): BrandCard[] {
  const byBrand = new Map<string, { brand: string; minDiscount: number }>();
  for (const parent of catalog.parents) {
    for (const colourway of parent.colourways) {
      const discount = discountPercent(colourway.price, colourway.mrp);
      const current = byBrand.get(parent.brand_key);
      if (!current) {
        byBrand.set(parent.brand_key, { brand: parent.brand, minDiscount: discount });
      } else if (discount < current.minDiscount) {
        current.minDiscount = discount;
      }
    }
  }
  return [...byBrand.entries()]
    .slice(0, limit)
    .map(([brandKey, { brand, minDiscount }]) => ({
      brand,
      brandKey,
      tagline: `Min. ${minDiscount}% off`,
    }));
}

export function BrandStrip({
  catalog,
  onSelectBrand,
}: {
  catalog: Catalog;
  onSelectBrand: (brand: string) => void;
}) {
  const cards = useMemo(() => brandCards(catalog), [catalog]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="brand-strip"
    >
      {cards.map((card) => (
        <Pressable
          key={card.brandKey}
          testID={`brand-card-${card.brandKey}`}
          accessibilityRole="button"
          accessibilityLabel={`Shop ${card.brand}, ${card.tagline}`}
          onPress={() => onSelectBrand(card.brand)}
          style={styles.card}
        >
          <Text style={styles.name} numberOfLines={1}>
            {card.brand}
          </Text>
          <Text style={styles.tagline} numberOfLines={1}>
            {card.tagline}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10 },
  card: {
    width: 104,
    paddingVertical: 14,
    paddingHorizontal: space.sm,
    borderRadius: radius.card,
    backgroundColor: color.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { ...type.tileBrand, color: color.textPrimary },
  tagline: { fontSize: 10, color: color.textSecondary, marginTop: space.xs },
});
