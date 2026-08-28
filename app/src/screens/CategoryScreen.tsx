import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ProductTileBody } from "@/components/catalog/ProductTileBody";
import { SaveHeart } from "@/components/catalog/SaveHeart";
import type { Catalog } from "@/data/types";
import { byCategory, categoryLabel, overview, type BrowseTile, type CategoryKey } from "@/search/catalogBrowse";
import { color, space, type } from "@/design/tokens";
import { FRAME_MAX_WIDTH } from "./SearchResultsScreen";

/**
 * What a home category circle opens onto. Until now it opened a stub, so the
 * six circles were the only surface in the shell that promised a catalog and
 * showed nothing.
 *
 * Layout is BrowseScreen's -- same tile, same two columns, same column maths.
 * The difference is the filter (a category, not a price band) and the mixed
 * ordering, which matters most in Fashion and Footwear: both hold men's and
 * women's products, and in file order Fashion opens on 39 men's garments
 * before the first women's kurta.
 */
export function CategoryScreen({
  catalog,
  categoryKey,
  onSelectTile,
  savedProductIds,
  onToggleSave,
}: {
  catalog: Catalog;
  categoryKey: CategoryKey;
  onSelectTile: (tile: BrowseTile) => void;
  /** Absent leaves the grid read-only: no heart is drawn at all. */
  savedProductIds?: Set<number>;
  onToggleSave?: (tile: BrowseTile) => void;
}) {
  const tiles = useMemo(() => {
    const inCategory = byCategory(catalog, categoryKey);
    const ids = new Set(inCategory.map((tile) => tile.parent.parent_product_id));
    // Reuse the home grid's audience/article-type interleave, then keep only
    // this category. Ordering one list rather than writing a second shuffle
    // keeps the two grids consistent.
    return overview(catalog, "all").filter((tile) =>
      ids.has(tile.parent.parent_product_id)
    );
  }, [catalog, categoryKey]);

  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, FRAME_MAX_WIDTH) / 2 - space.md - space.xs * 2;
  const size = { width: columnWidth, height: Math.round((columnWidth * 4) / 3) };

  return (
    <ScrollView style={styles.screen} testID="category-screen">
      <Text style={styles.heading}>{categoryLabel(categoryKey)}</Text>
      <Text style={styles.count}>{tiles.length} items</Text>
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <View key={tile.parent.parent_product_id} style={styles.tile}>
            <Pressable
              testID={`category-tile-${tile.parent.parent_product_id}`}
              accessibilityRole="button"
              accessibilityLabel={`${tile.parent.brand} ${tile.colourway.display_name}`}
              accessibilityValue={{ text: String(tile.colourway.price) }}
              onPress={() => onSelectTile(tile)}
            >
              <ProductTileBody tile={tile} size={size} />
            </Pressable>
            {onToggleSave ? (
              <SaveHeart
                tile={tile}
                saved={savedProductIds?.has(tile.colourway.product_id) ?? false}
                onToggle={() => onToggleSave(tile)}
                inset={space.xs + 6}
              />
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  heading: {
    ...type.sectionHeader,
    color: color.textPrimary,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  count: {
    ...type.body,
    color: color.textSecondary,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: space.sm },
  tile: { padding: space.xs, gap: 2 },
});
