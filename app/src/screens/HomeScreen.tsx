import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { BannerCarousel } from "@/components/home/BannerCarousel";
import { CategoryRail } from "@/components/home/CategoryRail";
import { PartnerStrip } from "@/components/home/PartnerStrip";
import { CATALOG_IMAGES } from "@/data/images";
import type { Catalog } from "@/data/types";
import { color, radius, space, type } from "@/design/tokens";
import { byGender, type BrowseTile, type CategoryKey, type GenderTab } from "@/search/catalogBrowse";
import { FRAME_MAX_WIDTH } from "@/screens/SearchResultsScreen";
import { formatPrice } from "@/copy/bundle";

const TABS: GenderTab[] = ["all", "men", "women", "kids"];

export interface HomeScreenProps {
  catalog: Catalog;
  onOpenSearch: () => void;
  onSelectCategory: (key: CategoryKey) => void;
  onSelectTile: (tile: BrowseTile) => void;
}

export function HomeScreen({ catalog, onOpenSearch, onSelectCategory, onSelectTile }: HomeScreenProps) {
  const [tab, setTab] = useState<GenderTab>("all");
  const tiles = useMemo(() => byGender(catalog, tab), [catalog, tab]);

  // Tile sizing is explicit rather than aspectRatio: on web, react-native-web
  // lets an Image's intrinsic 384x512 size win over aspectRatio, blowing out
  // tile height. Copied verbatim from SearchResultsScreen.tsx.
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, FRAME_MAX_WIDTH) / 2 - space.md - space.xs * 2;
  const tileSize = { width: columnWidth, height: Math.round((columnWidth * 4) / 3) };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="home-screen">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search for products"
        onPress={onOpenSearch}
        style={styles.searchBar}
      >
        <Text style={styles.searchGlyph}>⌕</Text>
        <Text style={styles.searchPlaceholder}>Search</Text>
      </Pressable>

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

      <CategoryRail onSelectCategory={onSelectCategory} />

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
            <Image
              source={CATALOG_IMAGES[tile.colourway.product_id]}
              style={[styles.gridImage, tileSize]}
              resizeMode="cover"
            />
            <Text style={styles.gridBrand} numberOfLines={1}>
              {tile.parent.brand.toUpperCase()}
            </Text>
            <Text style={styles.gridName} numberOfLines={1}>
              {tile.colourway.display_name}
            </Text>
            <Text style={styles.gridPrice}>{formatPrice(tile.colourway.price)}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingBottom: space.xl },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    margin: space.lg,
    paddingHorizontal: space.md,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    backgroundColor: color.surface,
  },
  searchGlyph: { fontSize: 18, color: color.textSecondary },
  searchPlaceholder: { ...type.body, color: color.textSecondary },
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
  gridImage: {
    borderRadius: radius.card - 6,
    backgroundColor: color.surfaceMuted,
  },
  gridBrand: { ...type.brand, color: color.textPrimary, marginTop: space.sm },
  gridName: { ...type.body, color: color.textSecondary, marginTop: 2 },
  gridPrice: { ...type.body, fontWeight: "700", color: color.textPrimary, marginTop: space.xs },
});
