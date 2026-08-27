import { View, StyleSheet } from "react-native";
import { color } from "@/design/tokens";

/**
 * A drawn mark, not the trademark. Four strokes in brandPink reading as an M
 * at 20 pt. The tokens file transcribes Myntra's colours because the module
 * has to sit convincingly in that surface; the logo itself is not ours to
 * reproduce, and a shape carries the layout just as well.
 *
 * Decorative only: every call site nests this inside a control that already
 * carries its own accessible name ("Search for products", "Home"), so this
 * view is hidden from the accessibility tree rather than given a label that
 * would collide when two instances render in the same screen.
 */
export function MyntraMark({ size = 20 }: { size?: number }) {
  const stroke = Math.max(2, Math.round(size / 7));
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.mark, { width: size, height: size }]}
    >
      <View style={[styles.stroke, { width: stroke, height: size, left: 0 }]} />
      <View style={[styles.stroke, { width: stroke, height: size * 0.7, left: size * 0.36, top: size * 0.3 }]} />
      <View style={[styles.stroke, { width: stroke, height: size, right: 0 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: "relative" },
  stroke: { position: "absolute", top: 0, backgroundColor: color.brandPink, borderRadius: 1 },
});
