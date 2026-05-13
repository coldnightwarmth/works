#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_SCRIPT = ROOT / "tools" / "export-gallery-manifest.js"
OUTPUT_JS = ROOT / "assets" / "js" / "gallery-images.js"
TEMP_DIR = Path(tempfile.gettempdir()) / "meinong-portfolio-gallery-sources"
TIERS = (720, 1080, 1440)
STILL_QUALITY = 82
ANIMATED_QUALITY = 72
TIMEOUT = 45
VARIANT_RE = re.compile(r"-(\d+)\.webp$")


def slugify(value):
    cleaned = []
    last_dash = False

    for char in str(value).lower():
        if ("a" <= char <= "z") or ("0" <= char <= "9"):
            cleaned.append(char)
            last_dash = False
        elif not last_dash:
            cleaned.append("-")
            last_dash = True

    return "".join(cleaned).strip("-") or "item"


def load_manifest():
    result = subprocess.run(
        ["node", str(MANIFEST_SCRIPT)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def load_existing_output():
    if not OUTPUT_JS.exists():
        return {}

    source = OUTPUT_JS.read_text(encoding="utf-8").strip()
    prefix = "window.PORTFOLIO_GALLERY_IMAGES = "

    if not source.startswith(prefix):
        return {}

    data = source[len(prefix):]

    if data.endswith(";"):
        data = data[:-1]

    try:
        return json.loads(data)
    except json.JSONDecodeError:
        return {}


def item_key(slug, item):
    if slug == "hyperwarhaul" and item.get("order") is not None:
        return f"relic-{item['order']}"

    title_part = slugify(item.get("title") or item.get("index"))
    return f"item-{item['index']:04d}-{title_part}"


def source_suffix(src):
    suffix = Path(src.split("?", 1)[0]).suffix.lower()
    if suffix not in {".gif", ".png", ".jpg", ".jpeg", ".webp"}:
        suffix = ".img"

    return suffix


def download(src):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix="gallery-source-",
        suffix=source_suffix(src),
        dir=TEMP_DIR,
    )
    os.close(fd)
    target = Path(tmp_name)
    request = urllib.request.Request(
        src,
        headers={
            "User-Agent": "meinong-portfolio-gallery-optimizer/1.0",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            with target.open("wb") as file:
                while True:
                    chunk = response.read(1024 * 256)
                    if not chunk:
                        break
                    file.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise

    return target


def source_path(src):
    parsed = urllib.parse.urlparse(src)

    if parsed.scheme in {"http", "https"}:
        return download(src), True

    path = Path(src)

    if not path.is_absolute():
        path = ROOT / path

    return path, False


def existing_record(slug, item):
    key = item_key(slug, item)
    large_dir = ROOT / "assets" / "images" / slug / "large"
    variants = []
    animated = False

    for output in large_dir.glob(f"{key}-*.webp"):
        if not output.exists() or output.stat().st_size <= 0:
            continue

        try:
            with Image.open(output) as image:
                width, height = image.size
                variant_animated = bool(
                    getattr(image, "is_animated", False)
                    and getattr(image, "n_frames", 1) > 1
                )
        except Exception:
            continue

        match = VARIANT_RE.search(output.name)
        size = int(match.group(1)) if match else max(width, height)
        animated = animated or variant_animated
        variants.append({
            "size": size,
            "width": width,
            "height": height,
            "src": f"assets/images/{slug}/large/{output.name}",
            "bytes": output.stat().st_size,
            "animated": variant_animated,
        })

    if not variants:
        return None

    variants.sort(key=lambda variant: variant["size"])
    largest = max(variants, key=lambda variant: max(variant["width"], variant["height"]))

    return {
        "key": f"{slug}/{key}",
        "width": largest["width"],
        "height": largest["height"],
        "animated": animated,
        "variants": variants,
    }


def target_sizes(width, height):
    max_edge = max(width, height)
    sizes = [size for size in TIERS if size < max_edge]
    sizes.append(min(max_edge, TIERS[-1]))
    return sorted(set(max(1, int(size)) for size in sizes))


def resize_frame(frame, max_edge):
    frame = frame.convert("RGBA")
    width, height = frame.size
    scale = min(1, max_edge / max(width, height))

    if scale >= 1:
        return frame.copy()

    next_size = (
        max(1, round(width * scale)),
        max(1, round(height * scale)),
    )
    return frame.resize(next_size, Image.Resampling.LANCZOS)


def save_still(image, output, max_edge):
    frame = resize_frame(image, max_edge)

    if frame.mode == "RGBA" and not frame.getchannel("A").getbbox():
        frame = frame.convert("RGB")

    frame.save(output, "WEBP", quality=STILL_QUALITY, method=6)
    return frame.size


def save_animated(image, output, max_edge):
    frames = []
    durations = []

    for frame in ImageSequence.Iterator(image):
        frames.append(resize_frame(frame, max_edge))
        durations.append(frame.info.get("duration", image.info.get("duration", 80)))

    if not frames:
        return save_still(image, output, max_edge)

    first, rest = frames[0], frames[1:]
    first.save(
        output,
        "WEBP",
        save_all=True,
        append_images=rest,
        duration=durations,
        loop=image.info.get("loop", 0),
        quality=ANIMATED_QUALITY,
        method=4,
    )
    return first.size


def optimize_item(slug, item, force=False):
    key = item_key(slug, item)
    src = item.get("src")

    if not src:
        return None

    if not force:
        existing = existing_record(slug, item)
        if existing:
            return existing

    large_dir = ROOT / "assets" / "images" / slug / "large"
    large_dir.mkdir(parents=True, exist_ok=True)

    source_path_value, should_delete_source = source_path(src)

    try:
        with Image.open(source_path_value) as image:
            image.load()
            width, height = image.size
            animated = bool(getattr(image, "is_animated", False) and getattr(image, "n_frames", 1) > 1)
            variants = []

            for size in target_sizes(width, height):
                output = large_dir / f"{key}-{size}.webp"

                if output.exists() and output.stat().st_size > 0 and not force:
                    with Image.open(output) as existing:
                        variant_width, variant_height = existing.size
                else:
                    if animated:
                        variant_width, variant_height = save_animated(image, output, size)
                    else:
                        variant_width, variant_height = save_still(image, output, size)

                variants.append({
                    "size": size,
                    "width": variant_width,
                    "height": variant_height,
                    "src": f"assets/images/{slug}/large/{output.name}",
                    "bytes": output.stat().st_size,
                    "animated": animated,
                })
    finally:
        if should_delete_source:
            source_path_value.unlink(missing_ok=True)

    return {
        "key": f"{slug}/{key}",
        "width": width,
        "height": height,
        "animated": animated,
        "variants": variants,
    }


def write_output(records):
    data = load_existing_output()

    for record in records:
        if not record:
            continue

        data[record["key"]] = {
            "width": record["width"],
            "height": record["height"],
            "animated": record["animated"],
            "variants": record["variants"],
        }

    data = {key: data[key] for key in sorted(data)}
    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JS.write_text(
        "window.PORTFOLIO_GALLERY_IMAGES = "
        + json.dumps(data, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--collections", nargs="*", help="Only process these gallery slugs.")
    parser.add_argument("--limit", type=int, help="Limit processed items per collection for testing.")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest = load_manifest()
    selected = set(args.collections or [])
    jobs = []

    for gallery in manifest["galleries"]:
        slug = gallery["slug"]

        if selected and slug not in selected:
            continue

        for item in gallery["items"][:args.limit]:
            jobs.append((slug, item))

    if not jobs:
        print("No gallery items to process.", file=sys.stderr)
        return 1

    records = []
    started = time.time()

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(optimize_item, slug, item, args.force): (slug, item)
            for slug, item in jobs
        }

        for index, future in enumerate(as_completed(futures), start=1):
            slug, item = futures[future]

            try:
                record = future.result()
            except Exception as exc:
                print(f"[{index}/{len(jobs)}] failed {slug} {item.get('title')}: {exc}", file=sys.stderr)
                continue

            records.append(record)
            if index % 10 == 0 or index == len(jobs):
                elapsed = time.time() - started
                print(f"[{index}/{len(jobs)}] optimized ({elapsed:.1f}s)", file=sys.stderr)

    write_output(records)
    print(f"Wrote {OUTPUT_JS.relative_to(ROOT)} with {len(records)} records.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
