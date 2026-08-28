import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, color, space, type } from "@/design/tokens";

/**
 * The account screen from the design spec.
 *
 * Every row but Wishlist is a named stub. That is the shell's existing rule
 * for a surface the prototype does not build (section 4.14, and the same
 * reason `StubScreen` says what it is instead of rendering nothing): a row
 * that silently does nothing reads as a broken build, and a row that opens a
 * convincing empty screen is worse -- it implies a feature was tested.
 */

export interface ProfileRow {
  key: string;
  label: string;
  /** Null routes to a named stub rather than nowhere. */
  onOpen: (() => void) | null;
}

export function ProfileScreen({
  rows,
  onStub,
}: {
  rows: ProfileRow[];
  onStub: (label: string) => void;
}) {
  return (
    <ScrollView style={styles.screen} testID="profile-screen">
      <View style={styles.identity}>
        <View style={styles.avatar} />
        <View>
          <Text style={styles.name}>Hi, Shopper</Text>
          <Text style={styles.email}>shopper@example.com</Text>
        </View>
      </View>
      {rows.map((row) => (
        <Pressable
          key={row.key}
          testID={`profile-row-${row.key}`}
          accessibilityRole="button"
          accessibilityLabel={row.label}
          onPress={() => (row.onOpen ? row.onOpen() : onStub(row.label))}
          style={styles.row}
        >
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSubtle,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.surfaceMuted,
  },
  name: { ...type.railHeader, color: color.textPrimary },
  email: { ...type.chip, fontWeight: "400", color: color.textSecondary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSubtle,
  },
  rowLabel: { fontSize: 13, color: color.textPrimary },
  chevron: { fontSize: 14, color: color.textSecondary },
});
