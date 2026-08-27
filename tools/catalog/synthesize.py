"""Step 5: build the identity graph and synthesise what the dataset lacks.

The dataset gives one row per product with one colour and no size, price,
seller, stock or SKU. E1 needs parent_product <-> sku <-> wishlist_item to
resolve bidirectionally, so:

  * rows sharing (brand_key, articleType, gender, name_core) collapse into one
    parent product, and each row becomes one colourway of it;
  * every (parent, colourway, size) triple becomes a SKU;
  * price, seller and stock are derived from a SHA-1 of the SKU id, so the
    catalog is byte-identical on every machine and every run.

Nothing here pretends to be real commerce data. What is real is the attribute
distribution and the identity noise, which is the part the matcher has to cope
with.
"""

import hashlib
from collections import OrderedDict

SIZE_LADDERS = {
    "Topwear": ["XS", "S", "M", "L", "XL", "XXL"],
    "Bottomwear": ["28", "30", "32", "34", "36", "38"],
    "Dress": ["XS", "S", "M", "L", "XL"],
    "Saree": ["Onesize"],
    "Innerwear": ["S", "M", "L", "XL"],
    "Loungewear and Nightwear": ["S", "M", "L", "XL"],
    "Apparel Set": ["S", "M", "L", "XL"],
    "Shoes": ["UK6", "UK7", "UK8", "UK9", "UK10", "UK11"],
    "Flip Flops": ["UK6", "UK7", "UK8", "UK9", "UK10"],
    "Sandal": ["UK6", "UK7", "UK8", "UK9", "UK10"],
    "Socks": ["Freesize"],
}
DEFAULT_LADDER = ["Onesize"]

# (floor, ceiling) in INR, before the brand-tier multiplier.
PRICE_BANDS = {
    "Apparel": (599, 3499),
    "Footwear": (899, 5499),
    "Accessories": (299, 3999),
    "Personal Care": (199, 1499),
    "Free Items": (149, 599),
    "Sporting Goods": (499, 4999),
    "Home": (399, 2999),
}
DEFAULT_BAND = (399, 2499)
BRAND_TIER_MULTIPLIER = (0.75, 1.0, 1.45)

# E6 compares on price, rating, review count, material, fit, size availability,
# delivery and returns. The dataset carries none of rating, review count,
# material, fit or returns, so five of the eight axes are synthesised here.
# They are deterministic and plausible, and the harness labels them as
# synthetic -- a Compare view is decision-support, and a participant must not
# form a judgement from numbers nobody should trust.
MATERIALS = {
    "Topwear": ["Cotton", "Cotton Blend", "Linen Blend", "Viscose", "Polyester"],
    "Bottomwear": ["Denim", "Cotton", "Cotton Stretch", "Polyester Blend"],
    "Innerwear": ["Cotton", "Modal", "Cotton Blend"],
    "Shoes": ["Leather", "Synthetic", "Canvas", "Mesh"],
    "Bags": ["Leatherette", "Canvas", "Nylon"],
    "Watches": ["Stainless Steel", "Leather Strap", "Silicone"],
}
DEFAULT_MATERIALS = ["Cotton Blend", "Synthetic", "Mixed"]

APPAREL_FITS = ["Regular Fit", "Slim Fit", "Relaxed Fit", "Tailored Fit"]

# 0 means not returnable, which has to be one of the options: a comparison
# where every row returns the same answer teaches the user nothing.
RETURN_WINDOWS = [0, 7, 14, 30, 30]

SELLERS = [
    "Myntra Retail",
    "Fashnear Technologies",
    "Omnitech Retail",
    "Bluestone Apparel",
    "Trendsetter Distributors",
    "Vector Lifestyle",
]


