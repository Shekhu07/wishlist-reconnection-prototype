import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { BannerCarousel } from "@/components/home/BannerCarousel";
import { BrandStrip } from "@/components/home/BrandStrip";
import { CategoryRail } from "@/components/home/CategoryRail";
import { SaleStrip } from "@/components/home/SaleStrip";
import { SectionHeader } from "@/components/home/SectionHeader";
import { WishlistTeaser } from "@/components/home/WishlistTeaser";
import { ProductTileBody } from "@/components/catalog/ProductTileBody";
import { SaveHeart } from "@/components/catalog/SaveHeart";
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
  onSelectBrand: (brand: string) => void;
  /**
   * The reconnection teaser. Absent means the arm withholds wishlist surfaces
   * (see experiment/surfaces.ts) -- not that the user has saved nothing.
   */
  wishlist?: { count: number; imageId: number | null; onOpen: () => void };
  /** Absent leaves the grid read-only: no heart is drawn at all. */
  savedProductIds?: Set<number>;
  onToggleSave?: (tile: BrowseTile) => void;
}

export function HomeScreen({
  catalog,
  onOpenSearch,
  onSelectCategory,
  onSelectTile,
  onSelectBrand,
  wishlist,
  savedProductIds,
  onToggleSave,
}: HomeScreenProps) {
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityLabel={`Show ${t.toUpperCase()}`}
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t ? styles.tabActive : null]}
          >
            <Text style={[styles.tabLabel, tab === t ? styles.tabLabelActive : null]}>
              {t.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <CategoryRail catalog={catalog} onSelectCategory={onSelectCategory} />

      <BannerCarousel />

      <SectionHeader title="Shop by Brand" />
      <BrandStrip catalog={catalog} onSelectBrand={onSelectBrand} />

      <SaleStrip />

      {wishlist ? (
        <WishlistTeaser
          count={wishlist.count}
          imageId={wishlist.imageId}
          onOpen={wishlist.onOpen}
        />
      ) : null}

      <SectionHeader title="Trending Now" />

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <View key={tile.colourway.product_id} style={styles.gridItem}>
            <Pressable
              testID={`home-tile-${tile.parent.parent_product_id}`}
              accessibilityRole="button"
              accessibilityLabel={`${tile.parent.brand} ${tile.colourway.display_name}`}
              onPress={() => onSelectTile(tile)}
            >
              <ProductTileBody tile={tile} size={tileSize} />
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
  content: { paddingBottom: space.xl },
  tabRow: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  tab: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
    flexShrink: 0,
  },
  tabLabel: { ...type.tileBrand, letterSpacing: 0.4, color: color.textPrimary },
  tabActive: { backgroundColor: color.brandPink },
  tabLabelActive: { color: color.surface },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  gridItem: { width: "50%", padding: space.xs, marginBottom: space.md },
});
