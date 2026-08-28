import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  NOT_DELIVERABLE,
  formatDelivery,
  formatPrice,
  formatReturns,
} from "@/copy/bundle";
import { Button } from "@/components/Button";
import { CATALOG_IMAGES } from "@/data/images";
import type { Colourway, ParentProduct } from "@/data/types";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * An alternative, opened from the comparison.
 *
 * Until now `onChoose` toasted for every option that was not the saved item,
 * so the comparison was a dead end: the user could read about four
 * alternatives and open none of them. That also left CR-04 with nothing to
 * return *from*.
 *
 * Deliberately not the saved-product screen with a flag. This is not a saved
 * item and must not borrow the language of one:
 *
 *   - no Decision Confidence panel. That layer answers "is the thing I saved
 *     still right for me", and there is nothing saved here to be right about.
 *   - no "Saved:" chip, no saved-variant reference, no recovery states.
 *   - the saved item is still named, as the thing being compared *against*,
 *     so the user never loses track of which one was theirs.
 */

export interface AlternativeProductScreenProps {
  parent: ParentProduct;
  colourway: Colourway;
  /** The user's saved variant, carried through as the comparison anchor. */
  savedLabel: string;
  savedSize: string;
  sizesInStock: string[];
  deliveryBy: string | null;
  selectedSize: string | null;
  onChooseSize: (size: string) => void;
  onBack: () => void;
  onMoveToBag: (size: string) => void;
  added: boolean;
  /** CR-04 fills this slot in the next slice; null keeps the screen honest now. */
  contextBar?: React.ReactNode;
}

export function AlternativeProductScreen({
  parent,
  colourway,
  savedLabel,
  savedSize,
  sizesInStock,
  deliveryBy,
  selectedSize,
  onChooseSize,
  onBack,
  onMoveToBag,
  added,
  contextBar,
}: AlternativeProductScreenProps) {
  // Defaults to the size the user saved, because that is the size they are
  // shopping for -- but only when this option actually stocks it. Preselecting
  // a size that is out would be an offer the screen cannot honour.
  const active = selectedSize ?? (sizesInStock.includes(savedSize) ? savedSize : null);
  const purchasable = active !== null && sizesInStock.includes(active);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="alternative-product"
    >
      <Pressable
        testID="back-to-comparison"
        accessibilityRole="button"
        accessibilityLabel="Back to comparison"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={onBack}
        style={styles.back}
      >
        <Text style={styles.backText}>← Back to comparison</Text>
      </Pressable>

      {contextBar}

      <Image
        source={CATALOG_IMAGES[colourway.product_id]}
        style={styles.hero}
        resizeMode="cover"
      />

      <View style={styles.body}>
        <Text style={styles.brand}>{parent.brand.toUpperCase()}</Text>
        <Text style={styles.name}>{colourway.display_name}</Text>
        <Text style={styles.colour}>{colourway.colour}</Text>

        {/* The anchor. An alternative only means anything relative to the
            thing it is an alternative to. */}
        <View style={styles.chip}>
          <Text style={styles.chipText}>Comparing against your saved {savedLabel}</Text>
        </View>

        <View style={styles.facts}>
          <Fact label="Price" value={formatPrice(colourway.price)} />
          <Fact label="Seller" value={colourway.seller} />
          <Fact
            label="Delivery"
            value={deliveryBy ? formatDelivery(deliveryBy) : NOT_DELIVERABLE}
          />
          <Fact label="Returns" value={formatReturns(colourway.returns_days)} />
        </View>

        <Text style={styles.sizeHeading}>Size</Text>
        <View style={styles.sizes}>
          {parent.sizes.map((size) => {
            const available = sizesInStock.includes(size);
            const selected = size === active;
            return (
              <Pressable
                key={size}
                testID={`alt-size-${size}`}
                accessibilityRole="button"
                accessibilityLabel={[
                  `Size ${size}`,
                  size === savedSize ? "the size you saved" : null,
                  available ? null : "out of stock",
                ]
                  .filter(Boolean)
                  .join(", ")}
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

        {added ? (
          <View
            style={styles.added}
            testID="alt-added-confirmation"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {/* Named for where it came from. Section 7 reads the mechanism off
                this distinction, so "from comparison" is not decoration. */}
            <Text style={styles.addedTitle}>Added to Bag from comparison</Text>
            <Text style={styles.addedBody}>
              {colourway.colour} · {active}
            </Text>
          </View>
        ) : purchasable ? (
          <View style={styles.buyRow}>
            <Button
              testID="alt-move-to-bag"
              filled
              grow
              label={`Move to Bag · ${colourway.colour} · ${active}`}
              accessibilityLabel={`Move this alternative to Bag in ${colourway.colour}, size ${active}, instead of your saved ${savedLabel}`}
              onPress={() => onMoveToBag(active)}
            />
          </View>
        ) : (
          <Text style={styles.noSize} testID="alt-no-size">
            {sizesInStock.length
              ? "Pick a size that is in stock to continue."
              : "This option is out of stock in every size."}
          </Text>
        )}
      </View>
    </ScrollView>
  );
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
  back: { padding: space.lg, minHeight: MIN_TOUCH_TARGET, justifyContent: "center" },
  backText: { ...type.body, fontWeight: "700", color: color.textPrimary },
  hero: { width: "100%", height: 420, backgroundColor: color.surfaceMuted },
  body: { padding: space.lg },
  brand: { ...type.brand, fontSize: 16, color: color.textPrimary },
  name: { ...type.body, fontSize: 14, color: color.textSecondary, marginTop: 2 },
  colour: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: color.surfaceMuted,
    borderRadius: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    marginTop: space.sm,
  },
  chipText: { ...type.chip, color: color.textPrimary },
  facts: { marginTop: space.lg, gap: space.sm },
  fact: { flexDirection: "row", justifyContent: "space-between" },
  factLabel: { ...type.body, color: color.textSecondary },
  factValue: { ...type.body, color: color.textPrimary, fontWeight: "700" },
  sizeHeading: { ...type.body, fontWeight: "700", color: color.textPrimary, marginTop: space.lg },
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
