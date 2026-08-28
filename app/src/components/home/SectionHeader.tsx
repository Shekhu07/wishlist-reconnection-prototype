import { Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, color, space, type } from "@/design/tokens";

/**
 * "Shop by Brand", "Trending Now" -- a rail title with an optional SEE ALL.
 *
 * SEE ALL is only rendered when a caller passes an action for it. The spec
 * draws it on both rails, but an affordance wired to nothing reads as a broken
 * control, and this shell has already shipped that defect once (the home
 * header's heart). A rail with nowhere to go gets a title and no link.
 */
export function SectionHeader({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`See all ${title}`}
          onPress={onSeeAll}
          style={styles.action}
        >
          <Text style={styles.actionText}>SEE ALL</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  title: { ...type.railHeader, color: color.textPrimary },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingLeft: space.md,
  },
  actionText: { ...type.railAction, color: color.brandPink },
});
