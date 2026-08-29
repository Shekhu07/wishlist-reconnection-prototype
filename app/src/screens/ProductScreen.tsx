import type { ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  NOT_DELIVERABLE,
  PRODUCT_DESCRIPTION_HEADING,
  PRODUCT_DESCRIPTION_NOTE,
  formatDelivery,
  formatPrice,
  formatReturns,
} from "@/copy/bundle";
import { Button } from "@/components/Button";
import { CATALOG_IMAGES } from "@/data/images";
import type { Colourway, ParentProduct } from "@/data/types";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * An ordinary catalog product.
 *
 * There was no such screen. Search tiles were not tappable at all, Home routed
 * to a stub and threw the tile away, and Browse turned a tile into a search
 * query -- every product-shaped route in the app required a wishlist item id.
 * So the pairing section this feature exists for had nowhere to live.
 *
 * Generalised from AlternativeProductScreen rather than SavedProductScreen,
 * because that one already takes plain parent + colourway props, already
 * renders a price, and deliberately carries none of the saved-item apparatus.
 * The saved-product screen is built entirely around a RevalidationResult and
 * would have to be dismantled to serve an item nobody saved.
 *
 * Section order is the spec's: price, then the pairing, then the description.
 */

export interface ProductScreenProps {
  parent: ParentProduct;
  colourway: Colourway;
  sizesInStock: string[];
  deliveryBy: string | null;
  selectedSize: string | null;
  onChooseSize: (size: string) => void;
  onMoveToBag: (size: string) => void;
  /**
   * Saving from here records the size and colour the user actually chose,
   * which is the honest version of the grid heart's guess. Absent leaves the
   * control undrawn rather than drawn dead.
   */
  saved?: boolean;
  onToggleSave?: (size: string) => void;
  added: boolean;
  /** "Complete the look" — sits between the price and the description. */
  pairing?: ReactNode;
  /** Absent hides the colour ladder: a pill that cannot navigate is a lie. */
  onSelectColourway?: (productId: number) => void;
}

