import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Catalog } from "@/data/types";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * Suggested queries, for the search screen before the user has any history.
 *
 * `RecentSearches` renders nothing when there are no recents, which is right
 * -- a heading over nothing is a defect -- but it left a first-time search
 * screen half empty below the fold, which is its own kind of defect. This
 * fills that space with the one thing that is genuinely useful there: queries
 * that are known to return something.
 *
 * Derived from the catalog rather than written down, so a term can never
 * suggest a search that comes back empty. Brand + article type, because that
 * is the shape the matcher parses best and the shape a shopper actually types.
 */
export interface TrySearchingProps {
  catalog: Catalog;
  onSubmit: (query: string) => void;
  /** Hidden once the user has history of their own -- that is better than this. */
  hidden?: boolean;
}

const MAX_TERMS = 7;

export function TrySearching({ catalog, onSubmit, hidden = false }: TrySearchingProps) {
  const terms = useMemo(() => suggestedTerms(catalog), [catalog]);
  if (hidden || terms.length === 0) return null;

  return (
    <View style={styles.wrap} testID="try-searching">
      <Text style={styles.heading}>TRY SEARCHING</Text>
      <View style={styles.chipRow}>
        {terms.map((term) => (
          <Pressable
            key={term}
            testID={`try-${term.replace(/\s+/g, "-").toLowerCase()}`}
            accessibilityRole="button"
            accessibilityLabel={`Search for ${term}`}
            onPress={() => onSubmit(term)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{term}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * One term per article type, each from the brand with the most colourways in
 * it -- a deterministic pick, so the chips do not reshuffle between renders,
 * and a well-stocked one, so the result page is never a single lonely tile.
 *
 * Home furnishing is left out: the synthetic range is not what this screen is
 * for, and suggesting it would put invented products in front of a
 * participant as a recommendation.
 */
export function suggestedTerms(catalog: Catalog): string[] {
  const byType = new Map<string, Map<string, number>>();
  for (const parent of catalog.parents) {
    if (parent.masterCategory === "Home") continue;
    const brands = byType.get(parent.articleType) ?? new Map<string, number>();
    brands.set(parent.brand, (brands.get(parent.brand) ?? 0) + parent.colourways.length);
    byType.set(parent.articleType, brands);
  }

  const terms: string[] = [];
  for (const [articleType, brands] of [...byType.entries()].sort()) {
    let best: [string, number] | null = null;
    for (const entry of brands) {
      // Ties break on the brand name so the pick never depends on Map order.
      if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] < best[0])) {
        best = entry;
      }
    }
    if (best) terms.push(`${best[0]} ${articleType}`.toLowerCase());
  }
  return terms.slice(0, MAX_TERMS);
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingVertical: space.md },
  heading: { ...type.tileBrand, letterSpacing: 0.4, color: color.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    backgroundColor: color.surface,
  },
  chipText: { ...type.body, color: color.textPrimary },
});
