import { Pressable, StyleSheet, Text, View } from "react-native";
import { RESUME_DISMISS, RESUME_LABEL, STALE_TITLE, STALE_TITLE_MANY } from "@/copy/bundle";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * CR-02: the quiet re-entry point.
 *
 * "Quiet" is the whole specification. The wireframes are explicit that this is
 * not a blocking modal and not a popup -- it sits in the Search context, it is
 * dismissible, and it does not follow the user around. A comparison the user
 * abandoned is a mild offer, not an interruption; making it loud would turn a
 * memory aid into a nag, which is the same failure mode C-1 guards against on
 * the pricing side.
 *
 * When something changed while the user was away, the bar says so *here*
 * rather than waiting for them to tap through and discover it (CR-05, and
 * section 19's "graceful staleness"). Explaining before the click is what
 * separates a recovery from a surprise.
 */

export interface ResumeBarProps {
  count: string;
  detail: string;
  changedCount: number;
  onResume: () => void;
  onDismiss: () => void;
}

export function ResumeBar({
  count,
  detail,
  changedCount,
  onResume,
  onDismiss,
}: ResumeBarProps) {
  const stale = changedCount > 0;
  return (
    <View
      style={[styles.bar, stale && styles.barStale]}
      testID="resume-bar"
      accessibilityRole="summary"
    >
      <View style={styles.text}>
        <Text style={styles.count}>{count}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {stale
            ? changedCount === 1
              ? STALE_TITLE
              : STALE_TITLE_MANY(changedCount)
            : detail}
        </Text>
      </View>
      <Pressable
        testID="resume-bar-resume"
        accessibilityRole="button"
        accessibilityLabel={`${RESUME_LABEL}: ${count}`}
        onPress={onResume}
        style={styles.resume}
      >
        <Text style={styles.resumeText}>{RESUME_LABEL}</Text>
      </Pressable>
      <Pressable
        testID="resume-bar-dismiss"
        accessibilityRole="button"
        accessibilityLabel={RESUME_DISMISS}
        onPress={onDismiss}
        style={styles.dismiss}
      >
        <Text style={styles.dismissGlyph}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingLeft: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.card,
    // Untinted by default, for the reason section 4.2 gives about the module:
    // a coloured box on a results screen reads as promotion.
    backgroundColor: color.surface,
  },
  barStale: { borderColor: "#F0DFC0", backgroundColor: "#FFF6E5" },
  text: { flex: 1 },
  count: { ...type.body, fontWeight: "700", color: color.textPrimary },
  detail: { ...type.chip, color: color.textSecondary, marginTop: 1 },
  resume: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    justifyContent: "center",
  },
  resumeText: { ...type.body, fontWeight: "700", color: color.brandPink },
  dismiss: {
    width: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissGlyph: { fontSize: 15, color: color.textSecondary },
});
