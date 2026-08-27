"""Step 6: pull 384x512 product images for the curated subset.

The source dataset ships 60x80 images -- far too small for the 96x128 pt card
in the module spec, which needs ~288x384 at 3x. A mirror of the same 44,072
rows at 384x512 exists, so that is what we read.

We tried the datasets-server /filter endpoint for per-id lookups; it rejects
batch predicates and rate-limits single ones, so 307 lookups never finished.
Instead each parquet shard is downloaded, the rows we want are extracted, and
the shard is deleted -- 2 GB of transfer once, ~400 MB of peak disk, and the
extracted JPEGs are committed so nobody has to do it twice.
"""

import io
import json
import os
import socket
import urllib.error
import urllib.request

REPO = "benitomartin/fashion-product-images-small-384x512"
TREE_URL = "https://huggingface.co/api/datasets/%s/tree/main?recursive=1" % REPO
FILE_URL = "https://huggingface.co/datasets/%s/resolve/main/%%s" % REPO
EXPECTED_SIZE = (384, 512)
SHARD_TMP = os.path.join("data", "raw", "_shard.parquet")


def _shards():
    req = urllib.request.Request(TREE_URL, headers={"User-Agent": "wishlist-proto/1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        tree = json.loads(resp.read().decode("utf-8"))
    paths = sorted(e["path"] for e in tree if e["path"].endswith(".parquet"))
    if not paths:
        raise RuntimeError("no parquet shards found in %s" % REPO)
    # A resumed run should not re-download shards a previous run already
    # drained -- their ids are on disk, so they would extract nothing at
    # 400 MB apiece. SHARD_START skips them.
    start = int(os.environ.get("SHARD_START", "0"))
    if start:
        print("  skipping %d shard(s) already drained (SHARD_START)" % start)
    return paths[start:]


ATTEMPTS = 3


def _download(path, dest):
    """Pull one shard, retrying a dropped connection.

    Each shard is ~400 MB and the whole walk moves ~2 GB, so a read timeout
    partway through is not an exceptional case -- it is the expected failure
    of a long transfer. Without a retry, one timeout discards every shard
    already downloaded in that run.
    """
    last = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            req = urllib.request.Request(
                FILE_URL % path, headers={"User-Agent": "wishlist-proto/1"}
            )
            with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as fh:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    fh.write(chunk)
            return
        except (socket.timeout, urllib.error.URLError, ConnectionError) as exc:
            last = exc
            print("    attempt %d/%d failed (%s), retrying" % (attempt, ATTEMPTS, exc), flush=True)
    raise RuntimeError("could not download %s after %d attempts: %s" % (path, ATTEMPTS, last))


def _extract(parquet_path, wanted, out_dir):
    import pyarrow.parquet as pq
    from PIL import Image

    written = []
    parquet = pq.ParquetFile(parquet_path)
    for batch in parquet.iter_batches(batch_size=512, columns=["id", "image"]):
        ids = batch.column("id").to_pylist()
        if not any(pid in wanted for pid in ids):
            continue
        images = batch.column("image").to_pylist()
        for pid, image in zip(ids, images):
            if pid not in wanted:
                continue
            raw = image["bytes"] if isinstance(image, dict) else image
            with Image.open(io.BytesIO(raw)) as img:
                if img.size != EXPECTED_SIZE:
                    raise RuntimeError(
                        "product %s is %dx%d, expected %dx%d"
                        % (pid, img.size[0], img.size[1], *EXPECTED_SIZE)
                    )
                img.convert("RGB").save(
                    os.path.join(out_dir, "%d.jpg" % pid), "JPEG", quality=88
                )
            wanted.discard(pid)
            written.append(pid)
    return written


def run(product_ids, out_dir, force=False):
    os.makedirs(out_dir, exist_ok=True)
    wanted = {
        pid
        for pid in product_ids
        if force or not os.path.exists(os.path.join(out_dir, "%d.jpg" % pid))
    }
    if not wanted:
        print("all %d catalog images already on disk" % len(product_ids))
        return []

    print("fetching %d of %d images" % (len(wanted), len(product_ids)))
    written = []
    for path in _shards():
        if not wanted:
            break
        print("  shard %s ..." % path, flush=True)
        try:
            _download(path, SHARD_TMP)
            got = _extract(SHARD_TMP, wanted, out_dir)
            written.extend(got)
            print("    extracted %d (%d still wanted)" % (len(got), len(wanted)), flush=True)
        finally:
            if os.path.exists(SHARD_TMP):
                os.remove(SHARD_TMP)

    if wanted:
        print("  WARNING: %d ids not present in the image mirror" % len(wanted))
    return written
