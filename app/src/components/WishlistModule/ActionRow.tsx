import { Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, color, radius, space } from "@/design/tokens";

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

function Button({
  label,
  filled,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  filled: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        filled ? styles.filled : styles.outlined,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, filled ? styles.labelFilled : styles.labelOutlined]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
  },
  button: {
    flex: 1,
    // Identical box for both actions. Constraint C-7 also makes this the
    // minimum touch target, so the two requirements agree.
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  filled: {
    backgroundColor: color.brandPink,
    borderColor: color.brandPink,
  },
  outlined: {
    backgroundColor: color.surface,
    borderColor: color.brandPink,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  labelFilled: { color: color.surface },
  labelOutlined: { color: color.brandPink },
});
