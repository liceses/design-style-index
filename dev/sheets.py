"""把一组图片拼成带文件名标签的联系表(contact sheet)，供人工挑选。

用法:
  python dev/sheets.py --src <dir> --pattern "*.jpg" --cols 4 --tile 426 \
      --per-sheet 24 --out <dir> [--prefix shots]
"""
import argparse
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
]


def load_font(size):
    for f in FONTS:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--pattern", default="*.jpg")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--tile", type=int, default=426, help="tile width in px")
    ap.add_argument("--per-sheet", type=int, default=24)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prefix", default="sheet")
    ap.add_argument("--label", action="store_true", help="draw filename on each tile")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.src, args.pattern)))
    if not files:
        sys.exit("no files matched: %s/%s" % (args.src, args.pattern))

    cols = args.cols
    tile_w = args.tile
    label_h = 16
    # 以第一张的宽高比决定 tile 高度
    with Image.open(files[0]) as im0:
        ar = im0.height / im0.width
    tile_h = int(tile_w * ar)

    font = load_font(12)
    os.makedirs(args.out, exist_ok=True)

    per_sheet = args.per_sheet
    sheet_no = 0
    for start in range(0, len(files), per_sheet):
        chunk = files[start:start + per_sheet]
        rows = (len(chunk) + cols - 1) // cols
        W = cols * tile_w
        H = rows * (tile_h + (label_h if args.label else 0))
        sheet = Image.new("RGB", (W, H), (24, 24, 27))
        draw = ImageDraw.Draw(sheet)
        for i, f in enumerate(chunk):
            r, c = divmod(i, cols)
            x = c * tile_w
            y = r * (tile_h + (label_h if args.label else 0))
            with Image.open(f) as im:
                im = im.convert("RGB").resize((tile_w, tile_h), Image.LANCZOS)
                sheet.paste(im, (x, y))
            if args.label:
                name = os.path.splitext(os.path.basename(f))[0]
                draw.rectangle([x, y + tile_h, x + tile_w, y + tile_h + label_h], fill=(0, 0, 0))
                draw.text((x + 5, y + tile_h + 2), name, fill=(255, 235, 120), font=font)
        out = os.path.join(args.out, "%s-%02d.png" % (args.prefix, sheet_no))
        sheet.save(out)
        print("%s  (%d tiles, %dx%d)" % (out, len(chunk), W, H))
        sheet_no += 1


if __name__ == "__main__":
    main()