def _digest(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()


def _unit(seed, salt):
    """A stable float in [0, 1) for a given seed. Replaces an RNG so that the
    output does not depend on iteration order or Python version."""
    return int(_digest(seed, salt)[:8], 16) / 0xFFFFFFFF


def parent_id(row):
    return "pp_" + _digest(
        row["brand_key"], row.get("articleType"), row.get("gender"), row["name_core"]
    )[:12]


def size_ladder(row):
    sub = row.get("subCategory") or ""
    article = row.get("articleType") or ""
    if article in SIZE_LADDERS:
        return SIZE_LADDERS[article]
    if sub in SIZE_LADDERS:
        return SIZE_LADDERS[sub]
    if article in ("Casual Shoes", "Sports Shoes", "Formal Shoes", "Heels", "Flats"):
        return SIZE_LADDERS["Shoes"]
    return DEFAULT_LADDER


def brand_tier(brand_key):
    return int(_digest("tier", brand_key)[:2], 16) % 3


def price_for(product_id, master_category, brand_key):
    low, high = PRICE_BANDS.get(master_category, DEFAULT_BAND)
    span = high - low
    raw = low + _unit(product_id, "price") * span
    raw *= BRAND_TIER_MULTIPLIER[brand_tier(brand_key)]
    # Retail prices land on 9s, which matters for the neutral price string.
    return int(round(raw / 10.0) * 10) - 1


def seller_for(product_id):
    return SELLERS[int(_digest(product_id, "seller")[:4], 16) % len(SELLERS)]


def sku_id(parent, product_id, size):
    return "sku_" + _digest(parent, product_id, size)[:14]


def in_stock(sku, out_of_stock_rate=0.18):
    return _unit(sku, "stock") >= out_of_stock_rate


def rating_for(product_id):
    """3.2 to 4.8, one decimal. Nothing sits below 3.2: a real catalog page
    rarely surfaces a 1-star item, and a fake outlier would dominate the
    comparison."""
    return round(3.2 + _unit(product_id, "rating") * 1.6, 1)


def review_count_for(product_id):
    """Skewed low, because most listings have few reviews and a handful have
    thousands. A uniform draw would make every row look equally established."""
    unit = _unit(product_id, "reviews")
    return int(12 + (unit ** 3) * 4800)


def material_for(product_id, sub_category, article_type):
    pool = MATERIALS.get(article_type) or MATERIALS.get(sub_category) or DEFAULT_MATERIALS
    return pool[int(_digest(product_id, "material")[:4], 16) % len(pool)]


def fit_for(product_id, master_category):
    if master_category != "Apparel":
        return None
    return APPAREL_FITS[int(_digest(product_id, "fit")[:4], 16) % len(APPAREL_FITS)]


def returns_days_for(product_id):
    return RETURN_WINDOWS[int(_digest(product_id, "returns")[:4], 16) % len(RETURN_WINDOWS)]


def display_name(row, drop_colour=True):
    """Product title as shown in the module.

    Brand is rendered separately in 14/700 caps, and the saved colour is
    rendered as its own chip, so both are stripped from the title here --
    "Peter England Men Party Blue Jeans" becomes "Party Jeans".
    """
    from derive import colours_in, normalise, split_on_gender

    name = (row.get("productDisplayName") or "").strip()
    _, remainder = split_on_gender(name)
    if remainder is None:
        brand = row.get("brand") or ""
        remainder = name[len(brand):].strip() if brand and name.startswith(brand) else name

    if drop_colour:
        drop = set()
        for colour in colours_in(remainder):
            drop.update(colour.split())
        drop.update(normalise(row.get("baseColour") or "").split())
        tokens = [t for t in remainder.split() if normalise(t) not in drop]
        remainder = " ".join(tokens)

    # Removing colour words strips one side of a pair and leaves the conjunction
    # behind: "Blue & White Check Shirt" would render as "& Check Shirt".
    remainder = " ".join(remainder.split())
    while remainder and normalise(remainder.split()[0]) in ("", "and", "amp"):
        remainder = " ".join(remainder.split()[1:])
    while remainder.startswith("&") or remainder.startswith("-"):
        remainder = remainder[1:].strip()
    while remainder.endswith("&") or remainder.endswith("-"):
        remainder = remainder[:-1].strip()
    remainder = " ".join(remainder.split())
    return remainder or (row.get("articleType") or "Product")


def build_parents(rows):
    """Collapse derived rows into parent products with colourways and SKUs."""
    parents = OrderedDict()
    for row in rows:
        pid = parent_id(row)
        parent = parents.get(pid)
        if parent is None:
            parent = {
                "parent_product_id": pid,
                "brand": row["brand"],
                "brand_key": row["brand_key"],
                "gender": row.get("gender"),
                "masterCategory": row.get("masterCategory"),
                "subCategory": row.get("subCategory"),
                "articleType": row.get("articleType"),
                "name_core": row["name_core"],
                "display_name": display_name(row),
                # A parent built from an empty name_core groups every plain
                # garment of its type together. That is deliberate -- it is how
                # colourways find each other -- but it is a weaker identity
                # claim, and the matcher holds it to a higher bar.
                "specific": bool(row["name_core"]),
                "sizes": size_ladder(row),
                "colourways": [],
            }
            parents[pid] = parent

        colourway = {
            "product_id": row["id"],
            "colour": row.get("baseColour") or "Unspecified",
            "display_name": display_name(row),
            "identity_confidence": row["identity_confidence"],
            "identity_flags": row["identity_flags"],
            "season": row.get("season"),
            "usage": row.get("usage"),
            "price": price_for(row["id"], row.get("masterCategory"), row["brand_key"]),
            "seller": seller_for(str(row["id"])),
            "rating": rating_for(row["id"]),
            "review_count": review_count_for(row["id"]),
            "material": material_for(
                row["id"], row.get("subCategory"), row.get("articleType")
            ),
            "fit": fit_for(row["id"], row.get("masterCategory")),
            "returns_days": returns_days_for(row["id"]),
            "skus": [],
        }
        for size in parent["sizes"]:
            sku = sku_id(pid, row["id"], size)
            colourway["skus"].append(
                {"sku": sku, "size": size, "in_stock": in_stock(sku)}
            )
        parent["colourways"].append(colourway)
    return parents


# The dataset has exactly one Home row. One product is not a category, so the
# home range is invented -- the only invented products in the catalog. Ids
# start at 900001, above the dataset's own range, so a home product can never
# collide with a real one.
HOME_RANGE = [
    ("Cushion Cover", ["Beige", "Grey", "Navy Blue", "Mustard"]),
    ("Bedsheet", ["White", "Grey", "Teal"]),
    ("Curtain", ["Beige", "Charcoal", "Olive"]),
    ("Bath Towel", ["White", "Navy Blue", "Grey"]),
    ("Table Runner", ["Mustard", "Beige"]),
    ("Doormat", ["Charcoal", "Beige"]),
    ("Cushion Filler", ["White"]),
    ("Throw Blanket", ["Grey", "Rust"]),
]
HOME_BRANDS = ["Home Centre", "Story@Home", "Raymond Home"]
HOME_ID_BASE = 900001


def build_home_parents():
    """The invented home range. See the spec, section 3.2."""
    parents = []
    next_id = HOME_ID_BASE
    for index, (article, colours) in enumerate(HOME_RANGE):
        brand = HOME_BRANDS[index % len(HOME_BRANDS)]
        brand_slug = brand.lower().replace("@", "").replace(" ", "")
        pid = "pp_home_%s_%s" % (brand_slug, article.lower().replace(" ", ""))
        colourways = []
        for colour in colours:
            product_id = next_id
            next_id += 1
            colourways.append(
                {
                    "product_id": product_id,
                    "colour": colour,
                    "display_name": article,
                    "identity_confidence": 1.0,
                    "identity_flags": [],
                    "season": None,
                    "usage": "Home",
                    "price": price_for(product_id, "Home", brand_slug),
                    "seller": seller_for(str(product_id)),
                    "rating": rating_for(product_id),
                    "review_count": review_count_for(product_id),
                    "material": "Cotton",
                    "fit": None,
                    "returns_days": 14,
                    "skus": [
                        {
                            "sku": sku_id(pid, product_id, "Onesize"),
                            "size": "Onesize",
                            "in_stock": True,
                        }
                    ],
                }
            )
        parents.append(
            {
                "parent_product_id": pid,
                "brand": brand,
                "brand_key": brand_slug,
                "gender": "Unisex",
                "masterCategory": "Home",
                "subCategory": "Home Furnishing",
                "articleType": article,
                "name_core": article.lower(),
                "display_name": article,
                "specific": True,
                "sizes": ["Onesize"],
                "synthetic": True,
                "colourways": colourways,
            }
        )
    return parents
