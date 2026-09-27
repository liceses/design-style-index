"""把主数据 + 封面图主色 + 公开图选用结果，合成 style-ref/data.js

用法: python dev/build_site_data.py
"""
import colorsys
import json
import os
import sys

from PIL import Image

ROOT = "D:/developing/webdesign"
MASTER = os.path.join(ROOT, "dev/style-master.json")
FINALS = os.path.join(ROOT, "dev/finals.json")
PICKS = os.path.join(ROOT, "dev/pd-picks.json")          # 可选：公开版权图选用结果
FACTS = os.path.join(ROOT, "dev/subtitle-facts.json")     # 可选：从上传者字幕提炼的要点
IMG = os.path.join(ROOT, "style-ref/img")
OUT = os.path.join(ROOT, "style-ref/data.js")

BVID = "BV1anQwYZEw2"

VIDEO = {
    "bvid": BVID,
    "title": "你一直在寻找的 40 种设计风格名称（更快地找到参考）",
    "up": "咲喜",
    "url": "https://www.bilibili.com/video/%s" % BVID,
    "duration": 1855,
    "lang": "原视频为英文，本条为中文搬运；风格名以视频标题卡为准",
    "subtitle": {
        "lan": "zh-Hans",
        "lanDoc": "中文（简体）",
        "author": "咲喜（上传者本人制作，非 AI 转写）",
        "lines": 484,
        "aiType": 0,
    },
}


def hx(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(c)))) for c in rgb)


def analyze(path):
    """返回 (accent, accent_ink, tint, tint_light, 平均亮度)。

    accent      —— 深色主题下的强调色（封面里最鲜明的颜色）
    accent_ink  —— 浅色主题下的强调色（同色相压暗，保证在白底上读得清）
    tint        —— 深色主题下的卡片底色（同色相、很暗）
    tint_light  —— 浅色主题下的卡片底色（同色相、很淡）
    """
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return "#8a8a92", "#4a4a70", "#17171b", "#eceaf2", 0.4
    im = im.resize((96, 54), Image.LANCZOS)
    q = im.quantize(colors=6, method=Image.MEDIANCUT).convert("RGB")
    counts = {}
    for px in list(q.getdata()):
        counts[px] = counts.get(px, 0) + 1
    total = sum(counts.values()) or 1

    px_all = list(im.getdata())
    lum = sum((0.2126 * r + 0.7152 * g + 0.0722 * b) for r, g, b in px_all) / (len(px_all) * 255)

    best, best_score = None, -1
    for rgb, n in counts.items():
        r, g, b = [c / 255.0 for c in rgb]
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        share = n / total
        # 想要：有饱和度的（有性格）、不过暗/过曝、占比别太小
        score = s * 2.2 + min(share, 0.5) * 1.6 - abs(v - 0.62) * 1.1
        if score > best_score:
            best, best_score = rgb, score
    if best is None:
        best = (138, 138, 146)

    r, g, b = [c / 255.0 for c in best]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    # 深色主题的强调色
    s2 = max(0.35, min(0.85, s))
    v2 = max(0.55, min(0.92, v if v > 0.5 else 0.68))
    ar, ag, ab = colorsys.hsv_to_rgb(h, s2, v2)
    accent = hx((ar * 255, ag * 255, ab * 255))
    # 浅色主题的强调色：同色相、压暗，但保留源色的饱和度性格（不一律拉满）
    ikr, ikg, ikb = colorsys.hsv_to_rgb(h, max(0.30, min(0.75, s)), 0.42)
    accent_ink = hx((ikr * 255, ikg * 255, ikb * 255))
    # 卡片底色
    tr, tg, tb = colorsys.hsv_to_rgb(h, 0.22, 0.115)
    tint = hx((tr * 255, tg * 255, tb * 255))
    lr, lg, lb = colorsys.hsv_to_rgb(h, 0.13, 0.945)
    tint_light = hx((lr * 255, lg * 255, lb * 255))
    return accent, accent_ink, tint, tint_light, round(lum, 3)


def main():
    master = json.load(open(MASTER, encoding="utf-8"))
    picks = {}
    if os.path.exists(PICKS):
        picks = json.load(open(PICKS, encoding="utf-8"))
    facts = {}
    if os.path.exists(FACTS):
        facts = {k: v for k, v in json.load(open(FACTS, encoding="utf-8")).items() if not k.startswith("_")}

    styles = []
    for s in master["styles"]:
        slug = s["slug"]
        img_rel = "img/%s.jpg" % slug
        thumb_rel = "img/thumbs/%s.jpg" % slug
        full = os.path.join(IMG, "%s.jpg" % slug)
        if not os.path.exists(full):
            print("!! 缺封面: %s" % full, file=sys.stderr)
        accent, accent_ink, tint, tint_light, lum = analyze(full)
        item = {
            "slug": slug,
            "en": s["en"],
            "zh": s["zh"],
            "group": s["group"],
            "t": s["t"],
            "tc": "%d:%02d" % (s["t"] // 60, s["t"] % 60),
            "desc": s["desc"],
            "traits": s["traits"],
            "img": img_rel,
            "thumb": thumb_rel,
            "accent": accent,
            "accentInk": accent_ink,
            "tint": tint,
            "tintLight": tint_light,
            "lum": lum,
            "videoUrl": "%s?t=%d" % (VIDEO["url"], s["t"]),
        }
        if s.get("videoName"):
            item["videoName"] = s["videoName"]
        p = picks.get(slug)
        if p:
            item["ref"] = p
        f = facts.get(slug)
        if f:
            item["say"] = f.get("quote", "")
            item["sayAt"] = f.get("at", "")
            item["origin"] = f.get("origin", "")
            item["usage"] = f.get("usage", "")
            if f.get("tips"):
                item["tips"] = f["tips"]
        styles.append(item)

    # n = 视频时间轴顺序（不是内容分组顺序）。站点默认按它排序，
    # 所以卡片编号和"视频顺序"都会跟视频时间线一致。
    for i, item in enumerate(sorted(styles, key=lambda x: x["t"]), start=1):
        item["n"] = i

    data = {
        "video": VIDEO,
        "groups": master["groups"],
        "styles": styles,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 由 dev/build_site_data.py 生成，请勿手改；改内容请改 dev/style-master.json\n")
        f.write("window.STYLE_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write(";\n")

    withref = sum(1 for s in styles if "ref" in s)
    withsay = sum(1 for s in styles if s.get("say"))
    print("写入 %s" % OUT)
    print("风格 %d 条；含公开版权补充图 %d 条；含字幕原话 %d 条；分组 %d 个"
          % (len(styles), withref, withsay, len(master["groups"])))
    norder = [x["slug"] for x in sorted(styles, key=lambda x: x["n"])]
    print("视频顺序前 5: " + ", ".join(norder[:5]))


if __name__ == "__main__":
    main()
