import { StyleSheet, View } from "react-native";
import { space } from "@/design/tokens";
import { Button } from "@/components/Button";

/**
 * The two co-equal actions (FR-5).
 *
 * Section 4.4 of the source doc: neither action may be visually subordinate.
 * Filled-vs-outlined introduces mild hierarchy, so both buttons share
 * dimensions, type weight, type size, corner radius and order, and the
 * difference is reduced to fill alone. Whether even that biases the split is
 * an open question the doc defers to a Phase 5 swapped-fill treatment --
 * `swapFills` exists so that treatment is a prop, not a rewrite.
 */

export interface ActionRowProps {
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  swapFills?: boolean;
  primaryDisabled?: boolean;
}

export function ActionRow({
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  swapFills = false,
  primaryDisabled = false,
}: ActionRowProps) {
  const primaryFilled = !swapFills;
  return (
    <View style={styles.row}>
      <Button
        label={primaryLabel}
        filled={primaryFilled}
        onPress={onPrimary}
        disabled={primaryDisabled}
        testID="wishlist-action-primary"
      />
      <Button
        label={secondaryLabel}
        filled={!primaryFilled}
        onPress={onSecondary}
        testID="wishlist-action-secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
  },
});
