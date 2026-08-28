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
  /**
   * Overlay sheets (DC-02, DC-04, CR-03, Help me decide).
   *
   * They belong here, beside the harness, rather than inside the screen that
   * raises them. An absolutely-positioned overlay resolves against its nearest
   * positioned ancestor, so a sheet rendered inside the wishlist module is
   * clipped to the module and scrims only the module -- which is exactly what
   * it did, and no test could see it. The harness has always been correct for
   * this reason; sheets now share the position.
   */
  sheet?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  nav,
  bagCount,
  onTab,
  onBack,
  onOpenSearch,
  harness,
  sheet,
  children,
}: AppShellProps) {
  return (
    <SafeAreaView style={styles.root} testID="app-shell">
      <TopBar screen={top(nav)} onBack={onBack} onOpenSearch={onOpenSearch} />
      <View style={styles.body}>{children}</View>
      {harness}
      {sheet}
      <BottomNav tab={nav.tab} bagCount={bagCount} onTab={onTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  body: { flex: 1 },
});
