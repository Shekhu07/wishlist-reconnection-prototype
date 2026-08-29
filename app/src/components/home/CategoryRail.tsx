import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATEGORIES, type CategoryKey } from "@/search/catalogBrowse";
import { MIN_TOUCH_TARGET, color, space, type } from "@/design/tokens";
import { CategoryGlyph } from "./CategoryGlyph";

const CIRCLE = 56;

export function CategoryRail({
  onSelectCategory,
}: {
  onSelectCategory: (key: CategoryKey) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="category-rail"
    >
      {CATEGORIES.map(({ key, label }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Browse ${label}`}
          onPress={() => onSelectCategory(key)}
          style={styles.item}
        >
          <View
            style={styles.circle}
            testID={`category-cover-${key}`}
            // The label below the circle already says where this goes; the
            // mark inside it would make a screen reader announce twice.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <CategoryGlyph category={key} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Scrolls rather than distributing: the spec's 18pt gutter at 56pt circles
  // overflows a 420pt frame at six categories, and a seventh would have had
  // nowhere to go.
  row: {
    gap: 18,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  item: {
    alignItems: "center",
    minWidth: CIRCLE,
    flexShrink: 0,
    gap: 6,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: color.surfaceMuted,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  label: { ...type.chip, fontWeight: "600", color: color.textPrimary },
});