export function ProductScreen({
  parent,
  colourway,
  sizesInStock,
  deliveryBy,
  selectedSize,
  onChooseSize,
  onMoveToBag,
  saved = false,
  onToggleSave,
  added,
  pairing,
  onSelectColourway,
}: ProductScreenProps) {
  const purchasable = selectedSize !== null && sizesInStock.includes(selectedSize);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="product-screen">
      {/* No back control here: the shell's header bar carries one for every
          pushed route. This screen used to draw a second, directly under it. */}
      <Image
        source={CATALOG_IMAGES[colourway.product_id]}
        style={styles.hero}
        resizeMode="cover"
      />

      <View style={styles.body}>
        <Text style={styles.brand}>{parent.brand.toUpperCase()}</Text>
        <Text style={styles.name}>{colourway.display_name}</Text>
        <Text style={styles.colour}>{colourway.colour}</Text>

        {/* Neutral price. No MRP strike-through and no discount percentage:
            ordinary catalog tiles carry those, and this screen is reachable
            from the reconnection flow where constraint C-1 applies. */}
        <Text style={styles.price} testID="product-price">
          {formatPrice(colourway.price)}
        </Text>

        {/* Rating and review count, the two axes the compare table already
            shows and this screen did not -- so a product opened directly had
            less to judge it by than the same product seen side by side.
            Synthesised like the rest of the comparison data, and labelled as
            such in the description note below. */}
        <View style={styles.rating} testID="product-rating">
          <Text style={styles.ratingText}>★ {colourway.rating.toFixed(1)}</Text>
          <Text style={styles.reviews}>
            ({colourway.review_count.toLocaleString("en-IN")})
          </Text>
        </View>

        {/* The colour ladder, mirroring the saved screen's DC-06 pills rather
            than inventing a second colour control. Each colourway is its own
            product_id, so choosing one is a navigation, not a local state
            change -- which is why this takes a product id and not a name. */}
        {parent.colourways.length > 1 && onSelectColourway ? (
          <>
            <Text style={styles.colourHeading}>Colour</Text>
            <View style={styles.colours}>
              {parent.colourways.map((cw) => {
                const selected = cw.product_id === colourway.product_id;
                return (
                  <Pressable
                    key={cw.product_id}
                    testID={`product-colour-${cw.product_id}`}
                    accessibilityRole="button"
                    accessibilityLabel={cw.colour}
                    accessibilityState={{ selected }}
                    disabled={selected}
                    onPress={() => onSelectColourway(cw.product_id)}
                    style={[styles.colourPill, selected && styles.colourPillSelected]}
                  >
                    <Text style={styles.colourPillText}>{cw.colour}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* The pairing sits here, between the price and the description,
            exactly where the spec places it. It renders nothing when no saved
            item completes this look, rather than reaching into the catalog. */}
        {pairing}

        <Text style={styles.sectionHeading}>{PRODUCT_DESCRIPTION_HEADING}</Text>
        <Text style={styles.description} testID="product-description">
          {describe(parent, colourway)}
        </Text>
        <Text style={styles.descriptionNote}>{PRODUCT_DESCRIPTION_NOTE}</Text>

        <View style={styles.facts}>
          <Fact label="Seller" value={colourway.seller} />
          <Fact
            label="Delivery"
            value={deliveryBy ? formatDelivery(deliveryBy) : NOT_DELIVERABLE}
          />
          <Fact label="Returns" value={formatReturns(colourway.returns_days)} />
        </View>

        <Text style={styles.sectionHeading}>Size</Text>
        <View style={styles.sizes}>
          {parent.sizes.map((size) => {
            const available = sizesInStock.includes(size);
            const selected = size === selectedSize;
            return (
              <Pressable
                key={size}
                testID={`product-size-${size}`}
                accessibilityRole="button"
                accessibilityLabel={available ? `Size ${size}` : `Size ${size}, out of stock`}
                accessibilityState={{ selected, disabled: !available }}
                disabled={!available}
                onPress={() => onChooseSize(size)}
                style={[
                  styles.size,
                  selected && styles.sizeSelected,
                  !available && styles.sizeDisabled,
                ]}
              >
                <Text style={[styles.sizeText, selected && styles.sizeTextSelected]}>{size}</Text>
              </Pressable>
            );
          })}
        </View>

        {onToggleSave ? (
          <View style={styles.saveRow}>
            <Button
              testID="product-save"
              filled={false}
              grow
              label={saved ? "♥  Saved to Wishlist" : "♡  Save to Wishlist"}
              accessibilityLabel={
                saved
                  ? `Remove ${parent.brand} ${colourway.display_name} from Wishlist`
                  : `Save ${parent.brand} ${colourway.display_name} to Wishlist, ${colourway.colour}${selectedSize ? `, size ${selectedSize}` : ""}`
              }
              onPress={() => onToggleSave(selectedSize ?? parent.sizes[0])}
            />
          </View>
        ) : null}

        {added ? (
          <View
            style={styles.added}
            testID="product-added"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.addedTitle}>Added to Bag</Text>
            <Text style={styles.addedBody}>
              {colourway.colour} · {selectedSize}
            </Text>
          </View>
        ) : purchasable ? (
          <View style={styles.buyRow}>
            <Button
              testID="product-move-to-bag"
              filled
              grow
              label={`Move to Bag · ${colourway.colour} · ${selectedSize}`}
              onPress={() => onMoveToBag(selectedSize!)}
            />
          </View>
        ) : (
          <Text style={styles.noSize} testID="product-no-size">
            {sizesInStock.length
              ? "Pick a size that is in stock to continue."
              : "Out of stock in every size."}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

/**
 * The description, composed rather than written.
 *
 * There is no description field anywhere in the data model, and the raw
 * dataset has no copy column either -- so the choice was to invent a paragraph
 * of marketing tone or to state the attributes that exist. Generated prose is
 * precisely what constraint 8 of the improvement prompt rules out, and it would
 * be the one genuinely dishonest thing this screen could do: a shopper cannot
 * tell invented tone from a real product description.
 *
 * So this reads as a spec line, and the note beneath it says three of these
 * fields are generated.
 */
export function describe(parent: ParentProduct, colourway: Colourway): string {
  const parts = [
    colourway.material,
    colourway.fit,
    colourway.colour,
    colourway.usage,
    colourway.season,
  ].filter((part): part is string => Boolean(part));
  return `${parent.brand} ${colourway.display_name} — ${parts.join(" · ")}.`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingBottom: space.xl },
  hero: { width: "100%", height: 420, backgroundColor: color.surfaceMuted },
  body: { padding: space.lg },
  brand: { ...type.brand, fontSize: 16, color: color.textPrimary },
  name: { ...type.body, fontSize: 14, color: color.textSecondary, marginTop: 2 },
  colour: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  rating: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  ratingText: { ...type.chip, fontWeight: "700", color: color.textPrimary },
  reviews: { ...type.chip, color: color.textSecondary },
  colourHeading: {
    ...type.body,
    fontWeight: "700",
    color: color.textPrimary,
    marginTop: space.lg,
  },
  colours: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  colourPill: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  colourPillSelected: { borderColor: color.brandPink, borderWidth: 2 },
  colourPillText: { ...type.chip, color: color.textPrimary },
  price: {
    ...type.body,
    fontSize: 18,
    fontWeight: "700",
    color: color.textPrimary,
    marginTop: space.md,
  },
  sectionHeading: {
    ...type.body,
    fontWeight: "700",
    color: color.textPrimary,
    marginTop: space.lg,
  },
  description: { ...type.body, color: color.textSecondary, marginTop: space.xs, lineHeight: 18 },
  descriptionNote: { ...type.chip, color: color.textSecondary, marginTop: space.xs },
  facts: { marginTop: space.lg, gap: space.sm },
  fact: { flexDirection: "row", justifyContent: "space-between" },
  factLabel: { ...type.body, color: color.textSecondary },
  factValue: { ...type.body, color: color.textPrimary, fontWeight: "700" },
  sizes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  size: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  sizeSelected: { borderColor: color.brandPink, borderWidth: 2 },
  sizeDisabled: { opacity: 0.35, backgroundColor: color.surfaceMuted },
  sizeText: { ...type.body, color: color.textPrimary },
  sizeTextSelected: { color: color.brandPink, fontWeight: "700" },
  saveRow: { marginTop: space.lg },
  buyRow: { flexDirection: "row", marginTop: space.lg },
  noSize: { ...type.body, color: color.textSecondary, marginTop: space.lg },
  added: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    backgroundColor: color.surfaceMuted,
  },
  addedTitle: { ...type.body, fontSize: 14, fontWeight: "700", color: color.textPrimary },
  addedBody: { ...type.body, color: color.textSecondary, marginTop: 2 },
});
