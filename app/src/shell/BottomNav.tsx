import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { color, space, type } from "@/design/tokens";
import type { Tab } from "./nav";
import { NavIcon, type NavIconName } from "./NavIcons";

// The design spec replaces the screenshot's text wordmarks ("fwd", "mnow",
// "LUXE") with drawn icons. The captions are unchanged: they are what the
// tabs are actually called, and they carry the accessible name.
const ITEMS: { tab: Tab; icon: NavIconName; caption: string }[] = [
  { tab: "home", icon: "home", caption: "Home" },
  { tab: "under999", icon: "tag", caption: "Under ₹999" },
  { tab: "search", icon: "clock", caption: "From 30 min" },
  { tab: "luxury", icon: "crown", caption: "Luxury" },
  { tab: "bag", icon: "bag", caption: "Bag" },
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
              <NavIcon
                name={item.icon}
                color={active ? color.brandPink : color.textPrimary}
              />
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
    paddingBottom:
      Platform.OS === "web" ? ("env(safe-area-inset-bottom)" as unknown as number) : space.sm,
  },
  item: {
    flex: 1,
    // The spec's 52pt row, which clears MIN_TOUCH_TARGET rather than
    // replacing it: 44 is the launch gate, 52 is the design.
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xs,
    gap: 3,
  },
  caption: { fontSize: 10, color: color.textSecondary },
  activeText: { color: color.brandPink },
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
