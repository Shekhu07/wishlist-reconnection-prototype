// Platform.OS is not "web" under this preset, and the native branch returns
// true unconditionally -- so without pinning the platform, every assertion
// here would pass or fail for a reason that has nothing to do with the flag.
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { Platform } from "react-native";
import { resolveHarnessEnabled } from "@/harness/enabled";

/**
 * The harness is hidden in a shipped build, not removed. These tests are the
 * difference between the two: they pin that a researcher can always get it
 * back, and that getting it back survives the app rewriting its own URL.
 */

const platform = Platform as { OS: string };
const realLocation = window.location;

function visit(search: string): void {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...realLocation, search },
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  visit("");
  platform.OS = "web";
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

afterAll(() => {
  Object.defineProperty(window, "location", { writable: true, value: realLocation });
});

describe("who sees the state harness", () => {
  it("is off in a shipped build, so a shared link carries no research chrome", () => {
    expect(resolveHarnessEnabled()).toBe(false);
  });

  it("is on in development, where the pill is where developers expect it", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    expect(resolveHarnessEnabled()).toBe(true);
  });

  it("comes back for a researcher who asks for it", () => {
    visit("?harness=1");
    expect(resolveHarnessEnabled()).toBe(true);
  });

  it("survives the app rewriting its own URL", () => {
    // pathFor() drops the query string on every navigation, so without the
    // remembered answer the harness would exist on the first screen and
    // nowhere else -- reachable once is worse than absent.
    visit("?harness=1");
    expect(resolveHarnessEnabled()).toBe(true);
    visit("/wishlist");
    expect(resolveHarnessEnabled()).toBe(true);
  });

  it("can be turned back off without closing the tab", () => {
    visit("?harness=1");
    expect(resolveHarnessEnabled()).toBe(true);
    visit("?harness=0");
    expect(resolveHarnessEnabled()).toBe(false);
    visit("");
    expect(resolveHarnessEnabled()).toBe(false);
  });

  it("stays on for a native build, which has no URL to carry a flag", () => {
    platform.OS = "ios";
    expect(resolveHarnessEnabled()).toBe(true);
  });

  it("still works when the tab cannot remember anything", () => {
    // Private windows and some embeddings throw on sessionStorage access
    // rather than returning null. The flag must still be read from the URL.
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    visit("?harness=1");
    expect(resolveHarnessEnabled()).toBe(true);
    visit("");
    expect(resolveHarnessEnabled()).toBe(false);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
