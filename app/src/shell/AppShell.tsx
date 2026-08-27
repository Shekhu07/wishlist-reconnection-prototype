import type { ReactNode } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { color } from "@/design/tokens";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";
import { top, type Nav, type Tab } from "./nav";

export interface AppShellProps {
  nav: Nav;
  bagCount: number;
  onTab: (tab: Tab) => void;
  onBack: () => void;
  onOpenSearch: () => void;
  /** The harness pill. Optional so shell tests can render without it. */
  harness?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  nav,
  bagCount,
  onTab,
  onBack,
  onOpenSearch,
  harness,
  children,
}: AppShellProps) {
  return (
    <SafeAreaView style={styles.root} testID="app-shell">
      <TopBar screen={top(nav)} onBack={onBack} onOpenSearch={onOpenSearch} />
      <View style={styles.body}>{children}</View>
      {harness}
      <BottomNav tab={nav.tab} bagCount={bagCount} onTab={onTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  body: { flex: 1 },
});
