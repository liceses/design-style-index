"""把复核选定的 Commons 候选图落到 style-ref/img/pd/，并生成 dev/pd-picks.json。

选片原则：只收相关性明确的；标题/画面不符的一律不要（宁缺勿滥）。
用法: python dev/apply_pd_picks.py
"""
import json
import os
import sys

from PIL import Image

ROOT = "D:/developing/webdesign"
CAND = os.path.join(ROOT, "dev/pd-cand")
OUTDIR = os.path.join(ROOT, "style-ref/img/pd")
PICKS_JSON = os.path.join(ROOT, "dev/pd-picks.json")

MAX_W = 1400
QUALITY = 82

# slug -> 选中的候选文件名（依据 dev/sheets/pd-*.png 目视复核）
# 注意：用文件名而不是数组下标 —— 抓取过程中若有下载失败，下标会错位。
PICKS = {
    "3x3-grid": "c3",            # Karl Gerstner 网格版面
    "acanthus": "c2",            # Akanthus 灰泥饰
    "anthropomorphic": "c1",     # Navagraha 拟人化浮雕
    "art-deco": "c2",            # 装饰艺术玻璃器
    "art-nouveau": "c1",         # 里加新艺术建筑
    "aurora": "c1",              # 爱沙尼亚极光
    "baroque": "c1",             # 巴洛克天顶湿壁画
    "bauhaus": "c2",             # 德绍包豪斯校舍
    "bento-box": "c3",           # 手作便当
    "brutalism": "c1",           # UMass Dartmouth 粗野主义
    "conceptual-sketch": "c2",   # 1915 概念图
    "cybercore": "c2",           # 赛博朋克城市夜景
    "ethereal": "c3",            # 空灵风景（琥珀玻璃）
    "farmhouse": "c1",           # 瑞士农舍
    "filigree": "c1",            # 金银丝耳饰
    "gothic": "c3",              # 哥特肋拱顶
    "graffiti": "c1",            # 桥下涂鸦
    "kitsch": "c2",              # 成排金佛（媚俗纪念品）
    "luxury-typography": "c2",   # 1909 展览海报字体
    "memphis": "c3",             # 孟菲斯家具空间
    "neoclassical": "c2",        # 新古典天顶
    "pixel-art": "c1",           # 像素画
    "pointilism": "c2",          # 保罗·戈瑟兰 点彩画
    "pop-art": "c1",             # 波普彩绘
    "shabby-chic": "c1",         # 做旧家具
    "steampunk": "c1",           # 蒸汽朋克机械
    "surrealism": "c3",          # 超现实摄影（倒置人像）
    "synthwave": "c2",           # 霓虹舞台
    "tenebrism": "c2",           # 伦勃朗《夜巡》
    "vaporwave": "c1",           # 蒸汽波经典落日网格
    "victorian": "c2",           # 温莎城堡（维多利亚时代）
}


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    out = {}
    missing = []
    for slug, idx in sorted(PICKS.items()):
        d = os.path.join(CAND, slug)
        mf = os.path.join(d, "meta.json")
        if not os.path.exists(mf):
            missing.append(slug)
            continue
        meta = json.load(open(mf, encoding="utf-8"))
        cs = meta.get("candidates", [])
        c = None
        for cand in cs:
            if cand["file"] == idx + ".jpg":
                c = cand
                break
        if c is None:
            missing.append("%s (%s 不存在)" % (slug, idx))
            continue
        src = os.path.join(d, c["file"])
        dst = os.path.join(OUTDIR, "%s.jpg" % slug)

        im = Image.open(src)
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)

        out[slug] = {
            "img": "img/pd/%s.jpg" % slug,
            "title": c.get("title") or "",
            "artist": (c.get("artist") or "").strip() or "见来源页",
            "license": c.get("license") or "",
            "licenseUrl": c.get("licenseUrl") or "",
            "page": c.get("page") or "",
            "w": im.width,
            "h": im.height,
            "bytes": os.path.getsize(dst),
        }
        print("%-20s %-3s %dx%d  %6.0f KB  %s" % (
            slug, idx, im.width, im.height, os.path.getsize(dst) / 1024, (c.get("license") or "?")[:14]))

    with open(PICKS_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    total = sum(v["bytes"] for v in out.values())
    print("\n%d 张补充图 -> %s（合计 %.1f MB）" % (len(out), OUTDIR, total / 1048576))
    print("picks -> %s" % PICKS_JSON)
    if missing:
        print("!! 未落盘: " + ", ".join(missing), file=sys.stderr)


if __name__ == "__main__":
    main()
