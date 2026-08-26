import { useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { MatchResponse } from "@/match/contract";
import { WishlistModule } from "@/components/WishlistModule";
import { formatPrice } from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import type { Catalog } from "@/data/types";
import { color, radius, space, type } from "@/design/tokens";
import { buildSearchIndex, search } from "@/search/localSearch";

/**
 * The host surface. The module sits directly beneath the sticky search field
 * and the filter/sort row, above the first row of the grid, inset 16 px, and
 * scrolls away with the results -- never sticky (section 4.2).
 *
 * The grid is rendered from `search()` alone. It does not read `matchResponse`,
 * which is what makes constraint C-3 structural rather than a promise: the
 * results cannot wait for a match call they never see.
 */

/** Kept in step with the phone frame in App.tsx. */
export const FRAME_MAX_WIDTH = 480;

export interface SearchResultsScreenProps {
  catalog: Catalog;
  query: string;
  matchResponse: MatchResponse | null;
  onDismiss: () => void;
  onUndo: () => void;
  onAction: (action: "primary" | "secondary", sku: string) => void;
  swapFills?: boolean;
}

export function SearchResultsScreen({
  catalog,
  query,
  matchResponse,
  onDismiss,
  onUndo,
  onAction,
  swapFills,
}: SearchResultsScreenProps) {
  const index = useMemo(() => buildSearchIndex(catalog), [catalog]);
  const results = useMemo(() => search(query, index), [query, index]);

  // The grid tile is sized explicitly rather than with aspectRatio: on web,
  // react-native-web lets the image's intrinsic 384x512 win, which rendered
  // every tile at full image height.
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, FRAME_MAX_WIDTH) / 2 - space.md - space.xs * 2;
  const tile = { width: columnWidth, height: Math.round((columnWidth * 4) / 3) };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="search-results"
    >
      <View style={styles.searchBar}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <Text style={styles.searchText} numberOfLines={1}>
          {query}
        </Text>
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>FILTER</Text>
        <View style={styles.filterDivider} />
        <Text style={styles.filterLabel}>SORT BY</Text>
        <Text style={styles.resultCount}>{results.length} items</Text>
      </View>

      {matchResponse ? (
        <WishlistModule
          response={matchResponse}
          onDismiss={onDismiss}
          onUndo={onUndo}
          onPrimary={(sku) => onAction("primary", sku)}
          onSecondary={(sku) => onAction("secondary", sku)}
          swapFills={swapFills}
        />
      ) : null}

      <View style={styles.grid}>
        {results.map((result) => (
          <View key={result.colourway.product_id} style={styles.gridItem}>
            <Image
              source={CATALOG_IMAGES[result.colourway.product_id]}
              style={[styles.gridImage, tile]}
              resizeMode="cover"
            />
            <Text style={styles.gridBrand} numberOfLines={1}>
              {result.parent.brand.toUpperCase()}
            </Text>
            <Text style={styles.gridName} numberOfLines={1}>
              {result.colourway.display_name}
            </Text>
            <Text style={styles.gridPrice}>{formatPrice(result.colourway.price)}</Text>
          </View>
        ))}
        {results.length === 0 ? (
          <Text style={styles.empty}>No results for “{query}”.</Text>
        ) : null}
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
  searchText: { ...type.body, fontSize: 14, color: color.textPrimary, flex: 1 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSubtle,
    marginBottom: space.md,
  },
  filterLabel: { ...type.body, fontWeight: "700", color: color.textPrimary },
  filterDivider: { width: 1, height: 14, backgroundColor: color.borderSubtle },
  resultCount: { ...type.body, color: color.textSecondary, marginLeft: "auto" },
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
  empty: { ...type.body, color: color.textSecondary, padding: space.lg },
});
