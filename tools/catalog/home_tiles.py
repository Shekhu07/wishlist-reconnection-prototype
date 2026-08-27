"""Tiles for the synthetic home range.

The image mirror has no photograph of a product that does not exist. These are
deliberately not photographic: a borrowed fashion photograph would be the
actual lie, because a participant would read it as a real listing.

Flat colour field, product name, and a marker that says what it is.
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


def _ink(rgb):
    """Readable text colour for a background, by perceived luminance."""
    luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    return (32, 34, 44) if luma > 140 else (245, 245, 247)


def write(parents, out_dir):
    from PIL import Image, ImageDraw

    os.makedirs(out_dir, exist_ok=True)
    written = []
    for parent in parents:
        for colourway in parent["colourways"]:
            rgb = SWATCHES.get(colourway["colour"].lower(), FALLBACK)
            image = Image.new("RGB", SIZE, rgb)
            draw = ImageDraw.Draw(image)
            ink = _ink(rgb)
            draw.rectangle([28, 28, SIZE[0] - 28, SIZE[1] - 28], outline=ink, width=2)
            draw.text((44, SIZE[1] - 96), parent["brand"], fill=ink)
            draw.text((44, SIZE[1] - 76), colourway["display_name"], fill=ink)
            draw.text((44, SIZE[1] - 56), "illustrative - not a photograph", fill=ink)
            image.save(
                os.path.join(out_dir, "%d.jpg" % colourway["product_id"]),
                "JPEG",
                quality=88,
            )
            written.append(colourway["product_id"])
    return written
