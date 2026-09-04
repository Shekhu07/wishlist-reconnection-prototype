import { navFromPath, pop, push, pathFor, rootFor, switchTab, top, type Nav } from "@/shell/nav";

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

  it("restores a fresh page load back to the nav that produced its URL", () => {
    expect(navFromPath("/", "")).toEqual({ nav: home, query: "" });

    expect(navFromPath("/results", "?q=nike%20shoes")).toEqual({
      nav: push(home, { name: "results" }),
      query: "nike shoes",
    });

    expect(navFromPath("/product/1234", "")).toEqual({
      nav: push(home, { name: "product", productId: 1234 }),
      query: "",
    });

    expect(navFromPath("/saved/wi_1", "")).toEqual({
      nav: push(home, { name: "saved", itemId: "wi_1" }),
      query: "",
    });

    expect(navFromPath("/compare/wi_1", "")).toEqual({
      nav: push(home, { name: "compare", itemId: "wi_1" }),
      query: "",
    });

    expect(navFromPath("/compare/wi_1/option/42", "")).toEqual({
      nav: push(push(home, { name: "compare", itemId: "wi_1" }), {
        name: "alternative",
        itemId: "wi_1",
        productId: 42,
      }),
      query: "",
    });

    expect(navFromPath("/browse/luxury", "")).toEqual({
      nav: { tab: "luxury", stack: [rootFor("luxury")] },
      query: "",
    });

    expect(navFromPath("/category/footwear", "")).toEqual({
      nav: push(home, { name: "category", key: "footwear" }),
      query: "",
    });

    expect(navFromPath("/bag", "")).toEqual({
      nav: { tab: "bag", stack: [rootFor("bag")] },
      query: "",
    });

    expect(navFromPath("/checkout", "")).toEqual({
      nav: push({ tab: "bag", stack: [rootFor("bag")] }, { name: "checkout" }),
      query: "",
    });
  });

  it("refuses to guess at an unrecognised or malformed path, rather than half-restoring it", () => {
    expect(navFromPath("/product/not-a-number", "")).toBeNull();
    expect(navFromPath("/category/not-a-real-category", "")).toBeNull();
    expect(navFromPath("/browse/not-a-real-filter", "")).toBeNull();
    expect(navFromPath("/soon", "")).toBeNull();
    expect(navFromPath("/something-unknown", "")).toBeNull();
  });
});
