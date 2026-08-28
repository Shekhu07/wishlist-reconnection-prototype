import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  SUGGESTIONS_ORGANIC_HEADING,
  SUGGESTIONS_SAVED_HEADING,
} from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import type { Match } from "@/match/contract";
import type { SearchResult } from "@/search/localSearch";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * The typeahead, as two labelled groups: saved matches, then everything else.
 *
 * The composition happens *here* rather than inside `search()`, and that is the
 * whole design. `search()` takes no wishlist argument, and
 * `__tests__/search.test.ts` enforces FR-2 by reading the function's own source
 * for the words "wishlist", "saved" and "match" -- so wishlist priority cannot
 * be expressed inside the ranker even by accident. It is expressed as layout
 * instead: two groups, the saved one first, organic ranking untouched beneath.
 *
 * The saved group is also allowed to be absent. Organic suggestions come from
 * the local index synchronously; the saved group arrives through the match
 * client, fail-open and timeout-bounded, and simply does not render if it
 * misses. A dropdown that waited on matching would breach C-3 in the surface
 * where latency is most visible -- between two keystrokes.
 */

export interface SearchSuggestionsProps {
  /** Empty until the user types. */
  organic: SearchResult[];
  /** Empty when nothing matched, when it timed out, or when logged out. */
  saved: Match[];
  onOpenSaved: (sku: string) => void;
  onOpenProduct: (productId: number) => void;
}

export function SearchSuggestions({
  organic,
  saved,
  onOpenSaved,
  onOpenProduct,
}: SearchSuggestionsProps) {
  if (organic.length === 0 && saved.length === 0) return null;

  return (
    <View style={styles.panel} testID="search-suggestions">
      {saved.length > 0 ? (
        <View testID="suggestions-saved">
          <Text style={styles.heading}>
            <Text style={styles.heart}>♥ </Text>
            {SUGGESTIONS_SAVED_HEADING}
          </Text>
          {saved.map((match) => (
            <Pressable
              key={match.sku}
              testID={`suggestion-saved-${match.sku}`}
              accessibilityRole="button"
              accessibilityLabel={`${match.display.brand} ${match.display.name}, saved ${match.saved.color} ${match.saved.size}`}
              onPress={() => onOpenSaved(match.sku)}
              style={styles.row}
            >
              <Image
                source={CATALOG_IMAGES[match.display.imageId]}
                style={styles.thumb}
                resizeMode="cover"
              />
              <View style={styles.rowText}>
                <Text style={styles.brand} numberOfLines={1}>
                  {match.display.brand.toUpperCase()}
                </Text>
                <Text style={styles.name} numberOfLines={1}>
                  {match.display.name}
                </Text>
              </View>
              {/* The saved variant, because that is what distinguishes this
                  group from the one below it. */}
              <Text style={styles.savedChip}>
                {match.saved.color} · {match.saved.size}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {organic.length > 0 ? (
        <View testID="suggestions-organic">
          <Text style={styles.heading}>{SUGGESTIONS_ORGANIC_HEADING}</Text>
          {organic.map((result) => (
            <Pressable
              key={result.colourway.product_id}
              testID={`suggestion-organic-${result.colourway.product_id}`}
              accessibilityRole="button"
              accessibilityLabel={`${result.parent.brand} ${result.colourway.display_name}, ${result.colourway.colour}`}
              onPress={() => onOpenProduct(result.colourway.product_id)}
              style={styles.row}
            >
              <Image
                source={CATALOG_IMAGES[result.colourway.product_id]}
                style={styles.thumb}
                resizeMode="cover"
              />
              <View style={styles.rowText}>
                <Text style={styles.brand} numberOfLines={1}>
                  {result.parent.brand.toUpperCase()}
                </Text>
                <Text style={styles.name} numberOfLines={1}>
                  {result.colourway.display_name}
                </Text>
              </View>
              {/* No nested control here. A "search for this type" button
                  inside the row rendered a <button> inside a <button>, which
                  is invalid HTML and leaves keyboard and screen-reader users
                  with two overlapping targets and no way to tell them apart.
                  The row opens the product; that is the whole affordance. */}
              <Text style={styles.colour}>{result.colourway.colour}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.card,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
  },
  heading: {
    ...type.chip,
    fontWeight: "700",
    color: color.textSecondary,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  heart: { color: color.brandPink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  thumb: { width: 32, height: 42, borderRadius: 4, backgroundColor: color.surfaceMuted },
  rowText: { flex: 1 },
  brand: { ...type.chip, fontWeight: "700", color: color.textPrimary },
  name: { ...type.chip, color: color.textSecondary },
  savedChip: { ...type.chip, color: color.brandPink },
  colour: { ...type.chip, color: color.textSecondary },
});
