---
name: apex-video-use
description: Montage video client-side via ffmpeg.wasm + Hyperframes. Cut, fade, captions auto, watermark, transitions.
when_to_use: User demande "monter video", "couper clip", "ajouter sous-titres", "watermark", "transition", "compresser video".
model: sonnet
allowed_tools: [video_edit, video_compose_hyperframes]
---

# Skill : apex-video-use

## Mission

Apex monte des videos directement dans le navigateur via `ffmpeg.wasm` (Web Worker offscreen) + Hyperframes (compose video via HTML/CSS/JS). Aucune dependance serveur.

## Quand l'invoquer (auto)

- "monte cette video", "coupe ce passage"
- "ajoute des sous-titres", "captions auto" (Whisper STT)
- "watermark logo", "filigrane"
- "compresse pour TikTok 9:16", "format Instagram 1:1"
- "extrais l'audio MP3", "convertis MOV en MP4"
- "fais un clip best-of" (multi-cuts)

## Capacites

### A. ffmpeg.wasm (operations atomiques)
- Cut : `[start, end]` precis a la milliseconde
- Concat plusieurs clips
- Fade in/out (audio + video)
- Watermark image overlay (position + opacity)
- Resize / aspect ratio change (9:16, 1:1, 16:9)
- Audio extract / replace
- Compression (CRF reglable)

### B. Hyperframes (compose via HTML/CSS/JS)
Pour videos animees programmatiques :
- Texte anime CSS keyframes
- Transitions fancy (parallax, morph)
- Charts anime (data viz video)
- Generation procedurale (variations) 
- Exemple : "video showcase Dribbble shot" generate via HTML

### C. Captions auto via Whisper
- STT local (whisper.wasm) ou API (OpenAI)
- Format SRT/VTT
- Burn-in optionnel (hard-coded)
- Multilingue + traduction inline

## Format input

```json
{
  "operation": "cut | concat | watermark | captions | resize | extract_audio | hyperframes_compose",
  "video_source": "blob:... | data:... | https://...",
  "params": {
    "start_sec": 0,
    "end_sec": 30,
    "watermark_image_base64": "...",
    "captions_lang": "fr",
    "target_ratio": "9:16"
  }
}
```

## Output

```json
{
  "success": true,
  "filename": "video_clip_2026-05-14.mp4",
  "blob_url": "blob:...",
  "duration_sec": 30,
  "size_bytes": 5800000,
  "resolution": "1080x1920"
}
```

## Limites iPhone Safari

- ffmpeg.wasm : OK pour videos < 100MB, sinon RAM crash
- Fallback Cloudflare Worker server-side pour gros fichiers (deja deployed)
- Whisper local : 50MB modele, lazy-load au 1er usage

## Anti-patterns

1. **Generer server-side** par defaut → INTERDIT, client-first
2. **Videos > 100MB sur iOS** sans fallback → toast warning user
3. **Captions sans validation langue** → toujours STT + langue detect
4. **Watermark < 50% opacity** lisible → enforce min/max

## References

- ffmpeg.wasm v0.12+ : https://ffmpegwasm.netlify.app
- Hyperframes : https://hyperframes.dev (compose video via HTML)
- Whisper : whisper.cpp WASM port
- Pattern Apex : `apex-ai/v13/services/skills/video-use.ts` + worker
