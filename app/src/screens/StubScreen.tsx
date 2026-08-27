import { StyleSheet, Text, View } from "react-native";
import { color, space, type } from "@/design/tokens";

export function StubScreen({ reason }: { reason: string }) {
  return (
    <View style={styles.screen} testID="stub-screen">
      <Text style={styles.text}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  text: { ...type.body, color: color.textSecondary, textAlign: "center" },
});
