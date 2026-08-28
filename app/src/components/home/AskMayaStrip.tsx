import { StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/design/tokens";

/**
 * The one place `color.accentAssistant` / `accentAssistantSurface` are used
 * -- tinting any other module this way would misrepresent the user's own
 * saved item as an AI recommendation (design/tokens.ts).
 */
export function AskMayaStrip() {
  return (
    <View style={styles.strip} testID="ask-maya-strip">
      <Text style={styles.eyebrow}>ASK MAYA</Text>
      <Text style={styles.prompt}>Not sure what to search? Describe it and let Maya help.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginHorizontal: space.lg,
    marginVertical: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.accentAssistantSurface,
  },
  eyebrow: { ...type.tileBrand, letterSpacing: 0.4, color: color.accentAssistant },
  prompt: { ...type.body, color: color.textPrimary, marginTop: space.xs },
});
