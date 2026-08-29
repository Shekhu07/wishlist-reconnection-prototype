import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { FadeIn } from "./FadeIn";
import { LOOK_HEADING, LOOK_NOTE, LOOK_SIZE_GONE } from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";
import type { LookSuggestion } from "@/wishlist/lookCompletion";

/**
 * Improvement 9, kept as sparse as the prompt demands.
 *
 * Four items at the very most (`MAX_LOOK_SUGGESTIONS`), drawn only from what
 * the user already saved, with a reason derived from the slot pairing rather
 * than written for effect. It carries its own later-phase label because it is
 * not part of the primary experiment and should never be mistaken for it.
 *
 * Four wrap into two columns rather than squeezing a fourth card into the one
 * row that held two: a 48px thumbnail beside a brand, a name and a reason
 * does not survive being given a quarter of a phone's width, and a strip that
 * has gone unreadable is not sparse, it is just small.
 *
 * There is still no "add all to bag" and no carousel, because the instruction
 * is explicit: do not add complementary products solely to increase basket
 * size. Everything here the user chose once already; the strip only reminds
 * them the rest of the outfit is in their own Wishlist.
 */

export interface LookStripProps {
  suggestions: LookSuggestion[];
  onOpen: (itemId: string) => void;
  /** Search says "to go with this"; a product page names the look. */
  heading?: string;
  /** The later-phase note is for Search; the PDP section is a real feature. */
  note?: string | null;
}

export function LookStrip({
  suggestions,
  onOpen,
  heading = LOOK_HEADING,
  note = LOOK_NOTE,
}: LookStripProps) {
  if (suggestions.length === 0) return null;

  return (
    <FadeIn style={styles.strip} testID="look-strip">
      <Text style={styles.heading}>{heading}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.row}>
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion.item.item_id}
            testID={`look-${suggestion.item.item_id}`}
            accessibilityRole="button"
            accessibilityLabel={`${suggestion.parent.brand} ${suggestion.parent.display_name}, saved ${suggestion.item.colour} ${suggestion.item.size}. ${suggestion.reason}${
              suggestion.buyable ? "" : `. ${LOOK_SIZE_GONE}`
            }`}
            onPress={() => onOpen(suggestion.item.item_id)}
            style={styles.card}
          >
            <Image
              source={CATALOG_IMAGES[suggestion.item.product_id]}
              style={styles.thumb}
              resizeMode="cover"
            />
            <View style={styles.details}>
              <Text style={styles.brand} numberOfLines={1}>
                {suggestion.parent.brand.toUpperCase()}
              </Text>
              <Text style={styles.name} numberOfLines={1}>
                {suggestion.parent.display_name}
              </Text>
              <Text style={styles.reason} numberOfLines={3}>
                {suggestion.reason}
              </Text>
              {suggestion.buyable ? null : (
                <Text style={styles.gone} testID={`look-gone-${suggestion.item.item_id}`}>
                  {LOOK_SIZE_GONE}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.card,
    backgroundColor: color.surface,
  },
  heading: { ...type.body, fontWeight: "700", color: color.textPrimary },
  note: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.md },
  // A basis just under half leaves room for the gap, so two sit per row and a
  // trailing odd card grows into the width it has rather than sitting narrow.
  card: {
    flexBasis: "46%",
    flexGrow: 1,
    flexDirection: "row",
    gap: space.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  thumb: { width: 48, height: 64, borderRadius: 6, backgroundColor: color.surfaceMuted },
  details: { flex: 1 },
  brand: { ...type.chip, fontWeight: "700", color: color.textPrimary },
  name: { ...type.chip, color: color.textSecondary },
  reason: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  gone: { ...type.chip, color: color.textPrimary, marginTop: 2, fontWeight: "700" },
});
