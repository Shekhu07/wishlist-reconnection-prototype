import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATALOG_IMAGES } from "@/data/images";
import type { Catalog } from "@/data/types";
import { CAROUSEL_CARD_WIDTH, color, radius, space, type } from "@/design/tokens";
import { brandRail } from "@/search/catalogBrowse";

export interface BrandCarouselProps {
  catalog: Catalog;
  onSubmit: (query: string) => void;
}

/**
 * "Continue browsing these brands" -- one tile per distinct brand, capped at
 * 12. Pressing a card searches `${brand} ${articleType}` as a literal query,
 * so the brand string passed to onSubmit is not the uppercased display copy.
 */
export function BrandCarousel({ catalog, onSubmit }: BrandCarouselProps) {
  const tiles = brandRail(catalog, 12);

  return (
    <View style={styles.wrap} testID="brand-carousel">
      <Text style={styles.heading}>Continue browsing these brands</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.colourway.product_id}
            accessibilityRole="button"
            style={styles.card}
            onPress={() => onSubmit(`${tile.parent.brand} ${tile.parent.articleType}`)}
          >
            <Image
              source={CATALOG_IMAGES[tile.colourway.product_id]}
              style={styles.image}
              resizeMode="cover"
            />
            <Text style={styles.brand} numberOfLines={1}>
              {tile.parent.brand.toUpperCase()}
            </Text>
            <Text style={styles.articleType} numberOfLines={1}>
              {tile.parent.articleType}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.md },
  heading: { ...type.moduleHeader, color: color.textPrimary, paddingHorizontal: space.lg },
  row: { paddingHorizontal: space.lg, gap: space.md, marginTop: space.sm },
  card: { width: CAROUSEL_CARD_WIDTH },
  image: {
    width: CAROUSEL_CARD_WIDTH,
    height: Math.round((CAROUSEL_CARD_WIDTH * 4) / 3),
    borderRadius: radius.card - 6,
    backgroundColor: color.surfaceMuted,
  },
  brand: { ...type.brand, color: color.textPrimary, marginTop: space.sm },
  articleType: { ...type.body, color: color.textSecondary, marginTop: 2 },
});
