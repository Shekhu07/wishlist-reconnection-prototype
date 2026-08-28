import { Platform } from "react-native";

/**
 * Whether the E12 state harness is reachable on this load.
 *
 * The pill is the only way into the ten states, the experiment arms, the
 * stock and pincode controls and the kill switch, so it is *hidden* rather
 * than deleted. Anyone sent the deployed link gets the app without research
 * chrome; a researcher adds `?harness=1` and every control comes back.
 *
 * Three rules, in order:
 *
 *   1. Native is always on. There is no URL to carry a flag, and a native
 *      build of this prototype is a research build by definition.
 *   2. `?harness=1` turns it on, `?harness=0` turns it off, and either
 *      decision is remembered for the rest of the browser tab.
 *   3. Otherwise: on in development, off in a production export.
 *
 * Rule 2 stores the answer because the app rewrites its own URL as you
 * navigate (`pathFor` in shell/nav.ts, via useSyncedHistory), and that rewrite
 * does not carry the query string. Without the memory, the harness would
 * vanish the moment a researcher opened the Wishlist -- reachable on the first
 * screen and nowhere else, which is worse than absent.
 */

const FLAG = "harness";
const STORAGE_KEY = "prototype.harness";

/** sessionStorage throws outright in some embeddings, not just when empty. */
function remember(enabled: boolean): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* A tab that cannot remember still works; it just needs the flag again. */
  }
}

function recall(): boolean | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored === null ? null : stored === "1";
  } catch {
    return null;
  }
}

/** null when the URL says nothing about the harness either way. */
function flagInUrl(): boolean | null {
  const raw = new URLSearchParams(window.location.search).get(FLAG);
  if (raw === null) return null;
  return raw !== "0" && raw !== "false";
}

export function resolveHarnessEnabled(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof window === "undefined") return false;

  const fromUrl = flagInUrl();
  if (fromUrl !== null) {
    remember(fromUrl);
    return fromUrl;
  }

  const remembered = recall();
  if (remembered !== null) return remembered;

  // `expo export` compiles this to false, so a shipped build is quiet by
  // default while `expo start` keeps the harness where developers expect it.
  return __DEV__;
}
