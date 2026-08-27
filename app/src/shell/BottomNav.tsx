import { Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, color, space, type } from "@/design/tokens";
import type { Tab } from "./nav";
import { MyntraMark } from "./MyntraMark";

// The "From 30 min" wordmark reads "mnow" in the screenshot, not "now" --
// deviation from the brief's literal code, corrected against the source image.
const ITEMS: { tab: Tab; label: string; caption: string }[] = [
  { tab: "home", label: "Home", caption: "Home" },
  { tab: "under999", label: "fwd", caption: "Under ₹999" },
  { tab: "search", label: "mnow", caption: "From 30 min" },
  { tab: "luxury", label: "LUXE", caption: "Luxury" },
  { tab: "bag", label: "Bag", caption: "Bag" },
];

export function BottomNav({
  tab,
  bagCount,
  onTab,
}: {
  tab: Tab;
  bagCount: number;
  onTab: (tab: Tab) => void;
}) {
  return (
    <View style={styles.bar} testID="bottom-nav">
      {ITEMS.map((item) => {
        const active = item.tab === tab;
        return (
          <Pressable
            key={item.tab}
            accessibilityRole="button"
            accessibilityLabel={item.caption}
            accessibilityState={{ selected: active }}
            onPress={() => onTab(item.tab)}
            style={styles.item}
          >
            <View>
              {item.tab === "home" ? (
                <MyntraMark size={16} />
              ) : item.tab === "bag" ? (
                <View style={styles.bagGlyph}>
                  <View style={styles.bagBody} />
                  <View style={styles.bagHandle} />
                </View>
              ) : (
                <Text style={[styles.glyph, active && styles.activeText]}>{item.label}</Text>
              )}
              {item.tab === "bag" && bagCount > 0 ? (
                <View style={styles.badge} testID="bag-badge">
                  <Text style={styles.badgeText}>{bagCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.caption, active && styles.activeText]}>{item.caption}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
    backgroundColor: color.surface,
    // Clears the home indicator on a phone browser. See Task 14.
    paddingBottom: space.sm,
  },
  item: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xs,
    gap: 2,
  },
  glyph: { ...type.brand, color: color.textPrimary },
  caption: { ...type.chip, color: color.textSecondary },
  activeText: { color: color.brandPink },
  bagGlyph: { width: 18, height: 16, alignItems: "center" },
  bagBody: {
    width: 16,
    height: 12,
    borderWidth: 1.5,
    borderColor: color.textPrimary,
    borderRadius: 2,
    marginTop: 4,
  },
  bagHandle: {
    position: "absolute",
    top: 0,
    width: 8,
    height: 6,
    borderWidth: 1.5,
    borderColor: color.textPrimary,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -12,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brandPink,
  },
  badgeText: { ...type.chip, fontSize: 10, color: color.surface, fontWeight: "700" },
});
