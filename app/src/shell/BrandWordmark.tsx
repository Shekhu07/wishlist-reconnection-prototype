import { Platform, StyleSheet, Text, View } from "react-native";
import { color, space, spec } from "@/design/tokens";

/**
 * The `wear.io` wordmark from the design spec: a gradient badge holding a
 * white teardrop, beside the name in italic.
 *
 * The badge is a linear gradient, which React Native has no primitive for.
 * Rather than pull in expo-linear-gradient for one 26pt square, the CSS value
 * is cast through on web the same way BottomNav casts
 * `env(safe-area-inset-bottom)`. Native falls back to the gradient's first
 * stop, which is brandPink -- the mark reads correctly, just flat.
 *
 * Decorative: the header row that holds this already carries its own labels,
 * so an accessible name here would be announced twice.
 */
export function BrandWordmark() {
  return (
    <View
      style={styles.row}
      testID="brand-wordmark"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.badge}>
        <View style={styles.drop} />
      </View>
      <Text style={styles.wordmark}>wear.io</Text>
    </View>
  );
}

const GRADIENT = `linear-gradient(135deg, ${spec.logoGradientFrom}, ${spec.logoGradientTo})`;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: spec.logoGradientFrom,
    ...(Platform.OS === "web"
      ? ({ backgroundImage: GRADIENT } as unknown as object)
      : null),
  },
  drop: {
    width: 11,
    height: 11,
    backgroundColor: color.surface,
    // "50% 50% 50% 0" in the spec: round on three corners, square on the
    // fourth, then rotated so the square corner points down-left.
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 0,
    transform: [{ rotate: "45deg" }],
  },
  wordmark: {
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    color: color.brandPink,
    letterSpacing: -0.5,
  },
});
