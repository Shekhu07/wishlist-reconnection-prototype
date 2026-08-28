import { StyleSheet, Text, View } from "react-native";
import {
  CHANGE_COPY,
  REVIEW_CHANGES,
  RESUME_ACTION,
  RESUME_TITLE,
  START_FRESH,
  STALE_TITLE,
  STALE_TITLE_MANY,
} from "@/copy/bundle";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { color, space, spec, type } from "@/design/tokens";
import type { SessionChange } from "@/state/comparisonSession";

/**
 * CR-03 and CR-05, which are the same sheet in two states.
 *
 * The wireframes separate them, but the user's question is identical -- "what
 * am I getting back?" -- and answering it honestly means the stale case is not
 * a different screen, it is the same screen with worse news. Splitting them
 * would let the healthy path drift into a confirmation nobody reads.
 *
 * "Start fresh" is a real alternative and is drawn as one. It clears the
 * session comparison and never touches the Wishlist; the copy says so, and the
 * store has no access to the Wishlist to do otherwise.
 */

export interface ResumeSheetProps {
  open: boolean;
  query: string;
  count: number;
  detail: string;
  changes: SessionChange[];
  /** Name per changed product, so the sheet says *what* changed, not just how many. */
  nameFor: (productId: number) => string;
  onClose: () => void;
  onResume: () => void;
  onStartFresh: () => void;
}

export function ResumeSheet({
  open,
  query,
  count,
  detail,
  changes,
  nameFor,
  onClose,
  onResume,
  onStartFresh,
}: ResumeSheetProps) {
  const stale = changes.length > 0;

  return (
    <Sheet open={open} title={RESUME_TITLE} onClose={onClose} testID="resume-sheet">
      <Text style={styles.body}>
        You were comparing {count} items for “{query}”.
      </Text>
      <Text style={styles.detail}>{detail}</Text>

      {stale ? (
        <View style={styles.changes} testID="resume-changes">
          <Text style={styles.changesTitle}>
            {changes.length === 1 ? STALE_TITLE : STALE_TITLE_MANY(changes.length)}
          </Text>
          {/* Named, not counted. "One item changed" without saying which is a
              notification; saying which is a recovery (section 19). */}
          {changes.map((change) => (
            <Text
              key={`${change.productId}-${change.kind}`}
              style={styles.change}
              testID={`resume-change-${change.productId}`}
            >
              ! {nameFor(change.productId)} is {CHANGE_COPY[change.kind]}
            </Text>
          ))}
          <Text style={styles.reassure}>
            Nothing has been replaced. The changed items are still in your comparison,
            marked.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          testID="resume-confirm"
          filled
          label={stale ? REVIEW_CHANGES : RESUME_ACTION}
          onPress={onResume}
        />
        <Button
          testID="resume-start-fresh"
          filled={false}
          label={START_FRESH}
          onPress={onStartFresh}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, fontSize: 14, color: color.textPrimary, lineHeight: 19 },
  detail: { ...type.body, color: color.textSecondary },
  changes: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: spec.recoveryBorder,
    backgroundColor: spec.recoverySurface,
    gap: space.xs,
  },
  changesTitle: { ...type.body, fontWeight: "700", color: spec.recoveryText },
  change: { ...type.body, color: spec.recoveryText, lineHeight: 17 },
  reassure: { ...type.chip, color: spec.recoveryText, marginTop: space.xs, lineHeight: 15 },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
});
