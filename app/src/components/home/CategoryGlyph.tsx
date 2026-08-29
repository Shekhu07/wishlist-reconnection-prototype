import { StyleSheet, View } from "react-native";
import type { CategoryKey } from "@/search/catalogBrowse";
import { color } from "@/design/tokens";

/**
 * The mark inside a category circle.
 *
 * These circles used to hold a catalog photograph, cropped to fill: the
 * dataset ships full-body model shots, so a 56px disc showed a headless torso,
 * and because the cover is picked by review count the same model appeared in
 * more than one circle. The design spec never asked for that -- it declares
 * `<image-slot id="cat-Fashion" shape="circle">`, an artwork slot distinct
 * from the product `imgId`s used everywhere else -- so a photograph was our
 * shortcut, not the spec's instruction.
 *
 * Drawn from Views rather than an icon font or SVG, the same way the shell's
 * chevron, pin and mic glyphs are: this project has no SVG dependency, and a
 * shape composed from tokens carries layout identically without a font gamble.
 * Six marks in one ink at one weight, so the row reads as a set.
 */
export function CategoryGlyph({ category }: { category: CategoryKey }) {
  switch (category) {
    case "fashion":
      return (
        <View style={g.box}>
          <View style={g.shirtBody} />
          <View style={g.shirtSleeveLeft} />
          <View style={g.shirtSleeveRight} />
          <View style={g.shirtNeck} />
        </View>
      );
    case "beauty":
      return (
        <View style={g.box}>
          <View style={g.bottleCap} />
          <View style={g.bottleBody} />
        </View>
      );
    case "kids":
      return (
        <View style={g.box}>
          <View style={g.teddyHead} />
          <View style={g.teddyEarLeft} />
          <View style={g.teddyEarRight} />
        </View>
      );
    case "footwear":
      return (
        <View style={g.box}>
          <View style={g.shoeSole} />
          <View style={g.shoeUpper} />
        </View>
      );
    case "accessories":
      return (
        <View style={g.box}>
          <View style={g.bagHandle} />
          <View style={g.bagBody} />
        </View>
      );
    case "home":
      return (
        <View style={g.box}>
          <View style={g.roofClip}>
            <View style={g.roof} />
          </View>
          <View style={g.houseBody} />
        </View>
      );
  }
}

const INK = color.textPrimary;
const STROKE = 2;

/**
 * Outlined, not filled.
 *
 * The first pass filled every mark solid, which at 28px turned each one into a
 * heavy black blob: the shirt read as a bin and the balloon as a tree, because
 * a silhouette that small has only its outline left to identify it. Stroked
 * shapes carry the same geometry at a fraction of the visual weight, and the
 * row stops competing with the product photography below it.
 */
const g = StyleSheet.create({
  box: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },

  // Body, with the sleeves stepped out at the shoulder and a neckline notched
  // out of the top edge -- the two features that separate a t-shirt from a
  // rectangle.
  shirtBody: {
    width: 16,
    height: 19,
    borderWidth: STROKE,
    borderColor: INK,
    borderRadius: 2,
  },
  shirtSleeveLeft: {
    position: "absolute",
    left: 1,
    top: 4,
    width: 6,
    height: 8,
    borderWidth: STROKE,
    borderColor: INK,
    borderRightWidth: 0,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 2,
  },
  shirtSleeveRight: {
    position: "absolute",
    right: 1,
    top: 4,
    width: 6,
    height: 8,
    borderWidth: STROKE,
    borderColor: INK,
    borderLeftWidth: 0,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 2,
  },
  shirtNeck: {
    position: "absolute",
    top: 3,
    width: 8,
    height: 5,
    borderWidth: STROKE,
    borderColor: INK,
    borderTopWidth: 0,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    backgroundColor: color.surfaceMuted,
  },

  bottleCap: { width: 6, height: 4, backgroundColor: INK, borderRadius: 1 },
  bottleBody: {
    width: 14,
    height: 17,
    borderWidth: STROKE,
    borderColor: INK,
    borderRadius: 4,
    marginTop: 1,
  },

  // A teddy: ears are what make this unmistakably the kids' shelf, where a
  // bare circle on a string read as a tree.
  teddyHead: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: STROKE,
    borderColor: INK,
  },
  teddyEarLeft: {
    position: "absolute",
    left: 3,
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: STROKE,
    borderColor: INK,
    backgroundColor: color.surfaceMuted,
  },
  teddyEarRight: {
    position: "absolute",
    right: 3,
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: STROKE,
    borderColor: INK,
    backgroundColor: color.surfaceMuted,
  },

  // Upper and sole as one outline: a low heel at the back, a rounded toe at
  // the front, which is the whole of a shoe at this size.
  shoeUpper: {
    position: "absolute",
    left: 4,
    top: 7,
    width: 9,
    height: 10,
    borderWidth: STROKE,
    borderColor: INK,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 1,
  },
  shoeSole: {
    position: "absolute",
    left: 2,
    bottom: 7,
    width: 24,
    height: 7,
    borderWidth: STROKE,
    borderColor: INK,
    borderTopLeftRadius: 1,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 3,
    backgroundColor: color.surfaceMuted,
  },

  bagHandle: {
    width: 12,
    height: 8,
    borderWidth: STROKE,
    borderColor: INK,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  bagBody: {
    width: 22,
    height: 15,
    borderWidth: STROKE,
    borderColor: INK,
    borderRadius: 3,
  },

  roofClip: { width: 26, height: 11, overflow: "hidden", alignItems: "center" },
  roof: {
    width: 16,
    height: 16,
    borderWidth: STROKE,
    borderColor: INK,
    transform: [{ rotate: "45deg" }],
    marginTop: 4,
  },
  houseBody: {
    width: 18,
    height: 12,
    borderWidth: STROKE,
    borderColor: INK,
    borderTopWidth: 0,
  },
});
