import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AskMayaStrip } from "@/components/home/AskMayaStrip";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { RecentSearches } from "@/components/home/RecentSearches";
import type { Catalog } from "@/data/types";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

export interface SearchEntryScreenProps {
  catalog: Catalog;
  /** Prior search terms, most recent first. Caller's job to order/persist. */
  recents: string[];
  onSubmit: (query: string) => void;
  onClearRecents: () => void;
  onBack: () => void;
  /** Fired by every voice/image/camera search affordance -- none are wired. */
  onNotImplemented: () => void;
}

export function SearchEntryScreen({
  catalog,
  recents,
  onSubmit,
  onClearRecents,
  onBack,
  onNotImplemented,
}: SearchEntryScreenProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="search-entry">
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>

        <View style={styles.inputWrap}>
          <TextInput
            accessibilityLabel="Search for products"
            autoFocus
            returnKeyType="search"
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            placeholder="Search for products, brands and more"
            placeholderTextColor={color.textSecondary}
            style={styles.input}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search by voice"
          onPress={onNotImplemented}
          style={styles.iconButton}
        >
          <Text style={styles.iconGlyph}>🎤</Text>
        </Pressable>
      </View>

      <RecentSearches recents={recents} onSubmit={onSubmit} onClearRecents={onClearRecents} />

      <AskMayaStrip />

      <BrandCarousel catalog={catalog} onSubmit={onSubmit} />

      <View style={styles.pillRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search by image"
          onPress={onNotImplemented}
          style={styles.pill}
        >
          <Text style={styles.pillText}>Search by image</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search with camera"
          onPress={onNotImplemented}
          style={styles.pill}
        >
          <Text style={styles.pillText}>Search with camera</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingBottom: space.xl },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  backButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontSize: 24, color: color.textPrimary },
  inputWrap: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    backgroundColor: color.surface,
  },
  input: { ...type.body, fontSize: 14, color: color.textPrimary, padding: 0 },
  iconButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: { fontSize: 18 },
  pillRow: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  pill: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  pillText: { ...type.chip, color: color.textPrimary, fontWeight: "700" },
});
