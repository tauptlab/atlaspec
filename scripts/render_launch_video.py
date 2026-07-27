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
OPEN_GRAPH = ROOT / "demo" / "og.png"

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


def scene_semantic_lint(draw: ImageDraw.ImageDraw, local: float) -> None:
    stamp(draw, "SEMANTIC LINT", 70, 108)
    text(draw, (70, 180), "A schema checks shape.", 44, INK, bold=True)
    text(draw, (70, 235), "Atlaspec also checks meaning.", 48, TEAL, bold=True)
    rounded(draw, (70, 310, 525, 585), 22, "#172235")
    rows = [
        ("family:", "choropleth"),
        ("semantic_type:", "count"),
        ("normalization:", "none"),
        ("raw_count:", "reject"),
    ]
    for idx, (key, value) in enumerate(rows):
        text(draw, (100, 355 + idx * 49), key, 20, "#D2DAE7", mono=True)
        text(draw, (315, 355 + idx * 49), value, 20, ACID, mono=True)
    progress = scene_progress(local, 0.6, 2.1)
    rounded(draw, (590, 324, 1205, 465), 20, "#F7DDD4", outline=ORANGE, width=3)
    if progress > 0.45:
        text(draw, (625, 360), "REJECTED · choropleth.raw-count", 21, RED, bold=True, mono=True)
        multiline(
            draw,
            (625, 402),
            "Raw counts on unequal-area polygons require normalization or an explicit override.",
            20,
            INK,
            width=52,
            spacing=5,
        )
    rounded(draw, (590, 492, 1205, 585), 18, INK)
    text(draw, (625, 539), "NO RENDERER ARTIFACT EMITTED", 21, WHITE, bold=True, mono=True, anchor="lm")


def scene_compiler_policy(draw: ImageDraw.ImageDraw, local: float) -> None:
    text(draw, (70, 110), "Policy becomes renderer code", 48, INK, bold=True)
    text(draw, (72, 170), "Deterministically—and with a recorded reason.", 27, MUTED)
    rounded(draw, (70, 230, 505, 592), 22, "#172235")
    text(draw, (100, 270), "shelter-capacity.atlas.yaml", 17, TEAL_LIGHT, mono=True)
    inputs = [
        "family: proportional-symbol",
        "size: capacity",
        "range: [0, 1000]",
        "missing_data: error",
    ]
    for idx, line in enumerate(inputs):
        text(draw, (100, 325 + idx * 46), line, 19, WHITE if idx != 1 else ACID, mono=True)
    draw.line((535, 410, 655, 410), fill=TEAL, width=5)
    draw.polygon([(655, 400), (675, 410), (655, 420)], fill=TEAL)
    rounded(draw, (700, 225, 1205, 592), 22, WHITE, outline=GRID, width=2)
    stamp(draw, "AREA-PROPORTIONAL", 735, 255)
    text(draw, (745, 335), "radius = √value", 36, TEAL, bold=True, mono=True)
    text(draw, (745, 388), "so circle area ∝ capacity", 23, INK, bold=True)
    for idx, radius in enumerate([14, 25, 40]):
        x = 790 + idx * 145
        draw.ellipse((x - radius, 500 - radius, x + radius, 500 + radius), fill=TEAL, outline=INK, width=2)
        text(draw, (x, 565), str([100, 400, 1000][idx]), 16, MUTED, mono=True, anchor="mm")


def scene_evidence(draw: ImageDraw.ImageDraw, local: float) -> None:
    stamp(draw, "ONE-TIME LOCAL HOLDOUT", 70, 105)
    text(draw, (70, 175), "12 tasks × 5 runs × 2 agents", 42, INK, bold=True)
    p = scene_progress(local, 0.6, 3.0)
    bar(draw, 70, 295, 760, 1.0, TEAL, "Atlaspec", "120 / 120 · 100%", p)
    bar(draw, 70, 430, 760, 0.9, ORANGE, "Direct MapLibre", "108 / 120 · 90%", p)
    rounded(draw, (885, 272, 1205, 550), 24, INK)
    text(draw, (1045, 340), "+10 pp", 61, ACID, bold=True, anchor="mm")
    text(draw, (1045, 398), "accepted yield", 20, WHITE, bold=True, anchor="mm")
    draw.line((925, 443, 1165, 443), fill="#4D596B", width=2)
    multiline(
        draw,
        (925, 470),
        "95% CI: +3.3 to +18.3 pp\nLocal agents only",
        18,
        "#D2DAE7",
        width=28,
        spacing=7,
    )


def scene_open_work(draw: ImageDraw.ImageDraw, local: float) -> None:
    stamp(draw, "NOT YET MEASURED", 70, 105, fill="#F4C4AE")
    text(draw, (70, 178), "What the current result does not prove", 45, INK, bold=True)
    cards = [
        ("01", "Full repair benchmark", "Precommitted + powered"),
        ("02", "Independent review", "External tasks + cartographers"),
        ("03", "Fresh confirmation", "v0.2 holdout not run"),
    ]
    for idx, (number, title, detail) in enumerate(cards):
        x = 70 + idx * 390
        y = 295
        rounded(draw, (x, y, x + 350, y + 245), 20, WHITE, outline=GRID, width=2)
        text(draw, (x + 28, y + 36), number, 18, TEAL, bold=True, mono=True)
        text(draw, (x + 28, y + 94), title, 25, INK, bold=True)
        multiline(draw, (x + 28, y + 140), detail, 20, MUTED, width=25, spacing=5)


def scene_cta(draw: ImageDraw.ImageDraw, local: float) -> None:
    rounded(draw, (66, 108, 1214, 607), 32, INK)
    text(draw, (640, 178), "Try the Compiler Lab.", 51, WHITE, bold=True, anchor="mm")
    text(draw, (640, 241), "Find the semantic failure we missed.", 31, TEAL_LIGHT, bold=True, anchor="mm")
    rounded(draw, (168, 307, 1112, 383), 16, ACID)
    text(draw, (640, 345), "tauptlab.github.io/atlaspec", 29, INK, bold=True, mono=True, anchor="mm")
    rounded(draw, (250, 413, 1030, 483), 16, "#263247", outline="#526078", width=2)
    text(draw, (640, 448), "github.com/tauptlab/atlaspec", 25, WHITE, mono=True, anchor="mm")
    text(draw, (640, 548), "Open source · MIT · v0.2 research candidate", 20, "#D2DAE7", anchor="mm")


SCENES = [
    (0.0, 6.0, scene_title),
    (6.0, 14.0, scene_problem),
    (14.0, 23.0, scene_solution),
    (23.0, 32.0, scene_semantic_lint),
    (32.0, 41.0, scene_compiler_policy),
    (41.0, 51.0, scene_evidence),
    (51.0, 57.0, scene_open_work),
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
    poster = render_frame(27.0)
    poster.save(POSTER, optimize=True)
    open_graph = render_frame(3.0).crop((0, 24, WIDTH, 696)).resize((1200, 630))
    open_graph.save(OPEN_GRAPH, optimize=True)

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
