import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CATALOG_IMAGES } from "@/data/images";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * The home screen's reconnection teaser: a thumbnail, a count, and a way into
 * the Wishlist.
 *
 * Two constraints shape what this is allowed to say.
 *
 * The experiment first. This is a *second* wishlist surface, and the module in
 * search is the treatment the arms differ on. Rendering it for control would
 * hand control users the thing the experiment is measuring, so visibility is
 * decided by `wishlistSurfaceVisible` -- the same predicate transport.ts uses
 * to withhold the search module -- and the caller passes the answer in. This
 * component never decides for itself.
 *
 * Then C-1. The spec's copy is "N items waiting in your wishlist"; "waiting"
 * is doing work there, and the ResumeBar's own note names the failure mode --
 * a memory aid turning into a nag. The count and a neutral verb carry the same
 * information without the pressure, so the line states what is saved rather
 * than implying something is owed. No price, no discount, no urgency.
 */

export function WishlistTeaser({
  count,
  imageId,
  onOpen,
}: {
  count: number;
  /** The most recently saved item, purely as a thumbnail. */
  imageId: number | null;
  onOpen: () => void;
}) {
  if (count <= 0) return null;
  return (
    <Pressable
      testID="wishlist-teaser"
      accessibilityRole="button"
      accessibilityLabel={`Wishlist, ${count} ${count === 1 ? "item" : "items"} saved`}
      onPress={onOpen}
      style={styles.card}
    >
      {imageId === null ? null : (
        <Image
          source={CATALOG_IMAGES[imageId]}
          style={styles.thumb}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
      <View style={styles.copy}>
        <Text style={styles.headline} numberOfLines={1}>
          <Text style={styles.heart}>♥ </Text>
          {count} {count === 1 ? "item" : "items"} saved in your Wishlist
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          Pick up where you left off
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  thumb: {
    width: 44,
    height: 56,
    borderRadius: radius.tile,
    backgroundColor: color.surfaceMuted,
    flexShrink: 0,
  },
  copy: { flex: 1 },
  headline: { fontSize: 13, fontWeight: "700", color: color.textPrimary },
  heart: { color: color.brandPink },
  sub: { ...type.chip, fontWeight: "400", color: color.textSecondary, marginTop: 2 },
  chevron: { fontSize: 14, color: color.textSecondary },
});
