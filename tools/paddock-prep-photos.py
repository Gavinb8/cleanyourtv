#!/usr/bin/env python3
"""Prepare Gavin's car photos for PADDOCK: resize, desaturate, darken, compress.

DESIGN.md section 9: 1920x1080 cover crops, desaturated 25 percent, darkened to about 60
percent brightness, JPEG quality 82 under 600KB each. The treatment is baked in here so the
TV does no filtering at runtime - matters on a 1GB/2GB-RAM Android TV box.

Usage:
    python tools/paddock-prep-photos.py
    python tools/paddock-prep-photos.py --src paddock/assets/cars-src --out paddock/assets/photos-prepped

Reads every .jpg/.jpeg/.png in --src, writes same-named .jpg files to --out. Max 12 photos
(DESIGN.md's cap) - if there are more, the newest 12 by file mtime are used and the rest are
skipped with a warning, since Claude Code must not silently decide which of Gavin's photos to
drop.
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageEnhance
except ImportError:
    sys.exit("Needs Pillow: pip install Pillow (or: pip install -r tools/requirements.txt if it's listed there)")

TARGET_W, TARGET_H = 1920, 1080
MAX_PHOTOS = 12
JPEG_QUALITY = 82
MAX_BYTES = 600 * 1024
DESATURATE_FACTOR = 0.75  # ImageEnhance.Color: 1.0 = original, 0.0 = grayscale; 25% desaturated
BRIGHTNESS_FACTOR = 0.60  # ImageEnhance.Brightness: 1.0 = original


def cover_crop(im: "Image.Image", target_w: int, target_h: int) -> "Image.Image":
    src_w, src_h = im.size
    src_ratio = src_w / src_h
    target_ratio = target_w / target_h
    if src_ratio > target_ratio:
        # source is wider than target: crop the sides
        new_w = round(src_h * target_ratio)
        left = (src_w - new_w) // 2
        im = im.crop((left, 0, left + new_w, src_h))
    else:
        # source is taller than target: crop top/bottom
        new_h = round(src_w / target_ratio)
        top = (src_h - new_h) // 2
        im = im.crop((0, top, src_w, top + new_h))
    return im.resize((target_w, target_h), Image.LANCZOS)


def prep_one(src: Path, dest: Path) -> int:
    im = Image.open(src).convert("RGB")
    im = cover_crop(im, TARGET_W, TARGET_H)
    im = ImageEnhance.Color(im).enhance(DESATURATE_FACTOR)
    im = ImageEnhance.Brightness(im).enhance(BRIGHTNESS_FACTOR)

    quality = JPEG_QUALITY
    while True:
        im.save(dest, "JPEG", quality=quality, optimize=True)
        size = dest.stat().st_size
        if size <= MAX_BYTES or quality <= 40:
            break
        quality -= 5
    return dest.stat().st_size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default="paddock/assets/cars-src")
    ap.add_argument("--out", default="paddock/assets/photos-prepped")
    args = ap.parse_args()

    src_dir = Path(args.src)
    out_dir = Path(args.out)
    if not src_dir.is_dir():
        sys.exit(f"no such source folder: {src_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        [p for p in src_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")],
        key=lambda p: p.stat().st_mtime,
    )
    if len(sources) > MAX_PHOTOS:
        skipped = sources[:-MAX_PHOTOS]
        sources = sources[-MAX_PHOTOS:]
        print(f"WARNING: {len(skipped)} photo(s) over the {MAX_PHOTOS}-photo cap were skipped (oldest by file date):")
        for p in skipped:
            print(f"  skipped: {p.name}")
        print("Delete photos you don't want from the source folder, or raise MAX_PHOTOS, rather than guessing which to drop.")

    for src in sources:
        dest = out_dir / (src.stem + ".jpg")
        size = prep_one(src, dest)
        print(f"{src.name} -> {dest.name} ({size // 1024} KB)")

    print(f"\n{len(sources)} photo(s) written to {out_dir}")


if __name__ == "__main__":
    main()
