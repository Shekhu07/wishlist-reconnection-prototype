import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  WHY_BODY,
  WHY_CLOSE,
  WHY_HIDE_ALWAYS,
  WHY_HIDE_SEARCH,
  WHY_TITLE,
  WHY_VIEW_ITEM,
} from "@/copy/bundle";
import { Sheet } from "@/components/Sheet";
import { MIN_TOUCH_TARGET, color, space, type } from "@/design/tokens";

/**
 * DC-02: the transparency sheet.
 *
 * Section 5 makes two demands that pull in opposite directions -- explain the
 * personalisation, and reveal nothing private. The resolution is that the
 * explanation is about the *match* ("your search matches a product in your
 * Wishlist") and never about the user's reason for saving it. Nothing here
 * reads an intent tag, and it should stay that way.
 *
 * It is a sheet rather than a navigation, per DC-02's own note: the user asked
 * a question about the search results, so the search results should still be
 * there when they are done.
 */

export interface WhySheetProps {
  open: boolean;
  onClose: () => void;
  onViewItem: () => void;
  /** FR-8's relevance signal: this query, this session, and reversible. */
  onHideForSearch: () => void;
  /** Section 4.16's durable setting, enforced service-side. */
  onHideAlways: () => void;
}

export function WhySheet({
  open,
  onClose,
  onViewItem,
  onHideForSearch,
  onHideAlways,
}: WhySheetProps) {
  return (
    <Sheet open={open} title={WHY_TITLE} onClose={onClose} testID="why-sheet">
      {WHY_BODY.map((line) => (
        <Text key={line} style={styles.body}>
          {line}
        </Text>
      ))}
      <View style={styles.actions}>
        <Action label={WHY_VIEW_ITEM} onPress={onViewItem} testID="why-view-item" />
        {/* The reversible control and the durable one are both offered, and
            they are not the same control: FR-8 is explicit that dismissing is
            a relevance signal and never a permanent opt-out. */}
        <Action label={WHY_HIDE_SEARCH} onPress={onHideForSearch} testID="why-hide-search" />
        <Action label={WHY_HIDE_ALWAYS} onPress={onHideAlways} testID="why-hide-always" />
        <Action label={WHY_CLOSE} onPress={onClose} testID="why-close" muted />
      </View>
    </Sheet>
  );
}

function Action({
  label,
  onPress,
  testID,
  muted = false,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  muted?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.action}
    >
      <Text style={[styles.actionText, muted && styles.actionMuted]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: color.textSecondary, lineHeight: 18 },
  actions: { marginTop: space.sm },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
  },
  actionText: { ...type.body, fontWeight: "700", color: color.brandPink },
  actionMuted: { color: color.textSecondary },
});
