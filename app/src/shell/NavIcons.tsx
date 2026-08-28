import { StyleSheet, View } from "react-native";

/**
 * The bottom-nav icon set from the design spec, drawn from Views.
 *
 * No icon library and no font glyphs, for the reason TopBar already gives:
 * a shape composed from tokens carries the layout the same way an SVG would,
 * without a font-glyph gamble. The spec draws each of these as absolutely
 * positioned boxes inside a 20pt square, and these are transcriptions of it.
 *
 * Every icon takes its colour from the caller so the active tab tints the
 * whole control, and each is decorative -- the Pressable around it carries
 * the accessible name.
 */

export type NavIconName = "home" | "tag" | "clock" | "crown" | "bag";

export function NavIcon({ name, color }: { name: NavIconName; color: string }) {
  return (
    <View
      style={styles.frame}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === "home" ? <HomeIcon color={color} /> : null}
      {name === "tag" ? <TagIcon color={color} /> : null}
      {name === "clock" ? <ClockIcon color={color} /> : null}
      {name === "crown" ? <CrownIcon color={color} /> : null}
      {name === "bag" ? <BagIcon color={color} /> : null}
    </View>
  );
}

function HomeIcon({ color }: { color: string }) {
  return (
    <>
      <View
        style={[styles.abs, { left: 2, top: 6, width: 16, height: 12, borderWidth: 1.6, borderTopWidth: 0, borderColor: color }]}
      />
      <View
        style={[
          styles.abs,
          {
            left: 1,
            top: 3,
            width: 0,
            height: 0,
            borderLeftWidth: 9,
            borderRightWidth: 9,
            borderBottomWidth: 8,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: color,
          },
        ]}
      />
    </>
  );
}

function TagIcon({ color }: { color: string }) {
  return (
    <>
      <View
        style={[
          styles.abs,
          {
            left: 2,
            top: 2,
            width: 15,
            height: 15,
            borderWidth: 1.6,
            borderColor: color,
            borderRadius: 3,
            transform: [{ rotate: "45deg" }],
          },
        ]}
      />
      <View style={[styles.abs, { left: 7, top: 7, width: 4, height: 4, borderRadius: 2, backgroundColor: color }]} />
    </>
  );
}

function ClockIcon({ color }: { color: string }) {
  return (
    <>
      <View style={[styles.abs, { left: 1, top: 1, width: 17, height: 17, borderWidth: 1.6, borderColor: color, borderRadius: 9 }]} />
      <View style={[styles.abs, { left: 9, top: 5, width: 1.6, height: 6, backgroundColor: color }]} />
      <View style={[styles.abs, { left: 9, top: 10, width: 5, height: 1.6, backgroundColor: color }]} />
    </>
  );
}

function CrownIcon({ color }: { color: string }) {
  const point = (left: number, top: number, height: number) => ({
    ...styles.abs,
    left,
    top,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: height,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: color,
  });
  return (
    <>
      <View style={[styles.abs, { left: 1, top: 6, width: 17, height: 10, borderWidth: 1.6, borderTopWidth: 0, borderColor: color }]} />
      <View style={point(1, 3, 6)} />
      <View style={point(8, 1, 7)} />
      <View style={point(14, 3, 6)} />
    </>
  );
}

function BagIcon({ color }: { color: string }) {
  return (
    <>
      <View style={[styles.abs, { left: 2, top: 6, width: 16, height: 12, borderWidth: 1.6, borderColor: color, borderRadius: 2 }]} />
      <View
        style={[
          styles.abs,
          {
            left: 6,
            top: 2,
            width: 8,
            height: 6,
            borderWidth: 1.6,
            borderBottomWidth: 0,
            borderColor: color,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  frame: { width: 20, height: 20, position: "relative" },
  abs: { position: "absolute" },
});
