import type { ReactNode } from "react";
import { Platform, SafeAreaView, StyleSheet, View } from "react-native";
import { FRAME_MAX_WIDTH, color } from "@/design/tokens";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";
import { top, type Nav, type Tab } from "./nav";

export interface AppShellProps {
  nav: Nav;
  bagCount: number;
  onTab: (tab: Tab) => void;
  onBack: () => void;
  onOpenSearch: () => void;
  onOpenWishlist: () => void;
  onOpenProfile: () => void;
  wishlistCount?: number;
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
  onOpenWishlist,
  onOpenProfile,
  wishlistCount,
  harness,
  sheet,
  children,
}: AppShellProps) {
  return (
    <SafeAreaView style={styles.root} testID="app-shell">
      <View style={styles.phoneFrame}>
        <TopBar
          screen={top(nav)}
          onBack={onBack}
          onOpenSearch={onOpenSearch}
          onOpenWishlist={onOpenWishlist}
          onOpenProfile={onOpenProfile}
          wishlistCount={wishlistCount}
        />
        <View style={styles.body}>{children}</View>
        {harness}
        {sheet}
        <BottomNav tab={nav.tab} bagCount={bagCount} onTab={onTab} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "#ECECED" : color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneFrame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    backgroundColor: color.surface,
    position: "relative",
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.12,
          shadowRadius: 28,
          elevation: 10,
        }
      : {}),
  },
  body: { flex: 1 },
});
