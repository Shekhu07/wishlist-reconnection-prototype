import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { ConfidencePanel } from "@/components/ConfidencePanel";
import { ResumeBar } from "@/components/ResumeBar";
import { ResumeSheet } from "@/components/ResumeSheet";
import { WhySheet } from "@/components/WishlistModule/WhySheet";
import { WishlistModule } from "@/components/WishlistModule";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { signalsFor } from "@/confidence/signals";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";
import { MIN_TOUCH_TARGET } from "@/design/tokens";
import type { Match, MatchResponse } from "@/match/contract";
import { makeCatalog, makeWishlist } from "../__tests__/helpers/fixtures";
import { recordGate } from "./report";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * Constraint C-7, which the plan calls a launch gate and which has never had
 * one.
 *
 * Its only measured assertion lived inside module.test.tsx and covered the
 * dismiss control's hit target. Everything Part A and Part B added -- an
 * expanding evidence panel, four sheets, a resume bar -- is exactly the kind
 * of surface that fails quietly for a screen-reader user while looking fine.
 *
 * Three properties, measured across every new surface:
 *
 *   1. every interactive element has a label;
 *   2. every touch target reaches 44pt, by size or by hit slop;
 *   3. anything that expands or traps focus says so in accessibilityState.
 */

const noop = () => undefined;

function match(): Match {
  return {
    parent_product_id: "pp_shirt",
    sku: "sku_1001_M",
    tier: 1,
    confidence: 0.91,
    identity_confidence: 1,
    saved: { color: "Blue", size: "M", saved_at: "2026-08-01", price_at_save: 1999 },
    current: {
      available: true,
      price: 1999,
      seller: "Myntra Retail",
      delivery_by: "2026-08-29",
      state: "purchasable",
    },
    copy_key: "exact_variant_available",
    display: { brand: "Mark Taylor", name: "Striped Shirt", imageId: 1001 },
  };
}

const response: MatchResponse = { matches: [match()], capped_total: 1, suppressed: false };

function savedProduct(): ReactElement {
  const catalog = makeCatalog();
  const item = makeWishlist().items[0];
  const result = revalidate(item, catalog, new InventorySimulator(catalog), "560034")!;
  return (
    <SavedProductScreen
      result={result}
      pincode="560034"
      selectedSize={item.size}
      onBack={noop}
      onMoveToBag={noop}
      onRecoveryPrimary={noop}
      onRecoverySecondary={noop}
      onChooseSize={noop}
      onChooseColour={noop}
      tags={[]}
      onToggleTag={noop}
    />
  );
}

function panel(): ReactElement {
  const catalog = makeCatalog();
  const item = makeWishlist().items[0];
  const result = revalidate(item, catalog, new InventorySimulator(catalog), "560034")!;
  return (
    <ConfidencePanel
      signals={signalsFor(result, { size: item.size, colour: item.colour })}
      initiallyExpanded
    />
  );
}

const SURFACES: [string, () => ReactElement][] = [
  ["wishlist module", () => (
    <WishlistModule
      response={response}
      onDismiss={noop}
      onUndo={noop}
      onPrimary={noop}
      onSecondary={noop}
      onWhy={noop}
    />
  )],
  ["confidence panel", panel],
  ["saved product", savedProduct],
  ["why sheet", () => (
    <WhySheet open onClose={noop} onViewItem={noop} onHideForSearch={noop} onHideAlways={noop} />
  )],
  ["resume bar", () => (
    <ResumeBar
      count="3 items in your comparison"
      detail="Priority: fit"
      changedCount={0}
      onResume={noop}
      onDismiss={noop}
    />
  )],
  ["resume sheet", () => (
    <ResumeSheet
      open
      query="black blazer"
      count={3}
      detail="Priority: fit"
      changes={[{ productId: 1001, kind: "size_unavailable" }]}
      nameFor={() => "Mark Taylor Striped Shirt · Blue"}
      onClose={noop}
      onResume={noop}
      onStartFresh={noop}
    />
  )],
];

/**
 * Effective touch size, counting hit slop the way a finger does.
 *
 * Width is the hard part, and the honest answer is that this cannot fully be
 * measured from a node's own props. React Native's default `alignItems` is
 * `stretch`, so a child of a column container fills the cross axis with no
 * width of its own, while the identical style inside a row container sizes to
 * its content. The parent decides, and a static check does not see the parent.
 *
 * So the rule is: an element that *declares* a width has to meet the floor,
 * and one that declares none is assumed to stretch. That keeps the case the
 * constraint actually exists for -- a small glyph or icon target -- and drops
 * the false positives that made this gate's first run flag fourteen
 * perfectly good full-width rows. The limit is stated in the caveat rather
 * than hidden, because a reader deserves to know the number is a floor and
 * not a proof.
 */
