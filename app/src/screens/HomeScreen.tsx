import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { BannerCarousel } from "@/components/home/BannerCarousel";
import { CategoryRail } from "@/components/home/CategoryRail";
import { PartnerStrip } from "@/components/home/PartnerStrip";
import { ProductTileBody } from "@/components/catalog/ProductTileBody";
import type { Catalog } from "@/data/types";
import { color, radius, space, type } from "@/design/tokens";
import { overview, type BrowseTile, type CategoryKey, type GenderTab } from "@/search/catalogBrowse";
import { FRAME_MAX_WIDTH } from "@/screens/SearchResultsScreen";

const TABS: GenderTab[] = ["all", "men", "women", "kids"];

export interface HomeScreenProps {
  catalog: Catalog;
  onOpenSearch: () => void;
  onSelectCategory: (key: CategoryKey) => void;
  onSelectTile: (tile: BrowseTile) => void;
}

export function HomeScreen({ catalog, onOpenSearch, onSelectCategory, onSelectTile }: HomeScreenProps) {
  const [tab, setTab] = useState<GenderTab>("all");
  // overview, not byGender: same products, ordered so the top of the grid is
  // a cross-section of the shop instead of the first shelf in the file.
  const tiles = useMemo(() => overview(catalog, tab), [catalog, tab]);

  // Tile sizing is explicit rather than aspectRatio: on web, react-native-web
  // lets an Image's intrinsic 384x512 size win over aspectRatio, blowing out
  // tile height. Copied verbatim from SearchResultsScreen.tsx.
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, FRAME_MAX_WIDTH) / 2 - space.md - space.xs * 2;
  const tileSize = { width: columnWidth, height: Math.round((columnWidth * 4) / 3) };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="home-screen">
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityLabel={`Show ${t.toUpperCase()}`}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t ? styles.tabActive : null]}
          >
            <Text style={[styles.tabLabel, tab === t ? styles.tabLabelActive : null]}>
              {t.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <CategoryRail catalog={catalog} onSelectCategory={onSelectCategory} />

      <BannerCarousel />

      <PartnerStrip catalog={catalog} />

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.colourway.product_id}
            testID={`home-tile-${tile.parent.parent_product_id}`}
            accessibilityRole="button"
            style={styles.gridItem}
            onPress={() => onSelectTile(tile)}
          >
            <ProductTileBody tile={tile} size={tileSize} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingBottom: space.xl },
  tabRow: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  tab: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
  },
  tabActive: { backgroundColor: color.brandPink },
  tabLabel: { ...type.brand, color: color.textPrimary },
  tabLabelActive: { color: color.surface },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: space.md,
  },
  gridItem: { width: "50%", padding: space.xs, marginBottom: space.md },
});
