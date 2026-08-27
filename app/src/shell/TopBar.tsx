import { Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";
import { MyntraMark } from "./MyntraMark";
import type { Screen } from "./nav";

/**
 * Three headers, chosen by screen.name.
 *
 * searchEntry renders nothing here: it has a live input and its own back
 * arrow (screenshot 2), and stacking that on top of this header is not what
 * the screenshot shows. That screen owns its own header elsewhere.
 */
export function TopBar({
  screen,
  onBack,
  onOpenSearch,
}: {
  screen: Screen;
  onBack: () => void;
  onOpenSearch: () => void;
}) {
  if (screen.name === "searchEntry") return null;
  if (screen.name === "home") return <HomeHeader onOpenSearch={onOpenSearch} />;
  return <BackHeader onBack={onBack} />;
}

function HomeHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <View style={styles.homeHeader} testID="home-header">
      <View style={styles.deliverRow}>
        <PinGlyph />
        <Text style={styles.deliverText} numberOfLines={1}>
          Deliver to <Text style={styles.deliverBold}>Home - 400001</Text>
        </Text>
        <ChevronDown />
        <View style={styles.walletPill} accessibilityRole="text" accessibilityLabel="Wallet balance ₹0">
          <Text style={styles.walletText}>₹0</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search for products"
          onPress={onOpenSearch}
          style={styles.searchField}
        >
          <MyntraMark size={18} />
          <Text style={styles.placeholder} numberOfLines={1}>
            "Earrings"
          </Text>
          <View style={styles.searchFieldIcons}>
            <MicGlyph />
            <CameraGlyph />
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => {}}
          style={styles.iconButton}
        >
          <BellGlyph />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wishlist"
          onPress={() => {}}
          style={styles.iconButton}
        >
          <Text style={styles.heartGlyph}>♡</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => {}}
          style={styles.iconButton}
        >
          <ProfileGlyph />
        </Pressable>
      </View>
    </View>
  );
}

function BackHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.backHeader} testID="back-header">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={styles.backButton}
      >
        <BackArrowGlyph />
      </Pressable>
    </View>
  );
}

// -- Glyphs, drawn from Views. No icon library; a shape composed from tokens
// carries the layout the same way an SVG would, without a font-glyph gamble.

function PinGlyph() {
  return (
    <View style={pin.wrap}>
      <View style={pin.head} />
      <View style={pin.tail} />
    </View>
  );
}

function ChevronDown() {
  return <View style={chevron.down} />;
}

function BackArrowGlyph() {
  return <View style={chevron.back} />;
}

function MicGlyph() {
  return (
    <View style={mic.wrap}>
      <View style={mic.capsule} />
      <View style={mic.stand} />
      <View style={mic.base} />
    </View>
  );
}

function CameraGlyph() {
  return (
    <View style={camera.wrap}>
      <View style={camera.bump} />
      <View style={camera.body}>
        <View style={camera.lens} />
      </View>
    </View>
  );
}

function BellGlyph() {
  return (
    <View style={bell.wrap}>
      <View style={bell.dome} />
      <View style={bell.base} />
      <View style={bell.clapper} />
    </View>
  );
}

function ProfileGlyph() {
  return (
    <View style={profile.wrap}>
      <View style={profile.head} />
      <View style={profile.shoulders} />
    </View>
  );
}

const styles = StyleSheet.create({
  homeHeader: {
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  deliverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  deliverText: {
    ...type.body,
    color: color.textPrimary,
    flexShrink: 1,
  },
  deliverBold: {
    fontWeight: "700",
  },
  walletPill: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  walletText: { ...type.chip, color: color.textPrimary, fontWeight: "700" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
  },
  placeholder: {
    ...type.body,
    color: color.textSecondary,
    flex: 1,
  },
  searchFieldIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  iconButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  heartGlyph: { fontSize: 20, color: color.textPrimary },
  backHeader: {
    backgroundColor: color.surface,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  backButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
});

const pin = StyleSheet.create({
  wrap: { width: 14, height: 16, alignItems: "center" },
  head: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.textSecondary,
  },
  tail: {
    width: 6,
    height: 6,
    marginTop: -4,
    backgroundColor: color.textSecondary,
    transform: [{ rotate: "45deg" }],
  },
});

const chevron = StyleSheet.create({
  down: {
    width: 7,
    height: 7,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: color.textSecondary,
    transform: [{ rotate: "45deg" }],
  },
  back: {
    width: 10,
    height: 10,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: color.textPrimary,
    transform: [{ rotate: "45deg" }],
  },
});

const mic = StyleSheet.create({
  wrap: { width: 14, height: 16, alignItems: "center" },
  capsule: {
    width: 8,
    height: 12,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: color.textSecondary,
  },
  stand: { width: 1.5, height: 3, backgroundColor: color.textSecondary },
  base: { width: 8, height: 1.5, backgroundColor: color.textSecondary },
});

const camera = StyleSheet.create({
  wrap: { width: 16, height: 14, alignItems: "center" },
  bump: {
    width: 5,
    height: 2,
    backgroundColor: color.textSecondary,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  body: {
    width: 16,
    height: 11,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: color.textSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  lens: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1.2,
    borderColor: color.textSecondary,
  },
});

const bell = StyleSheet.create({
  wrap: { width: 16, height: 18, alignItems: "center" },
  dome: {
    width: 12,
    height: 10,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: color.textPrimary,
  },
  base: { width: 16, height: 1.5, backgroundColor: color.textPrimary, marginTop: 1 },
  clapper: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.textPrimary,
    marginTop: 1,
  },
});

const profile = StyleSheet.create({
  wrap: { width: 16, height: 18, alignItems: "center", justifyContent: "flex-end" },
  head: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: color.textPrimary,
  },
  shoulders: {
    width: 16,
    height: 7,
    marginTop: 1,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: color.textPrimary,
  },
});