function reaches(node: { props: Record<string, unknown> }): { ok: boolean; why: string } {
  const style = (Array.isArray(node.props.style) ? node.props.style : [node.props.style])
    .filter(Boolean)
    .reduce<Record<string, unknown>>((acc, layer) => Object.assign(acc, layer), {});
  const slop = (node.props.hitSlop ?? {}) as Record<string, number>;
  const num = (value: unknown) => (typeof value === "number" ? value : undefined);

  // An absolutely-positioned fill (a scrim) covers the screen on both axes.
  const fills =
    style.position === "absolute" &&
    num(style.left) === 0 &&
    num(style.right) === 0 &&
    num(style.top) === 0 &&
    num(style.bottom) === 0;
  if (fills) return { ok: true, why: "" };

  const declaredHeight = num(style.minHeight) ?? num(style.height);
  const height = (declaredHeight ?? 20) + (slop.top ?? 0) + (slop.bottom ?? 0);
  if (height < MIN_TOUCH_TARGET) return { ok: false, why: `height ${height}` };

  const declaredWidth = num(style.minWidth) ?? num(style.width);
  if (declaredWidth === undefined) return { ok: true, why: "" };
  const width = declaredWidth + (slop.left ?? 0) + (slop.right ?? 0);
  if (width < MIN_TOUCH_TARGET) return { ok: false, why: `width ${width}` };
  return { ok: true, why: "" };
}

describe("C-7 accessibility gate", () => {
  it("labels every control and sizes every target across all new surfaces", () => {
    const unlabelled: string[] = [];
    const undersized: string[] = [];
    let controls = 0;

    for (const [name, build] of SURFACES) {
      const view = render(build());
      const buttons = screen.queryAllByRole("button");
      for (const button of buttons) {
        controls += 1;
        const label = button.props.accessibilityLabel;
        const id = button.props.testID ?? "(no testID)";
        if (typeof label !== "string" || label.trim() === "") {
          unlabelled.push(`${name} · ${id}`);
        }
        const size = reaches(button);
        if (!size.ok) undersized.push(`${name} · ${id} (${size.why})`);
      }
      view.unmount();
    }

    recordGate({
      id: "C7-accessibility",
      epic: "C-7 — accessibility",
      requirement: "every control labelled, every touch target ≥44pt across the Part A and Part B surfaces",
      measured: `${unlabelled.length} unlabelled and ${undersized.length} undersized of ${controls} controls across ${SURFACES.length} surfaces`,
      pass: unlabelled.length === 0 && undersized.length === 0,
      caveat:
        "Static assertions over rendered props, and a floor rather than a proof. Width is only checked where an element declares one: React Native stretches a column child by default, so a static check cannot tell a self-sizing pill from a full-width row without seeing the parent. It also does not test focus order, colour contrast, or what a screen reader actually announces, and it cannot run VoiceOver or TalkBack — the plan's manual pass is still required and is not replaced by this number.",
    });

    // A gate that rendered nothing would pass every assertion above.
    expect(controls).toBeGreaterThan(10);
    expect(unlabelled).toEqual([]);
    expect(undersized).toEqual([]);
  });

  it("declares expansion and modality in state rather than only in pixels", () => {
    // A panel that visually expands but never says `expanded` is a panel a
    // screen-reader user cannot tell is open. Same for a sheet that traps
    // focus visually and not semantically.
    const view = render(panel());
    expect(screen.getByTestId("confidence-toggle").props.accessibilityState.expanded).toBe(true);
    view.unmount();

    const sheet = render(
      <WhySheet open onClose={noop} onViewItem={noop} onHideForSearch={noop} onHideAlways={noop} />
    );
    expect(
      screen.getByLabelText("Why are you seeing this?").props.accessibilityViewIsModal
    ).toBe(true);
    sheet.unmount();
  });

  it("announces the post-add confirmation to a screen reader", () => {
    // The toast is visual-only and gone in 2.6 seconds; the confirmation that
    // replaced it has to be reachable by someone who cannot see it.
    const catalog = makeCatalog();
    const item = makeWishlist().items[0];
    const result = revalidate(item, catalog, new InventorySimulator(catalog), "560034")!;
    render(
      <SavedProductScreen
        result={result}
        pincode="560034"
        selectedSize={item.size}
        onBack={noop}
        onMoveToBag={noop}
        onRecoveryPrimary={noop}
        onRecoverySecondary={noop}
        onChooseSize={noop}
        added="added"
        onAfterAdd={noop}
      />
    );
    const alert = screen.getByTestId("added-confirmation");
    expect(alert.props.accessibilityRole).toBe("alert");
    expect(alert.props.accessibilityLiveRegion).toBe("polite");
  });
});
