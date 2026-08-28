import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  FRAME_MAX_WIDTH,
  MIN_TOUCH_TARGET,
  color,
  radius,
  space,
  type,
} from "@/design/tokens";

/**
 * A bottom sheet.
 *
 * There was exactly one of these in the codebase, hardcoded inside HarnessPill
 * around the state switcher. Part A needs three more (DC-02 "why this
 * appeared", DC-04 confidence detail, CR-03 resume) and Help-me-decide needs a
 * fourth, so it is a primitive now rather than four copies of the same overlay.
 *
 * `accessibilityViewIsModal` is here and was not there. A sheet that a screen
 * reader can wander out of behind the scrim is a sheet only sighted users can
 * dismiss, and C-7 is a launch gate rather than polish.
 */

export interface SheetProps {
  open: boolean;
  /** Rendered as the sheet's heading and used as its accessibility label. */
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
  testID?: string;
}

export function Sheet({
  open,
  title,
  onClose,
  closeLabel = "Close",
  children,
  testID,
}: SheetProps) {
  if (!open) return null;
  return (
    <View style={styles.overlay} testID={testID}>
      <Pressable
        testID={testID ? `${testID}-scrim` : undefined}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        style={styles.scrim}
        onPress={onClose}
      />
      <View style={[styles.dock, POINTER_BOX_NONE]}>
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          accessibilityLabel={title}
        >
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              testID={testID ? `${testID}-close` : undefined}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              style={styles.close}
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

/** The bare overlay, for HarnessPill, which supplies its own chrome. */
export function SheetOverlay({
  onScrimPress,
  scrimLabel,
  children,
}: {
  onScrimPress: () => void;
  scrimLabel: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={scrimLabel}
        style={styles.scrim}
        onPress={onScrimPress}
      />
      <View style={[styles.dock, POINTER_BOX_NONE]}>
        <View style={styles.sheet}>
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </View>
  );
}

/** react-native-web deprecated the `pointerEvents` prop in favour of the style. */
const POINTER_BOX_NONE = { pointerEvents: "box-none" } as const;

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  // An absolutely-positioned box with left and right both set takes its width
  // from them and cannot centre itself, so the positioned element is a
  // full-width dock and the sheet centres inside it.
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  sheet: {
    // The app renders as a phone frame centred in the window (App.tsx's
    // `frame`), so a sheet spanning the whole viewport reads as belonging to
    // the browser rather than to the app. The scrim still covers everything.
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    maxHeight: "70%",
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSubtle,
  },
  title: { ...type.railHeader, color: color.textPrimary, flex: 1 },
  close: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  closeGlyph: { fontSize: 16, color: color.textSecondary },
  body: { padding: space.lg, gap: space.md },
});
