import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Catalog } from "@/data/types";
import { CATALOG_IMAGES } from "@/data/images";
import { CATEGORIES, categoryCover, type CategoryKey } from "@/search/catalogBrowse";
import { MIN_TOUCH_TARGET, color, space, type } from "@/design/tokens";

const CIRCLE = 56;

export function CategoryRail({
  catalog,
  onSelectCategory,
}: {
  catalog: Catalog;
  onSelectCategory: (key: CategoryKey) => void;
}) {
  const covers = useMemo(
    () =>
      CATEGORIES.map(({ key, label }) => ({
        key,
        label,
        cover: categoryCover(catalog, key),
      })),
    [catalog]
  );

  return (
    <View style={styles.row} testID="category-rail">
      {covers.map(({ key, label, cover }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Browse ${label}`}
          onPress={() => onSelectCategory(key)}
          style={styles.item}
        >
          <View style={styles.circle}>
            {cover === null ? null : (
              <Image
                testID={`category-cover-${key}`}
                source={CATALOG_IMAGES[cover]}
                style={styles.cover}
                resizeMode="cover"
                // The label below the circle already says where this goes; an
                // image alt here would make every circle announce twice.
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            )}
          </View>
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
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: color.surfaceMuted,
    // Squares clipped to a circle: without this the 3:4 photo renders as a
    // rectangle sitting on top of the rail.
    overflow: "hidden",
  },
  cover: { width: "100%", height: "100%" },
  label: { ...type.body, color: color.textPrimary },
});
