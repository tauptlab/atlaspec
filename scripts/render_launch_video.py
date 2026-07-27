#!/usr/bin/env python3
"""Render Atlaspec's deterministic, silent-first 60-second launch video."""

from __future__ import annotations

import math
from pathlib import Path
from textwrap import wrap

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
VIDEO = MEDIA / "atlaspec-60s-demo.mp4"
POSTER = MEDIA / "atlaspec-60s-poster.png"

WIDTH, HEIGHT = 1280, 720
FPS = 24
DURATION = 60

INK = "#142033"
MUTED = "#596477"
PAPER = "#F2EFE5"
WHITE = "#FFFDF7"
TEAL = "#0F766E"
TEAL_LIGHT = "#A7D8CE"
ORANGE = "#DB643F"
ACID = "#D7EB59"
RED = "#C5403D"
GRID = "#D8D4C8"


def font_path(mono: bool = False, bold: bool = False) -> str:
    windows = Path("C:/Windows/Fonts")
    candidates = (
        ["CascadiaMono-SemiBold.ttf", "consolab.ttf", "DejaVuSansMono-Bold.ttf"]
        if mono and bold
        else ["CascadiaMono.ttf", "consola.ttf", "DejaVuSansMono.ttf"]
        if mono
        else ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
        if bold
        else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
    )
    for candidate in candidates:
        path = windows / candidate
        if path.exists():
            return str(path)
    return candidates[-1]


FONT_CACHE: dict[tuple[int, bool, bool], ImageFont.FreeTypeFont] = {}


def font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    key = (size, bold, mono)
    if key not in FONT_CACHE:
        FONT_CACHE[key] = ImageFont.truetype(font_path(mono=mono, bold=bold), size)
    return FONT_CACHE[key]


def ease(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def scene_progress(t: float, start: float, end: float) -> float:
    return ease((t - start) / max(end - start, 0.001))


def alpha_for_scene(local: float, duration: float) -> float:
    fade = 0.45
    return min(1.0, local / fade, (duration - local) / fade)


def rounded(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: str,
    outline: str | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    value: str,
    size: int,
    fill: str = INK,
    *,
    bold: bool = False,
    mono: bool = False,
    anchor: str = "la",
) -> None:
    draw.text(xy, value, font=font(size, bold=bold, mono=mono), fill=fill, anchor=anchor)


def multiline(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    size: int,
    fill: str = INK,
    *,
    bold: bool = False,
    width: int = 32,
    spacing: int = 10,
) -> None:
    lines: list[str] = []
    for paragraph in value.splitlines():
        lines.extend(wrap(paragraph, width=width) or [""])
    draw.multiline_text(
        xy,
        "\n".join(lines),
        font=font(size, bold=bold),
        fill=fill,
        spacing=spacing,
    )


def base_frame() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)
    for x in range(0, WIDTH, 48):
        draw.line((x, 0, x, HEIGHT), fill="#E9E5D9", width=1)
    for y in range(0, HEIGHT, 48):
        draw.line((0, y, WIDTH, y), fill="#E9E5D9", width=1)
    draw.ellipse((-180, 490, 360, 1030), fill="#E5EBDD")
    draw.ellipse((1040, -250, 1470, 180), fill="#F1DCD0")
    return image


BASE = base_frame()


def chrome(draw: ImageDraw.ImageDraw, t: float, scene: int) -> None:
    text(draw, (62, 48), "ATLASPEC", 20, INK, bold=True)
    text(draw, (1220, 48), f"0{scene} / 08", 16, MUTED, mono=True, anchor="ra")
    draw.rounded_rectangle((62, 680, 1218, 687), radius=4, fill="#D5D1C5")
    draw.rounded_rectangle(
        (62, 680, int(62 + 1156 * min(1.0, t / DURATION)), 687),
        radius=4,
        fill=TEAL,
    )


