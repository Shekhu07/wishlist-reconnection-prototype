import { render, screen } from "@testing-library/react-native";
import { BANNED_COPY_PATTERNS, COMPARE_AXES, COMPARE_SAVED_LABEL } from "@/copy/bundle";
import { CompareScreen, buildColumns } from "@/screens/CompareScreen";
import { InventorySimulator } from "@/revalidation/inventory";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * The E6 gate: zero monetary-incentive surfaces. A comparison table is the
 * likeliest place for one to reappear disguised as a column, so the axis list
 * is asserted as a whole rather than spot-checked.
 */

const PINCODE = "560034";
const noop = () => undefined;

function setup() {
  const catalog = makeCatalog();
  const wishlist = makeWishlist();
  const inventory = new InventorySimulator(catalog);
  const item = wishlist.items[0];
  const parent = catalog.parents[0];
  const colourway = parent.colourways.find((c) => c.product_id === item.product_id)!;
  return { catalog, wishlist, inventory, item, parent, colourway };
}

function renderCompare(query = "shirt") {
  const ctx = setup();
  render(
    <CompareScreen
      catalog={ctx.catalog}
      item={ctx.item}
      parent={ctx.parent}
      colourway={ctx.colourway}
      query={query}
      pincode={PINCODE}
      inventory={ctx.inventory}
      onBack={noop}
      onChoose={noop}
    />
  );
  return ctx;
}

function renderedText(): string {
  const collect = (node: { children: unknown[] }): string =>
    node.children
      .map((child) =>
        typeof child === "string" ? child : collect(child as { children: unknown[] })
      )
      .join(" ");
  return screen.root ? collect(screen.root) : "";
}

describe("compare options (E6)", () => {
  it("compares on exactly the axes the plan names", () => {
    expect(COMPARE_AXES.map((axis) => axis.key)).toEqual([
      "price",
      "rating",
      "review_count",
      "material",
      "fit",
      "sizes",
      "delivery",
      "returns",
    ]);
  });

  it("has no discount, offer or savings axis (constraint C-1)", () => {
    for (const axis of COMPARE_AXES) {
      expect(axis.key).not.toMatch(/discount|offer|saving|deal|off/i);
      expect(axis.label).not.toMatch(/discount|offer|saving|deal|% off/i);
    }
  });

  it("puts the saved item first and labels it as the user's own", () => {
    const ctx = renderCompare();
    expect(screen.getByText(COMPARE_SAVED_LABEL)).toBeTruthy();
    const columns = buildColumns(
      ctx.catalog,
      ctx.parent,
      ctx.colourway,
      ctx.item,
      "shirt",
      ctx.inventory
    );
    expect(columns[0].isSaved).toBe(true);
    expect(columns.slice(1).every((column) => !column.isSaved)).toBe(true);
  });

  it("shows the saved item plus at most four alternatives", () => {
    const ctx = setup();
    const columns = buildColumns(
      ctx.catalog,
      ctx.parent,
      ctx.colourway,
      ctx.item,
      "shirt",
      ctx.inventory
    );
    expect(columns.length).toBeGreaterThan(1);
    expect(columns.length).toBeLessThanOrEqual(5);
  });

  it("prefers alternatives from different products over other colourways", () => {
    const ctx = setup();
    const columns = buildColumns(
      ctx.catalog,
      ctx.parent,
      ctx.colourway,
      ctx.item,
      "shirt",
      ctx.inventory
    );
    const alternatives = columns.slice(1);
    const parents = alternatives.map((column) => column.parent.parent_product_id);
    // Distinct products lead. Same-product colourways may still backfill, but
    // they must not crowd out a genuinely different option.
    expect(new Set(parents).size).toBe(Math.min(parents.length, new Set(parents).size));
    if (alternatives.length > 0) {
      expect(alternatives[0].parent.parent_product_id).not.toBe(
        ctx.parent.parent_product_id
      );
    }
  });

  it("never lists the saved colourway twice", () => {
    const ctx = setup();
    const columns = buildColumns(
      ctx.catalog,
      ctx.parent,
      ctx.colourway,
      ctx.item,
      "shirt",
      ctx.inventory
    );
    const ids = columns.map((column) => column.colourway.product_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("answers size availability against the user's own saved size", () => {
    const ctx = renderCompare();
    expect(screen.getAllByText(new RegExp(`${ctx.item.size} (in stock|unavailable)`)).length)
      .toBeGreaterThan(0);
  });

  it("renders every axis label", () => {
    renderCompare();
    for (const axis of COMPARE_AXES) {
      expect(screen.getByText(axis.label)).toBeTruthy();
    }
  });

  it("says plainly that five of the axes are prototype data", () => {
    renderCompare();
    // A comparison invites a judgement. If the numbers behind it are invented,
    // the screen has to say so or the judgement is worthless.
    expect(screen.getByText(/rating, reviews, material, fit and returns are generated/i))
      .toBeTruthy();
  });

  it("carries no banned copy anywhere on the screen", () => {
    renderCompare();
    const text = renderedText();
    for (const pattern of BANNED_COPY_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it("formats every rating to the same precision", () => {
    renderCompare();
    const ratings = renderedText().match(/\d+(\.\d+)? ★/g) ?? [];
    expect(ratings.length).toBeGreaterThan(0);
    for (const rating of ratings) expect(rating).toMatch(/^\d\.\d ★$/);
  });

  it("labels every open action for a screen reader", () => {
    renderCompare();
    for (const button of screen.getAllByRole("button")) {
      expect(button.props.accessibilityLabel).toBeTruthy();
    }
  });
});
