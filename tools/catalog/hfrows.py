"""Shared helper: paged reads from the HuggingFace datasets-server rows API.

Stdlib only. The dataset has no auth and no gating, but the endpoint does rate
limit, so every call retries with backoff and the caller drives concurrency.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request

DATASET = "benitomartin/fashion-product-images-small-384x512"
CONFIG = "default"
SPLIT = "train"
PAGE = 100
TOTAL_ROWS = 44072  # verified against the rows API
ROWS_URL = "https://datasets-server.huggingface.co/rows"


def fetch_page(offset, length=PAGE, attempts=6):
    """Return the decoded rows-API payload for one page, retrying on failure."""
    qs = urllib.parse.urlencode(
        {
            "dataset": DATASET,
            "config": CONFIG,
            "split": SPLIT,
            "offset": offset,
            "length": length,
        }
    )
    url = "%s?%s" % (ROWS_URL, qs)
    delay = 1.0
    last = None
    for _ in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "wishlist-proto/1"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as exc:
            last = exc
            time.sleep(delay)
            delay = min(delay * 2, 20.0)
    raise RuntimeError("rows API failed at offset %d: %s" % (offset, last))
