import { Pressable, StyleSheet, Text } from "react-native";
import { MIN_TOUCH_TARGET, color, radius, space } from "@/design/tokens";

/**
 * The one button.
 *
 * This exact StyleSheet block -- button / filled / outlined / labelFilled /
 * labelOutlined -- was copy-pasted verbatim into ActionRow, SavedProductScreen
 * and CompareScreen. Three copies is where a shared shape stops being a
 * coincidence, and section 4.4's co-equality requirement (identical dimensions,
 * weight, size and radius, differing only in fill) is a property of *one*
 * definition, not of three that happen to agree today.
 */

export interface ButtonProps {
  label: string;
  filled: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Overrides `label` where the spoken form needs to say more than the face. */
  accessibilityLabel?: string;
  testID?: string;
  /** Lets a row of buttons share width; off for buttons sized to content. */
  grow?: boolean;
}

export function Button({
  label,
  filled,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
  grow = true,
}: ButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        grow && styles.grow,
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
  button: {
    // Constraint C-7's minimum touch target and section 4.4's identical box are
    // the same number, so the two requirements agree rather than compete.
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  grow: { flex: 1 },
  filled: { backgroundColor: color.brandPink, borderColor: color.brandPink },
  outlined: { backgroundColor: color.surface, borderColor: color.brandPink },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  labelFilled: { color: color.surface },
  labelOutlined: { color: color.brandPink },
});
