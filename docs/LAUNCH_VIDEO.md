# 60-second Launch Video

The launch video is a silent-first overview of the actual Atlaspec 0.2 product
boundary. Every claim is readable without audio, and the included subtitle
file can be uploaded separately.

## Storyboard

| Time | Visual | On-screen message |
|---:|---|---|
| 0–6 s | Atlaspec title and semantic map motif | Agents should write map intent. Not renderer plumbing. |
| 6–14 s | Brittle renderer configuration and failure badges | Direct generation exposes syntax, semantics, and cartography at once. |
| 14–23 s | YAML through validate/lint/compile into two targets | Semantic YAML in. Deterministic map artifacts out. |
| 23–32 s | Unsafe raw-count choropleth rejected | A schema checks shape; Atlaspec also checks meaning. |
| 32–41 s | Capacity values converted to square-root radii | Policy becomes deterministic renderer code. |
| 41–51 s | One-time local holdout bars and interval | 120/120 vs 108/120, +10 pp; 95% CI +3.3 to +18.3 pp |
| 51–57 s | Three open-evidence cards | A full repair benchmark, independent review, and fresh confirmation remain open. |
| 57–60 s | Demo and GitHub URLs | Try the Compiler Lab. Find the semantic failure we missed. |

The earlier video used routing, shadow, and CCTV examples that are outside the
Atlaspec 0.2 scope. Those scenes were removed rather than relabeled as product
capabilities.

## Optional narration

AI agents should describe what a map must communicate, not hand-author every
renderer expression. Direct renderer generation exposes syntax, semantics, and
cartography at once. Atlaspec gives the agent a smaller semantic language,
validates it, and deterministically compiles renderer artifacts. A schema can
check structure; Atlaspec also rejects misleading choices such as raw-count
choropleths and records why it derives policies such as area-proportional
symbols. In the one-time local holdout, Atlaspec produced one hundred twenty
accepted maps out of one hundred twenty, versus one hundred eight for direct
MapLibre: a ten percentage-point difference, with a ninety-five percent
interval from plus three point three to plus eighteen point three. Stronger
validator-and-repair baselines, independent review, and fresh v0.2 confirmation
remain open. Try the Compiler Lab and find the semantic failure we missed.

## Render

System Python needs Pillow, NumPy, and `imageio-ffmpeg`:

```powershell
python scripts/render_launch_video.py
```

The script creates:

- `media/atlaspec-60s-demo.mp4`;
- `media/atlaspec-60s-poster.png`;
- `media/atlaspec-60s-demo.srt`; and
- `demo/og.png`.

The intended video output is 1280×720, 24 fps, exactly 60 seconds, H.264 with
no audio. The Open Graph image is 1200×630. Essential copy is burned into the
video while the SRT remains useful for social platforms.
