---
name: apex-hyperframes
description: Compose videos via HTML/CSS/JS (no ffmpeg). Alternative perf pour videos programmatiques courtes (showcases, animations).
when_to_use: Video courte (<60s) programmatique avec composition declarative HTML/CSS/JS.
model: sonnet
allowed_tools: [video_compose_hyperframes]
---

# Skill : apex-hyperframes

## Mission

Generer videos via HTML/CSS/JS — composition declarative ou les agents IA "ecrivent" la video. Inspire de hyperframes.dev (open-source).

## Quand l'invoquer

- "video showcase pour mon Dribbble shot"
- "animation logo intro 5s"
- "video product feature demo (CSS animations)"
- "data viz video animee" (charts qui se construisent)
- Tout cas ou ffmpeg.wasm serait overkill et HTML/CSS suffit

## Format

```json
{
  "composition_id": "my-anim",
  "data_width": 1920,
  "data_height": 1080,
  "data_start": "0",
  "data_duration": "5s",
  "data_fps": 30,
  "beats": [
    {"id": "beat-1-intro", "duration_ms": 1000, "html": "<div>...</div>", "css": "..."},
    {"id": "beat-2-content", "duration_ms": 3000, "html": "...", "css": "..."}
  ]
}
```

## Output

MP4 ou WebM rendered via Puppeteer Worker offscreen (ou MediaRecorder API client-side).

## Anti-patterns

1. **Hyperframes pour video > 60s** → preferer ffmpeg.wasm
2. **Animations CSS qui freezent UI** → toujours `will-change` + GPU
3. **Polices non embarquees** → font-face avec base64 woff2

## References

- Hyperframes : https://hyperframes.dev (open-source MIT)
- Pattern Apex : `apex-ai/v13/services/core-svc/hyperframes.ts`
- Complementaire : `apex-video-use.md` (ffmpeg.wasm)
