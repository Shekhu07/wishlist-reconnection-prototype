import { Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

export interface RecentSearchesProps {
  recents: string[];
  onSubmit: (query: string) => void;
  onClearRecents: () => void;
}

/** Omits the whole section when there are no recents -- a heading over
 * nothing is a visible defect, not a reasonable empty state. */
export function RecentSearches({ recents, onSubmit, onClearRecents }: RecentSearchesProps) {
  if (recents.length === 0) return null;

  return (
    <View style={styles.wrap} testID="recent-searches">
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Recent searches</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear All"
          onPress={onClearRecents}
          style={styles.clearButton}
        >
          <Text style={styles.clearText}>Clear All</Text>
        </Pressable>
      </View>
      <View style={styles.chipRow}>
        {recents.map((term) => (
          <Pressable
            key={term}
            accessibilityRole="button"
            accessibilityLabel={`Search again for ${term}`}
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

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingVertical: space.md },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { ...type.moduleHeader, color: color.textPrimary },
  clearButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  clearText: { ...type.chip, color: color.textSecondary, fontWeight: "700" },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.sm,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    backgroundColor: color.surface,
  },
  chipText: { ...type.body, color: color.textPrimary },
});
