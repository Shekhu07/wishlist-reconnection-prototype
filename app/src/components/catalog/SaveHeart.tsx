import { Pressable, StyleSheet, Text } from "react-native";
import { color } from "@/design/tokens";
import type { BrowseTile } from "@/search/catalogBrowse";

/**
 * The save/unsave heart on a product tile.
 *
 * It is deliberately *not* part of ProductTileBody. Every grid screen wraps
 * the tile in a Pressable that opens the product, so a heart rendered inside
 * that body would be a button nested inside a button: invalid HTML, and two
 * overlapping targets a keyboard user cannot separate. This codebase has
 * already found that exact defect once, in the search suggestion row, and it
 * is invisible to a test renderer.
 *
 * So it is a sibling of the tile's Pressable, positioned over the image. The
 * caller supplies the inset because each grid pads its cell differently and
 * the heart has to land on the image's corner, not the cell's.
 */
export function SaveHeart({
  tile,
  saved,
  onToggle,
  inset = 6,
}: {
  tile: BrowseTile;
  saved: boolean;
  onToggle: () => void;
  inset?: number;
}) {
  const { parent, colourway } = tile;
  return (
    <Pressable
      testID={`save-${colourway.product_id}`}
      accessibilityRole="button"
      accessibilityLabel={
        saved
          ? `Remove ${parent.brand} ${colourway.display_name} from Wishlist`
          : `Save ${parent.brand} ${colourway.display_name} to Wishlist`
      }
      accessibilityState={{ selected: saved }}
      // The glyph box is 24pt; the slop brings the target to C-7's 44.
      hitSlop={10}
      onPress={onToggle}
      style={[styles.heart, { top: inset, right: inset }]}
    >
      <Text style={[styles.glyph, saved && styles.glyphSaved]}>
        {saved ? "♥" : "♡"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    zIndex: 1,
  },
  glyph: { fontSize: 15, color: color.textPrimary },
  glyphSaved: { color: color.brandPink },
});
