import { pop, push, pathFor, rootFor, switchTab, top, type Nav } from "@/shell/nav";

const home: Nav = { tab: "home", stack: [rootFor("home")] };

describe("shell navigation", () => {
  it("pushes and pops within a tab", () => {
    const deep = push(push(home, { name: "results" }), {
      name: "saved",
      itemId: "wi_1",
    });
    expect(top(deep)).toEqual({ name: "saved", itemId: "wi_1" });
    expect(top(pop(deep))).toEqual({ name: "results" });
  });

  it("never pops past a tab root", () => {
    expect(top(pop(home))).toEqual(rootFor("home"));
    expect(pop(home).stack).toHaveLength(1);
  });

  it("resets to the tab root when switching tabs", () => {
    const deep = push(home, { name: "results" });
    expect(switchTab(deep, "bag").stack).toEqual([rootFor("bag")]);
  });

  it("gives each screen a URL so a state is linkable", () => {
    expect(pathFor(home, "")).toBe("/");
    expect(pathFor(push(home, { name: "searchEntry" }), "")).toBe("/search");
    expect(pathFor(push(home, { name: "results" }), "nike shoes")).toBe(
      "/results?q=nike%20shoes"
    );
  });

  it("encodes query characters that would otherwise break the URL", () => {
    expect(pathFor(push(home, { name: "results" }), "black & white / \"tee\"")).toBe(
      `/results?q=${encodeURIComponent('black & white / "tee"')}`
    );
    // Space must become %20, not "+" -- this is a path/query string, not a form body.
    expect(pathFor(push(home, { name: "results" }), "a b")).toContain("%20");
    expect(pathFor(push(home, { name: "results" }), "a b")).not.toContain("+");
  });
});
