import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ADDED_DUPLICATE,
  ADDED_FROM_WISHLIST,
  ADVISORY_COPY,
  AFTER_ADD_KEEP_BROWSING,
  AFTER_ADD_KEEP_COMPARING,
  AFTER_ADD_VIEW_BAG,
  RECOVERY_COPY,
} from "@/copy/bundle";
import { Button } from "@/components/Button";
import { ConfidencePanel } from "@/components/ConfidencePanel";
import { signalsFor } from "@/confidence/signals";
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
  /** DC-06: the colour selector. Null keeps the saved colour selected. */
  onChooseColour?: (colour: string) => void;
  selectedColour?: string;
  onConfidenceExpand?: () => void;
  onSignalExpand?: (key: string) => void;
  /**
   * Set once the item is in the bag. "duplicate" is its own outcome rather
   * than a failure -- FR-11 exists to stop a second copy being stacked
   * silently, and telling the user it was already there is the whole point.
   */
  added?: "added" | "duplicate" | null;
  onAfterAdd?: (next: "bag" | "compare" | "browse") => void;
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
  onChooseColour,
  selectedColour,
  onConfidenceExpand,
  onSignalExpand,
  added = null,
  onAfterAdd,
}: SavedProductScreenProps) {
  const { parent, colourway, current, blocking, advisories, item } = result;
  const activeColour = selectedColour ?? item.colour;
  const signals = signalsFor(result, { size: selectedSize, colour: activeColour });
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
  // Availability for the colour being *looked at*, never inferred from the
  // saved one -- once a colour can be picked, reading the saved colourway's
  // stock is exactly the silent substitution FR-7 forbids.
  const activeColourway =
    parent.colourways.find((c) => c.colour === activeColour) ?? colourway;
  const sizesForActiveColour =
    result.sizesByColour[activeColourway.product_id] ?? current.sizesInStock;
  const purchasable = !nothingIsBuyable && sizesForActiveColour.includes(selectedSize);
  const deviatesFromSaved = selectedSize !== item.size || activeColour !== item.colour;
  const selectedVariant = `${activeColour} · ${selectedSize}`;

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
              <Button
                testID="recovery-primary"
                filled
                label={recovery.primaryAction}
                onPress={onRecoveryPrimary}
              />
              <Button
                testID="recovery-secondary"
                filled={false}
                label={recovery.secondaryAction}
                onPress={onRecoverySecondary}
              />
            </View>
          </View>
        ) : null}

        {advisories.map((advisory) => (
          <View key={advisory} style={styles.advisory} testID={`advisory-${advisory}`}>
            <Text style={styles.advisoryText}>{ADVISORY_COPY[advisory]}</Text>
          </View>
        ))}

        {/* DC-03. This replaces a flat list of five facts: the facts were true
            but said nothing about where they came from, and section 7 makes the
            source the point. Everything here is still the binding read. */}
        <ConfidencePanel
          signals={signals}
          onExpand={onConfidenceExpand}
          onSignalExpand={onSignalExpand}
          // Section 3 of the wireframes: reaching this screen from "Buy from
          // Wishlist" is already the user asking to inspect, so the section
          // arrives open. It is Search that must stay compact, not this.
          initiallyExpanded
        />

        {/* DC-06. revalidate() has returned coloursInStock all along and
            nothing rendered it, so the saved colour could not be inspected,
            let alone changed. */}
        {parent.colourways.length > 1 ? (
          <>
            <Text style={styles.sizeHeading}>Colour</Text>
            <View style={styles.sizes}>
              {parent.colourways.map((cw) => {
                const available = current.coloursInStock.includes(cw.colour);
                const selected = cw.colour === activeColour;
                const isSaved = cw.colour === item.colour;
                return (
                  <Pressable
                    key={cw.colour}
                    testID={`colour-${cw.colour}`}
                    accessibilityRole="button"
                    accessibilityLabel={[
                      cw.colour,
                      isSaved ? "your saved colour" : null,
                      available ? null : "out of stock",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    accessibilityState={{ selected, disabled: !available }}
                    disabled={!available || !onChooseColour}
                    onPress={() => onChooseColour?.(cw.colour)}
                    style={[
                      styles.colour,
                      selected && styles.sizeSelected,
                      !available && styles.sizeDisabled,
                    ]}
                  >
                    <Text style={[styles.sizeText, selected && styles.sizeTextSelected]}>
                      {/* The saved colour keeps its label even when another is
                          selected (DC-06): the user must never mistake a
                          fallback colour for the one they chose. */}
                      {isSaved ? `${cw.colour} — saved` : cw.colour}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.sizeHeading}>Size</Text>
        <View style={styles.sizes}>
          {parent.sizes.map((size) => {
            const available = sizesForActiveColour.includes(size);
            const selected = size === selectedSize;
            const isSavedSize = size === item.size;
            return (
              <Pressable
                key={size}
                testID={`size-${size}`}
                accessibilityRole="button"
                accessibilityLabel={[
                  `Size ${size}`,
                  isSavedSize ? "your saved size" : null,
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
                <Text style={[styles.sizeText, selected && styles.sizeTextSelected]}>
                  {size}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Improvement 3, steps 6 and 7. The add is a decision point, not a
            notification: the user has just committed and now has three
            genuinely different next moves. A toast that vanishes in 2.6
            seconds cannot carry those, and cannot be reached at all by
            someone using a screen reader or reading slowly. */}
        {added ? (
          <View
            style={styles.added}
            testID="added-confirmation"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.addedTitle}>
              {added === "duplicate" ? ADDED_DUPLICATE : ADDED_FROM_WISHLIST}
            </Text>
            <Text style={styles.addedBody}>{selectedVariant}</Text>
            <View style={styles.addedActions}>
              <Button
                testID="after-add-bag"
                filled
                label={AFTER_ADD_VIEW_BAG}
                onPress={() => onAfterAdd?.("bag")}
              />
              <Button
                testID="after-add-compare"
                filled={false}
                label={AFTER_ADD_KEEP_COMPARING}
                onPress={() => onAfterAdd?.("compare")}
              />
            </View>
            <Pressable
              testID="after-add-browse"
              accessibilityRole="button"
              accessibilityLabel={AFTER_ADD_KEEP_BROWSING}
              onPress={() => onAfterAdd?.("browse")}
              style={styles.keepBrowsing}
            >
              <Text style={styles.keepBrowsingText}>{AFTER_ADD_KEEP_BROWSING}</Text>
            </Pressable>
          </View>
        ) : /* No dead-end Buy: when nothing can be bought the recovery block
              above carries the next step and this button is not drawn. */
        purchasable ? (
          <View style={styles.buyRow}>
            <Button
              testID="move-to-bag"
              filled
              grow
              // FR-7 covers colour as much as size: the button says which
              // variant it is actually buying, so a deviation from what was
              // saved is never hidden behind a generic label.
              accessibilityLabel={
                deviatesFromSaved
                  ? `Move to Bag in ${selectedVariant}, instead of your saved ${item.colour} · ${item.size}`
                  : "Move to Bag"
              }
              label={deviatesFromSaved ? `Move to Bag · ${selectedVariant}` : "Move to Bag"}
              onPress={onMoveToBag}
            />
          </View>
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
  // Wider than a size pill because it carries a word plus the "— saved" tag.
  colour: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  buyRow: { flexDirection: "row", marginTop: space.lg },
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
  addedActions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  keepBrowsing: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xs,
  },
  keepBrowsingText: { ...type.body, fontWeight: "700", color: color.textSecondary },
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