def stamp(draw: ImageDraw.ImageDraw, label: str, x: int, y: int, fill: str = ACID) -> None:
    box = draw.textbbox((0, 0), label, font=font(17, bold=True))
    width = box[2] - box[0] + 30
    rounded(draw, (x, y, x + width, y + 38), 19, fill)
    text(draw, (x + 15, y + 19), label, 17, INK, bold=True, anchor="lm")


def scene_title(draw: ImageDraw.ImageDraw, local: float) -> None:
    p = scene_progress(local, 0.0, 1.5)
    x = int(75 + (1 - p) * 80)
    stamp(draw, "SEMANTIC MAP LANGUAGE", x, 116)
    text(draw, (x, 213), "Agents should write", 66, INK, bold=True)
    text(draw, (x, 292), "map intent.", 76, TEAL, bold=True)
    text(draw, (x, 393), "Not renderer plumbing.", 44, INK, bold=True)
    text(draw, (x, 466), "Typed intent → validated decisions → deterministic artifacts", 25, MUTED)
    orbit = local * 0.9
    cx, cy = 1035, 342
    for radius, color in [(165, TEAL_LIGHT), (112, ACID), (61, ORANGE)]:
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=color, width=5)
    for index in range(6):
        angle = orbit + index * math.pi / 3
        px = cx + math.cos(angle) * 140
        py = cy + math.sin(angle) * 140
        draw.ellipse((px - 9, py - 9, px + 9, py + 9), fill=TEAL)


def scene_problem(draw: ImageDraw.ImageDraw, local: float) -> None:
    text(draw, (70, 122), "The direct-generation trap", 48, INK, bold=True)
    multiline(
        draw,
        (72, 195),
        "Renderer-native configuration makes the model invent syntax, semantics, and cartography at once.",
        26,
        MUTED,
        width=43,
    )
    rounded(draw, (660, 105, 1205, 612), 24, "#172235")
    lines = [
        ('"layers": [', "#A8B5CA"),
        ('  { "type": "symbol",', WHITE),
        ('    "source": { ... },', ORANGE),
        ('    "text-offset": [', WHITE),
        ('      ["zoom"], 1.5', RED),
        ("    ],", WHITE),
        ('    "circle-radius": [', WHITE),
        ('      "get", "value"', ORANGE),
        ("    ]", WHITE),
        ("  }", WHITE),
        ("]", "#A8B5CA"),
    ]
    for idx, (line, color) in enumerate(lines):
        text(draw, (700, 150 + idx * 36), line, 21, color, mono=True)
    problems = [
        ("INVALID SOURCE", 72, 430, RED),
        ("ILLEGAL EXPRESSION", 262, 487, ORANGE),
        ("MISLEADING SCALE", 90, 544, TEAL),
    ]
    for idx, (label, x, y, color) in enumerate(problems):
        progress = scene_progress(local, 1.0 + idx * 0.55, 1.55 + idx * 0.55)
        if progress > 0:
            width = int(230 * progress)
            rounded(draw, (x, y, x + width, y + 42), 10, color)
            if progress > 0.75:
                text(draw, (x + 15, y + 21), label, 15, WHITE, bold=True, anchor="lm")


