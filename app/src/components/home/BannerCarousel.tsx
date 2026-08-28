import { useState } from "react";
import {
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { color, radius, space, spec, type } from "@/design/tokens";

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
    tag: "LIMITED TIME",
    headline: "End of Season Sale · Up to 70% Off",
  },
  {
    key: "new",
    background: spec.bannerViolet,
    tag: "JUST IN",
    headline: "New Arrivals, freshly stocked",
  },
  {
    key: "luxe",
    background: spec.bannerNeutral,
    tag: "CURATED",
    headline: "The Luxury Edit",
  },
] as const;

const CARD_WIDTH = 340;
const GAP = 10;

export function BannerCarousel() {
  const [page, setPage] = useState(0);

  // The dot row has to follow the scroll or it is decoration claiming to be
  // state. Paging on the card pitch rather than the viewport width, because
  // the cards are narrower than the frame and peek by design.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const next = Math.round(x / (CARD_WIDTH + GAP));
    if (next !== page && next >= 0 && next < BANNERS.length) setPage(next);
  };

  return (
    <View testID="banner-carousel">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.row}
      >
        {BANNERS.map((banner) => (
          <View
            key={banner.key}
            testID={`banner-${banner.key}`}
            style={[styles.banner, { backgroundColor: banner.background }]}
          >
            <Text style={styles.eyebrow}>{banner.tag}</Text>
            <Text style={styles.headline}>{banner.headline}</Text>
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
    width: CARD_WIDTH,
    height: 150,
    borderRadius: radius.banner,
    padding: space.lg,
    justifyContent: "flex-start",
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
