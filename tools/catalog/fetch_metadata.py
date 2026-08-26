"""Step 1: load the full styles table into data/raw/styles.json.

Source: a metadata-only parquet mirror of the Kaggle dataset (3 MB, 42,426
rows). We tried paging the HuggingFace rows API first; it rate-limits hard
enough that 441 sequential pages never finished. Bulk parquet is both faster
and reproducible offline once downloaded.

Images are NOT here -- this mirror carries filenames, not pixels. fetch_images.py
pulls 384x512 JPEGs by product id for the curated subset only.
"""

import json
import os
import sys
import urllib.request

PARQUET_URL = (
    "https://huggingface.co/datasets/mecha2019/fashion-product-images-small"
    "/resolve/main/data/train-00000-of-00001.parquet"
)
RAW_DIR = os.path.join("data", "raw")
PARQUET = os.path.join(RAW_DIR, "styles.parquet")
OUT = os.path.join(RAW_DIR, "styles.json")
EXPECTED_ROWS = 42426
COLUMNS = [
    "id", "gender", "masterCategory", "subCategory", "articleType",
    "baseColour", "season", "usage", "productDisplayName",
]


def download(force=False):
    os.makedirs(RAW_DIR, exist_ok=True)
    if os.path.exists(PARQUET) and not force:
        return PARQUET
    print("downloading styles parquet ...")
    req = urllib.request.Request(PARQUET_URL, headers={"User-Agent": "wishlist-proto/1"})
    with urllib.request.urlopen(req, timeout=180) as resp, open(PARQUET, "wb") as fh:
        fh.write(resp.read())
    return PARQUET


def run(force=False):
    if os.path.exists(OUT) and not force:
        with open(OUT) as fh:
            rows = json.load(fh)
        print("styles.json already present (%d rows)" % len(rows))
        return rows

    import pyarrow.parquet as pq

    table = pq.read_table(download(force), columns=COLUMNS)
    rows = table.to_pylist()
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit("expected %d rows, got %d" % (EXPECTED_ROWS, len(rows)))

    with open(OUT, "w") as fh:
        json.dump(rows, fh, ensure_ascii=False)
    print("wrote %s (%d rows)" % (OUT, len(rows)))
    return rows


if __name__ == "__main__":
    run(force="--force" in sys.argv)
