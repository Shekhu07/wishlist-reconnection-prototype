import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ADVISORY_COPY,
  RECOVERY_COPY,
  formatDelivery,
  formatPrice,
  formatReturns,
} from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";
import type { RevalidationResult } from "@/revalidation/revalidate";

/**
 * E5: the saved product, opened from the module.
 *
 * The saved colour and size arrive preselected (FR-4) and are never quietly
 * replaced (FR-7). Everything on this screen comes from the binding read in
 * revalidate.ts, not from what the module happened to show a moment ago -- so
 * the screen is able to contradict the card the user just tapped, which is the
 * entire point of two-phase freshness.
 */

export interface SavedProductScreenProps {
  result: RevalidationResult;
  pincode: string;
  onBack: () => void;
  onMoveToBag: () => void;
  onRecoveryPrimary: () => void;
  onRecoverySecondary: () => void;
  onChooseSize: (size: string) => void;
  selectedSize: string;
}

export function SavedProductScreen({
  result,
  pincode,
  onBack,
  onMoveToBag,
  onRecoveryPrimary,
  onRecoverySecondary,
  onChooseSize,
  selectedSize,
}: SavedProductScreenProps) {
  const { parent, colourway, current, blocking, advisories, item } = result;
  const recovery = blocking
    ? RECOVERY_COPY[blocking]({
        size: item.size,
        colour: item.colour,
        seller: current.seller,
        pincode,
      })
    : null;
  // `blocking` describes the *saved* variant, and it never changes. Whether a
  // purchase can proceed depends on what the user has selected now -- otherwise
  // "See what's in stock" hands them a buyable size and still no way to buy it.
  //
  // FR-7 forbids *silent* substitution, not substitution the user chose. So
  // once they pick a different size the purchase reopens, and the button says
  // which size it is buying, so the deviation from what they saved is never
  // hidden from them.
  const nothingIsBuyable =
    blocking === "product_unavailable" || blocking === "delivery_unavailable";
  const purchasable = !nothingIsBuyable && current.sizesInStock.includes(selectedSize);
  const deviatesFromSaved = selectedSize !== item.size;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="saved-product">
      <Pressable
        testID="back-to-results"
        accessibilityRole="button"
        accessibilityLabel="Back to search results"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={onBack}
        style={styles.back}
      >
        <Text style={styles.backText}>← Back to results</Text>
      </Pressable>

      <Image
        source={CATALOG_IMAGES[colourway.product_id]}
        style={styles.hero}
        resizeMode="cover"
      />

      <View style={styles.body}>
        <Text style={styles.brand}>{parent.brand.toUpperCase()}</Text>
        <Text style={styles.name}>{colourway.display_name}</Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            Saved: {item.colour} · {item.size}
          </Text>
        </View>

        {recovery ? (
          <View style={styles.recovery} testID={`recovery-${blocking}`}>
            <Text style={styles.recoveryTitle}>{recovery.title}</Text>
            <Text style={styles.recoveryBody}>{recovery.body}</Text>
            <View style={styles.recoveryActions}>
              <Pressable
                testID="recovery-primary"
                accessibilityRole="button"
                accessibilityLabel={recovery.primaryAction}
                onPress={onRecoveryPrimary}
                style={[styles.button, styles.filled]}
              >
                <Text style={styles.labelFilled}>{recovery.primaryAction}</Text>
              </Pressable>
              <Pressable
                testID="recovery-secondary"
                accessibilityRole="button"
                accessibilityLabel={recovery.secondaryAction}
                onPress={onRecoverySecondary}
                style={[styles.button, styles.outlined]}
              >
                <Text style={styles.labelOutlined}>{recovery.secondaryAction}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {advisories.map((advisory) => (
          <View key={advisory} style={styles.advisory} testID={`advisory-${advisory}`}>
            <Text style={styles.advisoryText}>{ADVISORY_COPY[advisory]}</Text>
          </View>
        ))}

        {/* The five facts section 4.13 requires be revalidated, all from the
            binding read. Price stays neutral: no strike-through, no savings. */}
        <View style={styles.facts}>
          <Fact label="Price" value={formatPrice(current.price)} />
          {item.price_at_save !== current.price ? (
            <Fact label="Price when saved" value={formatPrice(item.price_at_save)} />
          ) : null}
          <Fact label="Seller" value={current.seller} />
          <Fact
            label="Delivery"
            value={
              current.delivery_by
                ? formatDelivery(current.delivery_by)
                : `Not deliverable to ${pincode}`
            }
          />
          <Fact label="Returns" value={formatReturns(current.returns_days)} />
        </View>

        <Text style={styles.sizeHeading}>Size</Text>
        <View style={styles.sizes}>
          {parent.sizes.map((size) => {
            const available = current.sizesInStock.includes(size);
            const selected = size === selectedSize;
            return (
              <Pressable
                key={size}
                testID={`size-${size}`}
                accessibilityRole="button"
                accessibilityLabel={
                  available ? `Size ${size}` : `Size ${size}, out of stock`
                }
                accessibilityState={{ selected, disabled: !available }}
                disabled={!available}
                onPress={() => onChooseSize(size)}
                style={[
                  styles.size,
                  selected && styles.sizeSelected,
                  !available && styles.sizeDisabled,
                ]}
              >
                <Text style={[styles.sizeText, selected && styles.sizeTextSelected]}>
                  {size}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* No dead-end Buy: when nothing can be bought the recovery block above
            carries the next step and this button is not drawn at all. */}
        {purchasable ? (
          <Pressable
            testID="move-to-bag"
            accessibilityRole="button"
            accessibilityLabel={
              deviatesFromSaved
                ? `Move to Bag in size ${selectedSize}, instead of your saved size ${item.size}`
                : "Move to Bag"
            }
            onPress={onMoveToBag}
            style={[styles.button, styles.filled]}
          >
            <Text style={styles.labelFilled}>
              {deviatesFromSaved ? `Move to Bag · Size ${selectedSize}` : "Move to Bag"}
            </Text>
          </Pressable>
        ) : null}
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
  chip: {
    alignSelf: "flex-start",
    backgroundColor: color.surfaceMuted,
    borderRadius: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    marginTop: space.sm,
  },
  chipText: { ...type.chip, color: color.textPrimary },
  recovery: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "#F0DFC0",
    backgroundColor: "#FFF6E5",
  },
  recoveryTitle: { ...type.body, fontSize: 14, fontWeight: "700", color: "#7A5A1E" },
  recoveryBody: { ...type.body, color: "#7A5A1E", marginTop: space.xs, lineHeight: 17 },
  recoveryActions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  advisory: {
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: 6,
    backgroundColor: color.surfaceMuted,
  },
  advisoryText: { ...type.body, color: color.textSecondary },
  facts: { marginTop: space.lg, gap: space.sm },
  fact: { flexDirection: "row", justifyContent: "space-between" },
  factLabel: { ...type.body, color: color.textSecondary },
  factValue: { ...type.body, color: color.textPrimary, fontWeight: "700" },
  sizeHeading: {
    ...type.body,
    fontWeight: "700",
    color: color.textPrimary,
    marginTop: space.lg,
  },
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
  button: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    marginTop: space.lg,
  },
  filled: { backgroundColor: color.brandPink, borderColor: color.brandPink },
  outlined: { backgroundColor: color.surface, borderColor: color.brandPink },
  disabled: { opacity: 0.4 },
  labelFilled: { fontSize: 14, fontWeight: "700", color: color.surface, textAlign: "center" },
  labelOutlined: { fontSize: 14, fontWeight: "700", color: color.brandPink, textAlign: "center" },
});
