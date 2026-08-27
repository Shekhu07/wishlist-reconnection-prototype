"""Tiles for the synthetic home range.

The image mirror has no photograph of a product that does not exist. These are
deliberately not photographic: a borrowed fashion photograph would be the
actual lie, because a participant would read it as a real listing.

The tile is the asset a participant actually sees, and it is seen small: a
384x512 source scales to a ~96x128 catalog card (0.25x) and a ~156pt carousel
card (~0.41x). A caption sized for the full canvas disappears at those sizes,
so the disclosure here is deliberately short, large, and backed by a solid
band -- a shape a viewer registers without reading anything -- plus a
diagonal hatch across the whole tile as a second, independent non-text cue.
Brand and product name stay on the tile but are allowed to be smaller: they
are context, not the thing that must survive scaling.
"""

import os

SIZE = (384, 512)
SWATCHES = {
    "beige": (222, 209, 190),
    "grey": (176, 178, 183),
    "navy blue": (43, 57, 92),
    "mustard": (206, 166, 60),
    "white": (240, 240, 242),
    "teal": (58, 124, 124),
    "charcoal": (68, 70, 76),
    "olive": (124, 128, 84),
    "rust": (166, 88, 62),
}
FALLBACK = (200, 200, 205)

DARK = (32, 34, 44)
LIGHT = (245, 245, 247)

DISCLOSURE = "NOT A PHOTO"


def _luma(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def _ink(rgb):
    """Readable text/outline colour for a background, by perceived luminance."""
    return DARK if _luma(rgb) > 140 else LIGHT


def _band_pair(rgb):
    """(band fill, text fill) -- always maximum contrast, independent of the
    swatch, so the disclosure is legible regardless of which colour it lands
    on."""
    return (DARK, LIGHT) if _luma(rgb) > 140 else (LIGHT, DARK)


def _mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _draw_hatch(draw, size, rgb, ink, spacing=36):
    """Diagonal hatch across the whole tile -- a texture cue that survives
    heavy downscaling even when no text does."""
    w, h = size
    colour = _mix(rgb, ink, 0.16)
    for x in range(-h, w, spacing):
        draw.line([(x, 0), (x + h, h)], fill=colour, width=2)


def write(parents, out_dir):
    from PIL import Image, ImageDraw, ImageFont

    os.makedirs(out_dir, exist_ok=True)
    disclosure_font = ImageFont.load_default(size=44)
    label_font = ImageFont.load_default(size=20)

    written = []
    for parent in parents:
        for colourway in parent["colourways"]:
            rgb = SWATCHES.get(colourway["colour"].lower(), FALLBACK)
            image = Image.new("RGB", SIZE, rgb)
            draw = ImageDraw.Draw(image)
            ink = _ink(rgb)

            _draw_hatch(draw, SIZE, rgb, ink)
            draw.rectangle([28, 28, SIZE[0] - 28, SIZE[1] - 28], outline=ink, width=2)

            band_fill, text_fill = _band_pair(rgb)
            band_top, band_bottom = SIZE[1] // 2 - 46, SIZE[1] // 2 + 46
            draw.rectangle([0, band_top, SIZE[0], band_bottom], fill=band_fill)
            bbox = draw.textbbox((0, 0), DISCLOSURE, font=disclosure_font)
            text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(
                ((SIZE[0] - text_w) / 2 - bbox[0], (band_top + band_bottom) / 2 - text_h / 2 - bbox[1]),
                DISCLOSURE,
                fill=text_fill,
                font=disclosure_font,
            )

            draw.text((44, 44), parent["brand"], fill=ink, font=label_font)
            draw.text((44, 70), colourway["display_name"], fill=ink, font=label_font)

            image.save(
                os.path.join(out_dir, "%d.jpg" % colourway["product_id"]),
                "JPEG",
                quality=88,
            )
            written.append(colourway["product_id"])
    return written
