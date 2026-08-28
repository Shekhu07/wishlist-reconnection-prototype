import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LOOK_HEADING, LOOK_NOTE } from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";
import type { LookSuggestion } from "@/wishlist/lookCompletion";

/**
 * Improvement 9, kept as sparse as the prompt demands.
 *
 * Two items maximum, drawn only from what the user already saved, with a
 * reason derived from the article-type pairing rather than written for effect.
 * It carries its own later-phase label because it is not part of the primary
 * experiment and should never be mistaken for it.
 *
 * There is no "add all to bag", no carousel and no third item, because the
 * instruction is explicit: do not add complementary products solely to
 * increase basket size. Everything here the user chose once already; the strip
 * only reminds them the other half of the outfit is in their own Wishlist.
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
    <View style={styles.strip} testID="look-strip">
      <Text style={styles.heading}>{heading}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.row}>
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion.item.item_id}
            testID={`look-${suggestion.item.item_id}`}
            accessibilityRole="button"
            accessibilityLabel={`${suggestion.parent.brand} ${suggestion.parent.display_name}, saved ${suggestion.item.colour} ${suggestion.item.size}. ${suggestion.reason}`}
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
              <Text style={styles.reason} numberOfLines={2}>
                {suggestion.reason}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
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
  row: { flexDirection: "row", gap: space.md, marginTop: space.md },
  card: { flex: 1, flexDirection: "row", gap: space.sm, minHeight: MIN_TOUCH_TARGET },
  thumb: { width: 48, height: 64, borderRadius: 6, backgroundColor: color.surfaceMuted },
  details: { flex: 1 },
  brand: { ...type.chip, fontWeight: "700", color: color.textPrimary },
  name: { ...type.chip, color: color.textSecondary },
  reason: { ...type.chip, color: color.textSecondary, marginTop: 2 },
});
