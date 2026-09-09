"""生成 popcorn-log PWA 图标（暖橙底 + 白色爆米花剪影）。

用法：uv run --with pillow scripts/generate_icons.py
输出：web/public/icons/{pwa-192,pwa-512,maskable-512,apple-touch-icon}.png
设计规范：docs/design-system.md 第 8 节。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

PRIMARY = (249, 115, 22, 255)  # #F97316
WHITE = (255, 255, 255, 255)

OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "icons"


def draw_popcorn(draw: ImageDraw.ImageDraw, size: int, scale: float) -> None:
    """在 size×size 画布中心按 scale 比例绘制爆米花剪影。"""
    cx = size / 2
    # 参考基准：512 画布上的图形几何
    base = size * scale

    # --- 上方爆米花团（蓬松云朵 = 一组重叠圆） ---
    kernel_cx, kernel_cy = cx, size * 0.36
    kernel_r = base * 0.15
    offsets = [
        (-0.78, 0.18), (0.78, 0.18),          # 左右两颗
        (-0.42, -0.28), (0.42, -0.28),        # 上排
        (0.0, -0.55),                          # 顶颗
        (0.0, 0.22),                           # 中央补块
    ]
    for dx, dy in offsets:
        r = kernel_r * (1.0 if dy < 0 else 0.85)
        x = kernel_cx + dx * kernel_r
        y = kernel_cy + dy * kernel_r
        draw.ellipse([x - r, y - r, x + r, y + r], fill=WHITE)

    # --- 桶口（圆角横条） ---
    rim_top = size * 0.47
    rim_h = base * 0.085
    rim_half_w = base * 0.36
    draw.rounded_rectangle(
        [cx - rim_half_w, rim_top, cx + rim_half_w, rim_top + rim_h],
        radius=rim_h / 2,
        fill=WHITE,
    )

    # --- 桶身（上宽下窄梯形） ---
    body_top = rim_top + rim_h * 0.6
    body_bottom = size * 0.72
    top_half, bottom_half = base * 0.33, base * 0.25
    draw.polygon(
        [
            (cx - top_half, body_top),
            (cx + top_half, body_top),
            (cx + bottom_half, body_bottom),
            (cx - bottom_half, body_bottom),
        ],
        fill=WHITE,
    )

    # --- 桶身橙色竖条纹（桶身宽度内均匀 3 条） ---
    stripe_w = base * 0.055
    for frac in (-0.5, 0.0, 0.5):
        # 梯形在该高度收窄，条纹按比例内收
        t = 0.35
        half = top_half + (bottom_half - top_half) * t
        x = cx + frac * half * 1.1
        draw.polygon(
            [
                (x - stripe_w / 2, body_top + base * 0.06),
                (x + stripe_w / 2, body_top + base * 0.06),
                (x + stripe_w / 2 * 0.9, body_bottom - base * 0.03),
                (x - stripe_w / 2 * 0.9, body_bottom - base * 0.03),
            ],
            fill=PRIMARY,
        )


def make_icon(size: int, scale: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), PRIMARY)
    draw = ImageDraw.Draw(img)
    draw_popcorn(draw, size, scale)
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # 常规图标：图形占比 ~88%；maskable：内容收缩到安全区（~62%）
    icons = {
        "pwa-192.png": make_icon(192, 0.88),
        "pwa-512.png": make_icon(512, 0.88),
        "maskable-512.png": make_icon(512, 0.62),
        "apple-touch-icon.png": make_icon(180, 0.88),
    }
    for name, img in icons.items():
        img.save(OUT_DIR / name)
        print(f"生成 {OUT_DIR / name}")


if __name__ == "__main__":
    main()