def yaml_card(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    rounded(draw, (x, y, x + 370, y + 390), 22, "#172235")
    text(draw, (x + 28, y + 34), "risk-map.atlas.yaml", 18, TEAL_LIGHT, mono=True)
    rows = [
        ("version:", '"0.2"'),
        ("intent:", ""),
        ("  audience:", "residents"),
        ("layers:", ""),
        ("  - purpose:", "flood risk"),
        ("    geometry:", "polygon"),
        ("    encode:", ""),
        ("      color:", "risk_score"),
        ("constraints:", ""),
        ("  accessible:", "true"),
    ]
    for idx, (key, value) in enumerate(rows):
        text(draw, (x + 28, y + 78 + idx * 28), key, 17, "#D2DAE7", mono=True)
        if value:
            key_width = draw.textlength(key, font=font(17, mono=True))
            text(draw, (x + 32 + key_width, y + 78 + idx * 28), value, 17, ACID, mono=True)


def scene_solution(draw: ImageDraw.ImageDraw, local: float) -> None:
    text(draw, (70, 105), "A smaller authoring surface", 48, INK, bold=True)
    text(draw, (72, 166), "Semantic YAML in. Deterministic map artifacts out.", 27, MUTED)
    yaml_card(draw, 72, 220)
    center_x = 590
    for idx, (label, color) in enumerate(
        [("VALIDATE", TEAL), ("LINT", ORANGE), ("COMPILE", INK)]
    ):
        y = 270 + idx * 94
        progress = scene_progress(local, 0.6 + idx * 0.55, 1.2 + idx * 0.55)
        rounded(draw, (center_x, y, center_x + int(190 * progress), y + 54), 12, color)
        if progress > 0.8:
            text(draw, (center_x + 95, y + 27), label, 17, WHITE, bold=True, anchor="mm")
    draw.line((470, 414, 574, 414), fill=TEAL, width=5)
    draw.polygon([(574, 404), (594, 414), (574, 424)], fill=TEAL)
    draw.line((790, 414, 865, 414), fill=TEAL, width=5)
    draw.polygon([(865, 404), (885, 414), (865, 424)], fill=TEAL)
    for idx, (label, color, y_offset) in enumerate(
        [("MapLibre", TEAL, 255), ("Vega-Lite", ORANGE, 430)]
    ):
        x, y = 890, y_offset
        rounded(draw, (x, y, x + 310, y + 140), 20, WHITE, outline=GRID, width=2)
        draw.rectangle((x + 24, y + 25, x + 105, y + 105), fill=color)
        for line in range(4):
            draw.line((x + 130, y + 37 + line * 20, x + 275, y + 37 + line * 20), fill=GRID, width=6)
        text(draw, (x + 155, y + 121), label, 17, INK, bold=True, anchor="mm")


def bar(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, value: float, color: str, label: str, score: str, p: float) -> None:
    text(draw, (x, y - 18), label, 22, INK, bold=True)
    rounded(draw, (x, y + 18, x + width, y + 92), 18, "#DDD8CC")
    fill_width = max(30, int(width * value * p))
    rounded(draw, (x, y + 18, x + fill_width, y + 92), 18, color)
    if p > 0.65:
        text(draw, (x + fill_width - 22, y + 55), score, 28, WHITE, bold=True, anchor="rm")


def scene_benchmark(draw: ImageDraw.ImageDraw, local: float) -> None:
    stamp(draw, "LOCKED V0.2 DEVELOPMENT EVALUATION", 70, 108)
    text(draw, (70, 180), "Healthy real-renderer outputs", 48, INK, bold=True)
    p = scene_progress(local, 0.6, 3.0)
    bar(draw, 70, 300, 780, 68 / 72, TEAL, "Atlaspec", "68 / 72 · 94.44%", p)
    bar(draw, 70, 440, 780, 40 / 72, ORANGE, "Direct renderer generation", "40 / 72 · 55.56%", p)
    rounded(draw, (900, 285, 1205, 555), 24, INK)
    text(draw, (1052, 352), "+38.89", 63, ACID, bold=True, anchor="mm")
    text(draw, (1052, 408), "percentage points", 20, WHITE, bold=True, anchor="mm")
    draw.line((940, 452, 1165, 452), fill="#4D596B", width=2)
    multiline(
        draw,
        (934, 478),
        "Locked pre-fix result.\nSealed holdout not run.",
        18,
        "#D2DAE7",
        width=26,
        spacing=7,
    )


def scene_shadow(draw: ImageDraw.ImageDraw, local: float) -> None:
    text(draw, (70, 115), "Explainable solar-shadow geometry", 44, INK, bold=True)
    text(draw, (72, 174), "Input assumptions stay visible. Geometry stays inspectable.", 25, MUTED)
    ground_y = 555
    draw.line((90, ground_y, 1190, ground_y), fill=INK, width=4)
    sun_x, sun_y = 180, 280
    draw.ellipse((sun_x - 42, sun_y - 42, sun_x + 42, sun_y + 42), fill=ACID, outline=INK, width=3)
    bx, bw, bh = 650, 180, 250
    draw.rectangle((bx, ground_y - bh, bx + bw, ground_y), fill=TEAL, outline=INK, width=3)
    for wx in range(bx + 25, bx + bw - 15, 45):
        for wy in range(ground_y - bh + 35, ground_y - 35, 60):
            draw.rectangle((wx, wy, wx + 20, wy + 28), fill=TEAL_LIGHT)
    ray_progress = scene_progress(local, 0.7, 2.6)
    top = (bx, ground_y - bh)
    shadow_end_x = int(bx + bw + 270 * ray_progress)
    draw.line((sun_x + 32, sun_y + 18, top[0], top[1]), fill=ORANGE, width=4)
    polygon = [(bx + bw, ground_y), (shadow_end_x, ground_y), (bx, ground_y - bh)]
    draw.polygon(polygon, fill="#A9B7AE")
    draw.line((bx, ground_y - bh, shadow_end_x, ground_y), fill=ORANGE, width=4)
    rounded(draw, (875, 300, 1185, 420), 18, WHITE, outline=GRID, width=2)
    text(draw, (905, 337), "solar altitude", 18, MUTED)
    text(draw, (1150, 337), "32.4°", 22, INK, bold=True, anchor="ra")
    text(draw, (905, 380), "shadow length", 18, MUTED)
    text(draw, (1150, 380), "18.7 m", 22, TEAL, bold=True, anchor="ra")


def scene_cctv(draw: ImageDraw.ImageDraw, local: float) -> None:
    text(draw, (70, 115), "Deterministic CCTV coverage", 44, INK, bold=True)
    text(draw, (72, 174), "Coverage claims can expose both assumptions and blind spots.", 25, MUTED)
    rounded(draw, (70, 225, 850, 610), 24, WHITE, outline=GRID, width=2)
    obstacles = [(410, 285, 505, 500), (645, 410, 765, 535)]
    for obstacle in obstacles:
        draw.rectangle(obstacle, fill=INK)
    camera_x, camera_y = 190, 420
    sweep = 0.25 + 0.75 * scene_progress(local, 0.5, 2.8)
    draw.pieslice(
        (camera_x - 30, camera_y - 240, camera_x + int(580 * sweep), camera_y + 240),
        start=-38,
        end=38,
        fill=TEAL_LIGHT,
        outline=TEAL,
        width=3,
    )
    for obstacle in obstacles:
        draw.rectangle(obstacle, fill=INK)
    draw.ellipse((camera_x - 18, camera_y - 18, camera_x + 18, camera_y + 18), fill=ORANGE, outline=INK, width=3)
    text(draw, (875, 270), "VISIBLE", 18, TEAL, bold=True)
    text(draw, (875, 310), "71.2%", 54, INK, bold=True)
    text(draw, (875, 405), "BLIND SPOT", 18, ORANGE, bold=True)
    text(draw, (875, 445), "28.8%", 54, INK, bold=True)
    text(draw, (875, 535), "2 occluding structures", 19, MUTED)


def scene_route(draw: ImageDraw.ImageDraw, local: float) -> None:
    text(draw, (70, 115), "Constraint-aware route reasoning", 44, INK, bold=True)
    text(draw, (72, 174), "A route is only useful when its constraints are explicit.", 25, MUTED)
    nodes = {
        "A": (150, 500),
        "B": (360, 380),
        "C": (570, 510),
        "D": (760, 330),
        "E": (1000, 470),
        "F": (1130, 300),
    }
    edges = [("A", "B"), ("B", "C"), ("C", "D"), ("D", "E"), ("E", "F"), ("B", "D"), ("C", "E")]
    for a, b in edges:
        draw.line((*nodes[a], *nodes[b]), fill="#B9B4A8", width=9)
    draw.line((*nodes["C"], *nodes["D"]), fill=RED, width=13)
    text(draw, (660, 425), "STAIRS", 16, RED, bold=True, anchor="mm")
    route = ["A", "B", "D", "E", "F"]
    segments = list(zip(route, route[1:]))
    progress = scene_progress(local, 0.6, 3.0) * len(segments)
    for idx, (a, b) in enumerate(segments):
        if progress <= idx:
            continue
        amount = min(1.0, progress - idx)
        ax, ay = nodes[a]
        bx, by = nodes[b]
        end = (ax + (bx - ax) * amount, ay + (by - ay) * amount)
        draw.line((ax, ay, *end), fill=TEAL, width=12)
    for name, (x, y) in nodes.items():
        draw.ellipse((x - 15, y - 15, x + 15, y + 15), fill=WHITE, outline=INK, width=4)
        text(draw, (x, y - 28), name, 16, INK, bold=True, anchor="mm")
    stamp(draw, "WHEELCHAIR ACCESSIBLE", 830, 570)


def scene_cta(draw: ImageDraw.ImageDraw, local: float) -> None:
    rounded(draw, (66, 108, 1214, 607), 32, INK)
    text(draw, (640, 178), "Try the Evidence Lab.", 51, WHITE, bold=True, anchor="mm")
    text(draw, (640, 241), "Inspect every claim.", 35, TEAL_LIGHT, bold=True, anchor="mm")
    rounded(draw, (168, 307, 1112, 383), 16, ACID)
    text(draw, (640, 345), "tauptlab.github.io/atlaspec", 29, INK, bold=True, mono=True, anchor="mm")
    rounded(draw, (250, 413, 1030, 483), 16, "#263247", outline="#526078", width=2)
    text(draw, (640, 448), "github.com/tauptlab/atlaspec", 25, WHITE, mono=True, anchor="mm")
    text(draw, (640, 548), "Open source · MIT · v0.2 research candidate", 20, "#D2DAE7", anchor="mm")


SCENES = [
    (0.0, 6.0, scene_title),
    (6.0, 15.0, scene_problem),
    (15.0, 25.0, scene_solution),
    (25.0, 35.0, scene_benchmark),
    (35.0, 43.0, scene_shadow),
    (43.0, 51.0, scene_cctv),
    (51.0, 57.0, scene_route),
    (57.0, 60.0, scene_cta),
]


def render_frame(t: float) -> Image.Image:
    image = BASE.copy()
    scene_index = 1
    for index, (start, end, renderer) in enumerate(SCENES, start=1):
        if start <= t < end or (t >= DURATION and index == len(SCENES)):
            scene_index = index
            local = t - start
            overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
            renderer(ImageDraw.Draw(overlay), local)
            fade = alpha_for_scene(local, end - start)
            overlay.putalpha(overlay.getchannel("A").point(lambda value: int(value * fade)))
            image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
            break
    chrome(ImageDraw.Draw(image), t, scene_index)
    return image


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    poster = render_frame(29.0)
    poster.save(POSTER, optimize=True)

    writer = imageio_ffmpeg.write_frames(
        str(VIDEO),
        (WIDTH, HEIGHT),
        fps=FPS,
        codec="libx264",
        pix_fmt_in="rgb24",
        pix_fmt_out="yuv420p",
        quality=7,
        macro_block_size=16,
        output_params=["-movflags", "+faststart"],
    )
    writer.send(None)
    try:
        for frame_index in range(FPS * DURATION):
            frame = render_frame(frame_index / FPS)
            writer.send(np.asarray(frame, dtype=np.uint8))
            if frame_index % (FPS * 5) == 0:
                print(f"rendered {frame_index / FPS:04.0f}s / {DURATION}s", flush=True)
    finally:
        writer.close()

    frames, seconds = imageio_ffmpeg.count_frames_and_secs(str(VIDEO))
    print(f"wrote {VIDEO}")
    print(f"verified {frames} frames, {seconds:.3f}s, {WIDTH}x{HEIGHT}, {FPS} fps")
    if frames != FPS * DURATION or abs(seconds - DURATION) > 0.05:
        raise RuntimeError("Rendered video does not match the 60-second contract")


if __name__ == "__main__":
    main()
