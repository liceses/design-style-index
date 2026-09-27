"""把 dev/pd-cand 下的公开图候选拼成联系表（带风格名与候选号），并打印元数据表。

用法: python dev/review_pd.py [--tile 400] [--cols 4] [--per-sheet 24]
"""
import argparse
import glob
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = "D:/developing/webdesign"
CAND = os.path.join(ROOT, "dev/pd-cand")
OUT = os.path.join(ROOT, "dev/sheets")
FONTS = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tile", type=int, default=400)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--per-sheet", type=int, default=24)
    args = ap.parse_args()

    items = []  # (label, path, meta)
    metas = {}
    for d in sorted(os.listdir(CAND)):
        p = os.path.join(CAND, d)
        if not os.path.isdir(p):
            continue
        mf = os.path.join(p, "meta.json")
        meta = json.load(open(mf, encoding="utf-8")) if os.path.exists(mf) else {"candidates": []}
        metas[d] = meta
        for c in meta.get("candidates", []):
            f = os.path.join(p, c["file"])
            if os.path.exists(f):
                items.append(("%s c%s" % (d, c["file"][1]), f, c))

    if not items:
        sys.exit("没有候选图，先跑 dev/fetch-commons.mjs")

    lines = ["=== 候选元数据（复核用） ==="]
    for d in sorted(metas):
        cs = metas[d].get("candidates", [])
        if not cs:
            lines.append("%-20s  (无候选)" % d)
            continue
        for c in cs:
            lines.append("%-20s %s  %sx%s  %-16s %s" % (
                d, c["file"], c["width"], c["height"], (c.get("license") or "?")[:16],
                (c.get("title") or "")[:72]))
    idx = os.path.join(ROOT, "dev/pd-index.txt")
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print("meta index -> %s (%d styles with candidates)" % (
        idx, sum(1 for d in metas if metas[d].get("candidates"))))
    print("styles: " + " ".join(sorted(d for d in metas if metas[d].get("candidates"))))
    print("missing: " + " ".join(sorted(d for d in metas if not metas[d].get("candidates"))))

    os.makedirs(OUT, exist_ok=True)
    f = font(13)
    cols, tw = args.cols, args.tile
    with Image.open(items[0][1]) as im0:
        ar = im0.height / im0.width
    th = int(tw * ar)
    lh = 18

    for s in range(0, len(items), args.per_sheet):
        chunk = items[s:s + args.per_sheet]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rows * (th + lh)), (22, 22, 26))
        dr = ImageDraw.Draw(sheet)
        for i, (label, path, _c) in enumerate(chunk):
            r, c = divmod(i, cols)
            x, y = c * tw, r * (th + lh)
            try:
                with Image.open(path) as im:
                    sheet.paste(im.convert("RGB").resize((tw, th), Image.LANCZOS), (x, y))
            except Exception:
                dr.rectangle([x, y, x + tw, y + th], fill=(60, 20, 20))
            dr.rectangle([x, y + th, x + tw, y + th + lh], fill=(0, 0, 0))
            dr.text((x + 5, y + th + 3), label, fill=(255, 235, 120), font=f)
        out = os.path.join(OUT, "pd-%02d.png" % (s // args.per_sheet))
        sheet.save(out)
        print("SHEET %s (%d tiles)" % (out, len(chunk)))


if __name__ == "__main__":
    main()
