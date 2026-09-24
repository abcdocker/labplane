#!/usr/bin/env python3
"""生成 LabPlane 品牌视觉资产（六边形 + 终端 >_ 图形语言）。

输出到 react/public/：
  favicon.ico（16/32/48 多尺寸）
  apple-touch-icon.png（180）
  pwa-192.png / pwa-512.png / pwa-maskable-512.png
  og-image.png（1200×630，含中英文标题）

用法：python3 scripts/generate-brand-assets.py
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

BG = (15, 23, 42, 255)        # #0f172a slate-900（与 theme_color 一致）
BG2 = (30, 41, 59, 255)       # #1e293b slate-800（渐变上端）
HEX = (56, 189, 248, 255)     # #38bdf8 sky-400 六边形描边
HEX_DARK = (14, 165, 233, 255)  # #0ea5e9 sky-500
WHITE = (241, 245, 249, 255)  # slate-100

OUT = os.path.join(os.path.dirname(__file__), "..", "react", "public")


def hex_points(cx, cy, r):
    """point-top 六边形顶点。"""
    pts = []
    for k in range(6):
        a = math.radians(90 + 60 * k)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def draw_mark(img, scale=1.0):
    """在正方形画布中心绘制六边形 + >_ 终端符。scale 控制整体占比。"""
    d = ImageDraw.Draw(img)
    w = img.width
    cx, cy = w / 2, w / 2
    r = w * 0.30 * scale
    lw = max(2, int(w * 0.045 * scale))

    # 底部渐变（逐行插值 BG2 -> BG）
    for y in range(w):
        t = y / max(1, w - 1)
        c = tuple(int(BG2[i] + (BG[i] - BG2[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (w, y)], fill=c)

    pts = hex_points(cx, cy, r)
    d.polygon(pts, outline=HEX, width=lw)

    # >_ 终端符（> 折线 + 下划线），整体位于六边形内
    u = r * 0.34  # 单元长度
    gt = [(cx - u * 0.9, cy - u), (cx - u * 0.1, cy), (cx - u * 0.9, cy + u)]
    d.line(gt, fill=WHITE, width=lw, joint="curve")
    d.line([(cx + u * 0.15, cy + u * 0.9), (cx + u * 1.0, cy + u * 0.9)], fill=WHITE, width=lw)
    return img


def icon(size, path, maskable=False):
    img = Image.new("RGBA", (size, size), BG)
    draw_mark(img, scale=0.72 if maskable else 1.0)
    img.save(path)
    print("wrote", path, f"{size}x{size}")


def load_font(size, cn=False):
    candidates = [
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ] if cn else [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def og_image():
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(BG2[i] + (BG[i] - BG2[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (W, y)], fill=c)

    # 左侧六边形标记（复用 icon 绘制逻辑，画在大画布上）
    mark = Image.new("RGBA", (630, 630))
    draw_mark(mark, scale=0.78)
    img.alpha_composite(mark, (60, 0))

    # 右侧文案
    f_sub = load_font(40, cn=True)
    f_tags = load_font(30, cn=True)
    x = 690
    x_max = 1150
    # 标题自适应：从 88px 起缩，确保整词不超出右侧边界
    size = 88
    while size > 40:
        f_title = load_font(size)
        if d.textlength("LabPlane", font=f_title) <= x_max - x:
            break
        size -= 4
    d.text((x, 185), "LabPlane", font=f_title, fill=WHITE)
    d.text((x, 295), "面向 HomeLab 与自建集群的一体化运维控制台", font=f_sub, fill=(148, 163, 184, 255))
    d.text((x, 375), "Kubernetes · 宝塔同步 · Headscale 组网", font=f_tags, fill=(100, 116, 139, 255))
    d.text((x, 420), "堡垒机 · vCenter · AI 巡检 · 监控审计", font=f_tags, fill=(100, 116, 139, 255))

    img.convert("RGB").save(os.path.join(OUT, "og-image.png"))
    print("wrote og-image.png 1200x630")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    icon(180, os.path.join(OUT, "apple-touch-icon.png"))
    icon(192, os.path.join(OUT, "pwa-192.png"))
    icon(512, os.path.join(OUT, "pwa-512.png"))
    icon(512, os.path.join(OUT, "pwa-maskable-512.png"), maskable=True)

    # favicon.ico 多尺寸
    base = Image.new("RGBA", (48, 48))
    draw_mark(base)
    base.save(
        os.path.join(OUT, "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("wrote favicon.ico 16/32/48")

    og_image()
