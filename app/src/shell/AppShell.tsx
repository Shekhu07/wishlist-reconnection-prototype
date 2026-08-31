import type { ReactNode } from "react";
import { Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
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
        <MobileStatusBar />
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
        <HomeIndicator />
      </View>
    </SafeAreaView>
  );
}

function MobileStatusBar() {
  if (Platform.OS !== "web") return null;
  return (
    <View style={statusStyles.bar} accessibilityRole="none" testID="mobile-status-bar">
      <Text style={statusStyles.time}>9:41</Text>
      <View style={statusStyles.notch} />
      <View style={statusStyles.icons}>
        <View style={statusStyles.cellular}>
          <View style={[statusStyles.cellBar, { height: 4 }]} />
          <View style={[statusStyles.cellBar, { height: 6 }]} />
          <View style={[statusStyles.cellBar, { height: 8 }]} />
          <View style={[statusStyles.cellBar, { height: 10 }]} />
        </View>
        <View style={statusStyles.battery}>
          <View style={statusStyles.batteryBody}>
            <View style={statusStyles.batteryLevel} />
          </View>
          <View style={statusStyles.batteryCap} />
        </View>
      </View>
    </View>
  );
}

function HomeIndicator() {
  if (Platform.OS !== "web") return null;
  return (
    <View style={indicatorStyles.wrap} pointerEvents="none" testID="home-indicator">
      <View style={indicatorStyles.bar} />
    </View>
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

const statusStyles = StyleSheet.create({
  bar: {
    height: 28,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(0,0,0,0.04)",
  },
  time: {
    fontSize: 12,
    fontWeight: "700",
    color: color.textPrimary,
  },
  notch: {
    width: 80,
    height: 16,
    backgroundColor: "#141414",
    borderRadius: 8,
    position: "absolute",
    left: "50%",
    marginLeft: -40,
    top: 6,
  },
  icons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cellular: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 1.5,
    height: 10,
  },
  cellBar: {
    width: 2.5,
    backgroundColor: color.textPrimary,
    borderRadius: 0.5,
  },
  battery: {
    flexDirection: "row",
    alignItems: "center",
  },
  batteryBody: {
    width: 18,
    height: 9,
    borderRadius: 2.5,
    borderWidth: 1,
    borderColor: color.textPrimary,
    padding: 1,
  },
  batteryLevel: {
    width: "75%",
    height: "100%",
    backgroundColor: color.textPrimary,
    borderRadius: 1,
  },
  batteryCap: {
    width: 1.5,
    height: 4,
    backgroundColor: color.textPrimary,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
});

const indicatorStyles = StyleSheet.create({
  wrap: {
    height: 14,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 2,
  },
  bar: {
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
});

