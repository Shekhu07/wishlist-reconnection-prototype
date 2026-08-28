import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ProductTileBody } from "@/components/catalog/ProductTileBody";
import type { Catalog } from "@/data/types";
import { byPrice, type BrowseTile } from "@/search/catalogBrowse";
import { color, space, type } from "@/design/tokens";
import { FRAME_MAX_WIDTH } from "./SearchResultsScreen";

const TITLES = {
  under999: "Under ₹999",
  luxury: "Luxury",
} as const;

export function BrowseScreen({
  catalog,
  filter,
  onSelectTile,
}: {
  catalog: Catalog;
  filter: "under999" | "luxury";
  onSelectTile: (tile: BrowseTile) => void;
}) {
  const tiles = byPrice(catalog, filter);
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, FRAME_MAX_WIDTH) / 2 - space.md - space.xs * 2;
  const size = { width: columnWidth, height: Math.round((columnWidth * 4) / 3) };

  return (
    <ScrollView style={styles.screen} testID="browse-screen">
      <Text style={styles.heading}>{TITLES[filter]}</Text>
      <Text style={styles.count}>{tiles.length} items</Text>
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.parent.parent_product_id}
            testID={`browse-tile-${tile.parent.parent_product_id}`}
            accessibilityRole="button"
            accessibilityLabel={`${tile.parent.brand} ${tile.colourway.display_name}`}
            accessibilityValue={{ text: String(tile.colourway.price) }}
            onPress={() => onSelectTile(tile)}
            style={styles.tile}
          >
            <ProductTileBody tile={tile} size={size} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  heading: { ...type.sectionHeader, color: color.textPrimary, paddingHorizontal: space.md, paddingTop: space.md },
  count: { ...type.body, color: color.textSecondary, paddingHorizontal: space.md, paddingBottom: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: space.sm },
  tile: { padding: space.xs, gap: 2 },
});
