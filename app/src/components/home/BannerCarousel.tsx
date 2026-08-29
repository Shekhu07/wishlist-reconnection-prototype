import { useState } from "react";
import {
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  FRAME_MAX_WIDTH,
  MIN_TOUCH_TARGET,
  color,
  radius,
  space,
  spec,
  type,
} from "@/design/tokens";

/**
 * Three paged banners with a dot row, per the design spec.
 *
 * Fixed prose, not a promise about anything the user saved (constraint C-1):
 * every headline here is a generic seasonal or editorial line, and none of
 * them may ever reference a wishlist item. That rule is why the copy is a
 * constant in this file rather than something assembled from catalog state --
 * there is no code path by which a saved product could reach it.
 */

const BANNERS = [
  {
    key: "sale",
    background: spec.bannerPink,
    tag: "FRESH DROPS",
    // Deliberately not a second sale headline. `SaleStrip` sits two blocks
    // below this carousel and already advertises the season sale -- with a
    // different number, "40-70%" against the "Up to 70%" this used to claim.
    // Two cards saying the same thing badly is worse than one saying it once.
    headline: "New arrivals from your favourite brands",
    action: "Start searching",
  },
  {
    key: "new",
    background: spec.bannerViolet,
    tag: "JUST IN",
    headline: "The season's newest labels",
    action: null,
  },
  {
    key: "luxe",
    background: spec.bannerNeutral,
    tag: "CURATED",
    headline: "The Luxury Edit",
    action: null,
  },
] as const;

const GAP = 10;

/**
 * How much of the next banner shows past the edge of this one.
 *
 * The card was a fixed 340px, which on a 390px frame left ~34px of the next
 * one visible -- and since a banner pads its text by 16px, that sliver was
 * wide enough to show the *start of its headline*, cut through the middle of
 * a letter. A peek narrower than that padding can only ever show the card's
 * background colour, which is what a peek is for: proving there is another
 * card without previewing a word of it.
 */
const PEEK = 12;

export interface BannerCarouselProps {
  /** Only the lead banner offers an action, and only if the caller wires one. */
  onAction?: () => void;
}

export function BannerCarousel({ onAction }: BannerCarouselProps = {}) {
  const [page, setPage] = useState(0);
  // Sized off the frame rather than fixed, for the same reason the grid tiles
  // are: a hard-coded width is only correct at one viewport.
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width, FRAME_MAX_WIDTH) - space.lg * 2 - PEEK;

  // The dot row has to follow the scroll or it is decoration claiming to be
  // state. Paging on the card pitch rather than the viewport width, because
  // the cards are narrower than the frame and peek by design.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const next = Math.round(x / (cardWidth + GAP));
    if (next !== page && next >= 0 && next < BANNERS.length) setPage(next);
  };

  return (
    <View testID="banner-carousel">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Land on a card, never between two. Without this a flick could rest
        // with two half-banners on screen and the dots claiming one.
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
      >
        {BANNERS.map((banner) => (
          <View
            key={banner.key}
            testID={`banner-${banner.key}`}
            style={[styles.banner, { width: cardWidth, backgroundColor: banner.background }]}
          >
            <Text style={styles.eyebrow}>{banner.tag}</Text>
            <Text style={styles.headline}>{banner.headline}</Text>
            {banner.action && onAction ? (
              <Pressable
                testID={`banner-action-${banner.key}`}
                accessibilityRole="button"
                accessibilityLabel={banner.action}
                onPress={onAction}
                style={styles.action}
              >
                <Text style={styles.actionText}>{banner.action}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {BANNERS.map((banner, index) => (
          <View
            key={banner.key}
            testID={`banner-dot-${index}${index === page ? "-active" : ""}`}
            style={[styles.dot, index === page ? styles.dotActive : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: GAP, paddingHorizontal: space.lg, paddingVertical: space.md },
  banner: {
    height: 150,
    borderRadius: radius.banner,
    padding: space.lg,
    // The spec draws these over an `image-slot shape="rect"` we do not fill,
    // so the card is flat colour. Top-aligning the text on top of that left
    // the bottom two-thirds visibly empty; spreading it uses the height the
    // spec allotted instead of pretending the artwork is there.
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  eyebrow: {
    ...type.railAction,
    letterSpacing: 0.6,
    color: color.textPrimary,
  },
  headline: {
    fontSize: 20,
    fontWeight: "800",
    color: color.textPrimary,
    marginTop: space.xs,
    maxWidth: 220,
    lineHeight: 23,
  },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  actionText: { ...type.body, fontWeight: "700", color: color.textPrimary },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    paddingBottom: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.borderSubtle,
  },
  dotActive: { backgroundColor: color.brandPink },
});
