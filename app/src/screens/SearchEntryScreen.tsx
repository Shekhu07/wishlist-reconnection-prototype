import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AskMayaStrip } from "@/components/home/AskMayaStrip";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { RecentSearches } from "@/components/home/RecentSearches";
import { TrySearching } from "@/components/home/TrySearching";
import type { Catalog } from "@/data/types";
import type { Match } from "@/match/contract";
import { buildSearchIndex, search } from "@/search/localSearch";
import { SearchSuggestions } from "@/components/SearchSuggestions";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

export interface SearchEntryScreenProps {
  catalog: Catalog;
  /**
   * The saved group for the typeahead. Owned by the caller because it comes
   * from the match client, which is auth-gated, suppressible and fail-open --
   * none of which this screen should know about.
   */
  savedSuggestions?: Match[];
  onQueryChange?: (query: string) => void;
  onOpenSaved?: (sku: string) => void;
  onOpenProduct?: (productId: number) => void;
  /** Prior search terms, most recent first. Caller's job to order/persist. */
  recents: string[];
  onSubmit: (query: string) => void;
  onClearRecents: () => void;
  onBack: () => void;
  /** Fired by every voice/image/camera search affordance -- none are wired. */
  onNotImplemented: () => void;
}

export function SearchEntryScreen({
  catalog,
  savedSuggestions = [],
  onQueryChange,
  onOpenSaved,
  onOpenProduct,
  recents,
  onSubmit,
  onClearRecents,
  onBack,
  onNotImplemented,
}: SearchEntryScreenProps) {
  const [value, setValue] = useState("");

  // Organic suggestions are synchronous and local. They never wait on the
  // match call, which is the same rule the results grid follows (C-3).
  const index = useMemo(() => buildSearchIndex(catalog), [catalog]);
  const organic = useMemo(() => {
    if (value.trim().length < 2) return [];
    // One row per product. `search()` ranks colourways, so two colours of the
    // same shirt render as two identical-looking rows and fill half a
    // four-row dropdown with the same suggestion -- the same de-duplication
    // `match/ranking.ts` applies to the module, for the same reason.
    const seen = new Set<string>();
    const deduped = [];
    for (const result of search(value, index, 24)) {
      if (seen.has(result.parent.parent_product_id)) continue;
      seen.add(result.parent.parent_product_id);
      deduped.push(result);
      if (deduped.length === 4) break;
    }
    return deduped;
  }, [value, index]);

  const change = (next: string) => {
    setValue(next);
    onQueryChange?.(next);
  };

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="search-entry">
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>

        <View style={styles.inputWrap}>
          <TextInput
            accessibilityLabel="Search for products"
            autoFocus
            returnKeyType="search"
            value={value}
            onChangeText={change}
            onSubmitEditing={submit}
            placeholder="Search for products, brands and more"
            placeholderTextColor={color.textSecondary}
            style={styles.input}
          />
          {value.length > 0 ? (
            <Pressable
              testID="search-clear"
              accessibilityRole="button"
              accessibilityLabel="Clear search input"
              onPress={() => change("")}
              style={styles.clearButton}
            >
              <Text style={styles.clearGlyph}>✕</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="search-go"
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={submit}
            style={styles.goButton}
          >
            <Text style={styles.goText}>Go</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search by voice"
          onPress={onNotImplemented}
          style={styles.iconButton}
        >
          <Text style={styles.iconGlyph}>🎤</Text>
        </Pressable>
      </View>

      {/* Above recents, because it answers the question being typed right now.
          Renders nothing until there is something to say. */}
      <SearchSuggestions
        organic={organic}
        saved={savedSuggestions}
        onOpenSaved={(sku) => onOpenSaved?.(sku)}
        onOpenProduct={(productId) => onOpenProduct?.(productId)}
      />

      <RecentSearches recents={recents} onSubmit={onSubmit} onClearRecents={onClearRecents} />

      {/* Only before the user has history of their own: their own recents are
          better than our suggestions, and stacking both is two chip rows
          saying nearly the same thing. */}
      <TrySearching catalog={catalog} onSubmit={onSubmit} hidden={recents.length > 0} />

      <AskMayaStrip />

      <BrandCarousel catalog={catalog} onSubmit={onSubmit} />

      <View style={styles.pillRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search by image"
          onPress={onNotImplemented}
          style={styles.pill}
        >
          <Text style={styles.pillText}>Search by image</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search with camera"
          onPress={onNotImplemented}
          style={styles.pill}
        >
          <Text style={styles.pillText}>Search with camera</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingBottom: space.xl },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  backButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontSize: 24, color: color.textPrimary },
  // The spec puts the active field in brandPink at radius 8, not the pill the
  // home header uses: this one is focused and being typed into, and reading
  // differently from the dormant field is the point.
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.brandPink,
    backgroundColor: color.surface,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: color.textPrimary,
    padding: 0,
    // The wrapper already draws a pink focus border around this field. On web
    // the browser drew its own blue ring *inside* that, which is the one piece
    // of unstyled chrome visible in the whole app -- and it is the search
    // field, which is the first thing anyone taps. Removing it is only safe
    // because the wrapper's border is the visible focus affordance.
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as object) : null),
  },
  clearButton: {
    minHeight: MIN_TOUCH_TARGET,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  clearGlyph: { fontSize: 13, color: color.textSecondary, fontWeight: "700" },
  goButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingLeft: space.sm,
  },
  goText: { fontSize: 13, fontWeight: "700", color: color.brandPink },
  iconButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: { fontSize: 18 },
  pillRow: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  pill: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  pillText: { ...type.chip, color: color.textPrimary, fontWeight: "700" },
});
