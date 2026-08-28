import { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="category-rail"
    >
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
    // Squares clipped to a circle: without this the 3:4 photo renders as a
    // rectangle sitting on top of the rail.
    overflow: "hidden",
  },
  cover: { width: "100%", height: "100%" },
  label: { ...type.chip, fontWeight: "600", color: color.textPrimary },
});
