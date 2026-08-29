import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { MatchResponse } from "@/match/contract";
import { WishlistModule } from "@/components/WishlistModule";
import { ProductTileBody } from "@/components/catalog/ProductTileBody";
import { SaveHeart } from "@/components/catalog/SaveHeart";
import type { BrowseTile } from "@/search/catalogBrowse";
import type { Catalog } from "@/data/types";
import { FRAME_MAX_WIDTH, color,
  elevation, radius, space, type } from "@/design/tokens";
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
/** Re-exported for the screens that already import it from here. */
export { FRAME_MAX_WIDTH } from "@/design/tokens";

export interface SearchResultsScreenProps {
  catalog: Catalog;
  /** Absent leaves the grid read-only: no heart is drawn at all. */
  savedProductIds?: Set<number>;
  onToggleSave?: (tile: BrowseTile) => void;
  query: string;
  matchResponse: MatchResponse | null;
  onDismiss: () => void;
  onUndo: () => void;
  /** E16: durable per-item hide, offered after a dismissal. */
  onHideForever?: (sku: string) => void;
  /** Raises DC-02; the shell owns the sheet. */
  onWhy?: () => void;
  /** Bumped when a dismissal is raised from the DC-02 sheet. */
  externalDismiss?: number;
  intentFor?: (sku: string) => string | null;
  /** Opens an ordinary catalog product. Tiles did not respond to taps at all. */
  onOpenProduct?: (productId: number) => void;
  /** Improvement 9: later-phase, off by default, rendered below the module. */
  lookCompletion?: ReactNode;
  /**
   * CR-02's resume bar.
   *
   * Rendered above the Wishlist module and below the filter row, and it scrolls
   * away with the results -- the wireframes ask for a quiet re-entry point in
   * the Search context, not a sticky element competing with search itself.
   */
  resumeBar?: ReactNode;
  onAction: (action: "primary" | "secondary", sku: string) => void;
  /**
   * Where the results were scrolled to when the user last left them, and a
   * setter to record it.
   *
   * Improvement 3 asks that the search query *and result position* survive a
   * return from the saved product. The query already did, via SearchContext;
   * the position did not, because this screen is unmounted on navigation and
   * remounts at the top. Owned by App so it outlives the unmount.
   */
  scrollOffset?: number;
  onScrollOffset?: (offset: number) => void;
  swapFills?: boolean;
}

export function SearchResultsScreen({
  catalog,
  query,
  matchResponse,
  onDismiss,
  onUndo,
  onHideForever,
  onWhy,
  externalDismiss,
  intentFor,
  onOpenProduct,
  resumeBar,
  lookCompletion,
  onAction,
  scrollOffset = 0,
  onScrollOffset,
  swapFills,
  savedProductIds,
  onToggleSave,
}: SearchResultsScreenProps) {
  const index = useMemo(() => buildSearchIndex(catalog), [catalog]);
  const results = useMemo(() => search(query, index), [query, index]);

  // The grid tile is sized explicitly rather than with aspectRatio: on web,
  // react-native-web lets the image's intrinsic 384x512 win, which rendered
  // every tile at full image height.
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, FRAME_MAX_WIDTH) / 2 - space.md - space.xs * 2;
  const tile = { width: columnWidth, height: Math.round((columnWidth * 4) / 3) };

  const scroller = useRef<ScrollView | null>(null);

  // Restored after the content has been laid out, or there is nothing to
  // scroll to yet and the offset is silently clamped to zero.
  const restore = useCallback(() => {
    if (scrollOffset > 0) scroller.current?.scrollTo({ y: scrollOffset, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView
      ref={scroller}
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="search-results"
      onContentSizeChange={restore}
      onScroll={(event) => onScrollOffset?.(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
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

      {/* Above the module and outside its conditional: a comparison can be
          resumable on a search that surfaces no saved item at all, and the
          re-entry point disappearing in that case would be arbitrary. */}
      {resumeBar}

      {matchResponse ? (
        <WishlistModule
          response={matchResponse}
          onDismiss={onDismiss}
          onUndo={onUndo}
          onHideForever={onHideForever}
          onWhy={onWhy}
          intentFor={intentFor}
          externalDismiss={externalDismiss}
          onPrimary={(sku) => onAction("primary", sku)}
          onSecondary={(sku) => onAction("secondary", sku)}
          swapFills={swapFills}
        />
      ) : null}

      {lookCompletion}

      <View style={styles.grid}>
        {results.map((result) => (
          <View key={result.colourway.product_id} style={styles.gridItem}>
            <Pressable
              testID={`result-tile-${result.colourway.product_id}`}
              accessibilityRole="button"
              accessibilityLabel={`${result.parent.brand} ${result.colourway.display_name}, ${result.colourway.colour}`}
              onPress={() => onOpenProduct?.(result.colourway.product_id)}
              style={styles.gridCard}
            >
              <ProductTileBody tile={result} size={tile} />
            </Pressable>
            {onToggleSave ? (
              <SaveHeart
                tile={result}
                saved={savedProductIds?.has(result.colourway.product_id) ?? false}
                onToggle={() => onToggleSave(result)}
                inset={space.xs + 6}
              />
            ) : null}
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
  screen: { flex: 1, backgroundColor: color.pageGround },
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
  // The cell keeps the gutter; the card inside it is what sits on the page.
  gridItem: { width: "50%", padding: space.xs, marginBottom: space.md },
  gridCard: {
    borderRadius: radius.card,
    backgroundColor: color.surface,
    padding: space.sm,
    ...elevation.card,
  },
  empty: { ...type.body, color: color.textSecondary, padding: space.lg },
});
