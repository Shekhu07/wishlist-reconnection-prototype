import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CategoryKey } from "@/search/catalogBrowse";
import { MIN_TOUCH_TARGET, color, space, type } from "@/design/tokens";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "fashion", label: "Fashion" },
  { key: "beauty", label: "Beauty" },
  { key: "kids", label: "Kids" },
  { key: "footwear", label: "Footwear" },
  { key: "accessories", label: "Accessories" },
  { key: "home", label: "Home" },
];

export function CategoryRail({
  onSelectCategory,
}: {
  onSelectCategory: (key: CategoryKey) => void;
}) {
  return (
    <View style={styles.row} testID="category-rail">
      {CATEGORIES.map(({ key, label }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Browse ${label}`}
          onPress={() => onSelectCategory(key)}
          style={styles.item}
        >
          <View style={styles.circle} />
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  item: {
    alignItems: "center",
    minWidth: MIN_TOUCH_TARGET,
    gap: space.xs,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.surfaceMuted,
  },
  label: { ...type.body, color: color.textPrimary },
});
