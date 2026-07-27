# 60-second Launch Video

The launch video is a silent-first motion graphic. Every claim is readable
without audio, and the included subtitle file can be uploaded separately.

## Storyboard

| Time | Visual | On-screen message |
|---:|---|---|
| 0–6 s | Atlaspec title and semantic map motif | Agents should write map intent. Not renderer plumbing. |
| 6–15 s | Brittle renderer configuration and failure badges | Direct renderer generation exposes a large failure surface. |
| 15–25 s | YAML flowing through validate/compile into two targets | Semantic YAML in. Deterministic map artifacts out. |
| 25–35 s | Locked comparison bars | 68/72 vs 40/72, +38.89 pp |
| 35–43 s | Sun ray and projected building shadow | Explainable solar-shadow geometry |
| 43–51 s | Camera cones and uncovered area | Deterministic CCTV coverage and blind spots |
| 51–57 s | Accessible route avoiding a blocked segment | Constraint-aware route reasoning |
| 57–60 s | Demo and GitHub URLs | Try the Evidence Lab. Inspect every claim. |

## Optional narration

AI agents should describe what a map must communicate, not hand-author every
renderer expression. Direct MapLibre or Vega-Lite generation exposes a large,
brittle surface. Atlaspec gives the agent a smaller semantic language, validates
it, and deterministically compiles renderer artifacts. In our locked v0.2
development evaluation, Atlaspec produced sixty-eight healthy outputs out of
seventy-two, versus forty for direct generation—a thirty-eight point
eight-nine percentage-point difference. The same intent-first approach can
structure explainable solar-shadow geometry, CCTV coverage and blind spots, and
constraint-aware route reasoning. Atlaspec is a research candidate, not a
production claim. Try the Evidence Lab and inspect the open evidence on GitHub.

## Render

System Python needs Pillow, NumPy, and `imageio-ffmpeg`:

```powershell
python scripts/render_launch_video.py
```

The script creates:

- `media/atlaspec-60s-demo.mp4`;
- `media/atlaspec-60s-poster.png`; and
- `media/atlaspec-60s-demo.srt`.

The intended output is 1280×720, 24 fps, exactly 60 seconds, H.264 video with
no audio. The subtitle file remains useful for social platforms even though
the essential copy is burned into the picture.
