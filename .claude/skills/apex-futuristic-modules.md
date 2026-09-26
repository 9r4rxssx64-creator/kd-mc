---
name: apex-futuristic-modules
description: Registry de 60+ modules outils intelligents dernier cri (AI/ML, Crypto Post-Quantum, AR/VR, Web3, Realtime, IoT, Spatial). Apex utilise systematiquement.
when_to_use: User demande feature avancee/futuriste ou Apex detecte cas d'usage adapte.
model: sonnet
allowed_tools: [futuristic_module_invoke]
---

# Skill : apex-futuristic-modules — 60+ outils dernier cri 2026

## Mission

Apex doit s'aligner sur l'etat de l'art mondial 2026. Ce skill enregistre 60+ modules futuristes invocables via tool use. Tous lazy-loaded, fallback gracious si lib indispo.

## Categories

### A. AI Multimodal (8 modules)

1. **`apex-vision-claude-4`** — Claude Vision 4 (Opus 4.7+) : description image, OCR, scene understanding
2. **`apex-vision-gemini-3`** — Gemini 3 Pro : video understanding, 1M context image
3. **`apex-tts-elevenlabs-flash`** — ElevenLabs Flash v2.5 : clone vocal 30 langues, latence 75ms
4. **`apex-tts-openai-hd`** — OpenAI TTS-3 HD : 6 voix premium
5. **`apex-stt-whisper-large-v4`** — Whisper Large v4 (Hugging Face) : transcription 99 langues
6. **`apex-image-gen-flux2-pro`** — FLUX 2 Pro (Black Forest Labs) : photorealistic SOTA
7. **`apex-image-gen-imagen-4`** — Google Imagen 4 : composition complexe
8. **`apex-video-gen-sora-2`** — OpenAI Sora 2 : 60s video photoreal

### B. Generative Pro (7)

9. **`apex-video-gen-veo-3`** — Google Veo 3 : 4K video 8s avec audio
10. **`apex-video-gen-kling-2`** — Kling AI 2.0 : video 2min consistency
11. **`apex-music-suno-v5`** — Suno v5 : musique complete (intro/verses/chorus/outro)
12. **`apex-music-udio-2`** — Udio v2 : haute fidelite professionnelle
13. **`apex-3d-meshy-v4`** — Meshy AI v4 : text → 3D model GLB/FBX
14. **`apex-3d-tripoai-2`** — TripoAI : photo → 3D rapide
15. **`apex-avatar-hedra-2`** — Hedra Character-2 : avatar parlant photo+audio

### C. Productivity Smart (8)

16. **`apex-whiteboard-collab`** — Whiteboard collaboratif WebRTC + tldraw
17. **`apex-mindmap-auto`** — Mind map auto-genere depuis conversation
18. **`apex-flowchart-mermaid`** — Mermaid + tldraw + draw.io export
19. **`apex-spreadsheet-ai`** — Tableur natural language formulas (Excel-like)
20. **`apex-email-smart-reply`** — Drafts emails contextes (Gmail/Outlook)
21. **`apex-calendar-ai-scheduler`** — Scheduling multi-agendas (Calendly-like)
22. **`apex-notes-second-brain`** — Second brain personnel (Roam/Logseq-like)
23. **`apex-task-eisenhower`** — Task management matrice Eisenhower auto

### D. Security & Crypto Post-Quantum (6)

24. **`apex-pq-crypto-kyber`** — Kyber-1024 (NIST PQC standard, key encapsulation)
25. **`apex-pq-crypto-dilithium`** — Dilithium-5 (PQ signatures NIST standard)
26. **`apex-zkp-proofs`** — Zero-knowledge proofs (zk-SNARKs simplifies)
27. **`apex-anomaly-detection-ml`** — ML anomaly detection user behavior (TensorFlow.js)
28. **`apex-biometric-multi-factor`** — FaceID + WebAuthn + voiceprint compose
29. **`apex-totp-passkey`** — TOTP RFC 6238 + Passkeys WebAuthn level 3

### E. Realtime & Streaming (5)

30. **`apex-livestream-relay`** — RTMP relay via Cloudflare Stream
31. **`apex-realtime-translate`** — Whisper streaming + DeepL realtime (interpret mode)
32. **`apex-voice-clone-live`** — Clone voice temps reel (ElevenLabs Conversational)
33. **`apex-webrtc-mesh`** — WebRTC peer-to-peer mesh (max 8 participants)
34. **`apex-screen-share-secure`** — Screen sharing chiffre bout-en-bout

### F. Web3 & Blockchain (5)

35. **`apex-wallet-readonly`** — Wallet read-only (Phantom/MetaMask/Ledger via WalletConnect)
36. **`apex-nft-mint-solana`** — Mint NFT Solana via Metaplex
37. **`apex-nft-mint-polygon`** — Mint Polygon (gas low)
38. **`apex-smart-contract-ai`** — Solidity AI generator + Slither audit
39. **`apex-defi-tracker`** — Portfolio tracker DeFi (Zerion-like)

### G. IoT & Domotique (5)

40. **`apex-home-assistant-bridge`** — Bridge Home Assistant local
41. **`apex-matter-thread`** — Matter/Thread protocol (Apple/Google standard)
42. **`apex-ble-mesh`** — Bluetooth LE Mesh (smart bulbs, locks)
43. **`apex-zigbee-bridge`** — Zigbee via Conbee/Sonoff USB
44. **`apex-tuya-smart-life`** — Tuya/Smart Life (1000+ devices)

### H. Analytics & Data (5)

45. **`apex-analytics-dashboard-ai`** — Auto-dashboard generation depuis data CSV/JSON
46. **`apex-sql-ai-safe`** — Text → SQL safe (read-only, no DROP/DELETE)
47. **`apex-data-pipeline-nocode`** — ETL no-code (Zapier-like simple)
48. **`apex-vector-search-qdrant`** — Vector search Qdrant/Pinecone/Cloudflare Vectorize
49. **`apex-chart-recharts`** — Charts Recharts/ApexCharts + export PNG

### I. AR/VR Spatial (4)

50. **`apex-webar-modelviewer`** — Google model-viewer (3D + AR iOS Quick Look)
51. **`apex-vr-aframe`** — A-Frame WebXR (Cardboard/Quest compatible)
52. **`apex-hand-tracking-mediapipe`** — MediaPipe hand tracking webcam
53. **`apex-spatial-vision-pro`** — visionOS Spatial Audio + 3D objects

### J. Specialized Pro (8)

54. **`apex-code-editor-monaco`** — Monaco editor IDE-like + tab autocomplete IA
55. **`apex-compiler-multi-wasm`** — Rust/Go/Python/Zig via WebAssembly (compile in browser)
56. **`apex-math-whiteboard`** — Equations LaTeX live + KaTeX render
57. **`apex-music-composer-musicxml`** — Compose partition (Flat.io-like)
58. **`apex-cad-svg-dxf`** — Text → SVG/DXF (CAD basic)
59. **`apex-pcb-designer`** — Schematic PCB simple (KiCad export)
60. **`apex-game-engine-three`** — Three.js game engine (mini-games procedural)
61. **`apex-shader-glsl-ai`** — GLSL shader generation + ShaderToy preview

### K. Health & Wellness (4)

62. **`apex-health-apple-bridge`** — Bridge Apple Health (PWA + Shortcuts)
63. **`apex-mental-cbt-guided`** — CBT guided sessions (mindfulness)
64. **`apex-nutrition-ai-meal`** — Meal planner + macros (Yazio-like)
65. **`apex-fitness-tracker`** — Workout tracker (StrongApp-like)

### L. Education (4)

66. **`apex-tutor-ai-personalized`** — Tuteur IA cours personnalises
67. **`apex-flashcards-spaced`** — Flashcards spaced repetition (Anki algorithm)
68. **`apex-code-lab-interactive`** — Tutorials interactifs (CodeAcademy-like)
69. **`apex-language-immersive`** — Apprentissage langues immersif (Duolingo+)

## Format invocation

```json
{
  "module_id": "apex-image-gen-flux2-pro",
  "params": { "prompt": "...", "size": "1024x1024" },
  "user_tier": "admin | client_pro | family"
}
```

## Cost & quota

Chaque module a un cout estime (€ par call) affichable :

- **Free** : Whisper local, MediaPipe, KaTeX, charts, code editor, etc.
- **Premium** : FLUX 2, Veo 3, Sora 2, Suno v5 → modal warning cost > 0.10€

User peut activer toggle "Premium modules" dans Reglages (default OFF clients, ON admin).

## Securite

Chaque module premium check :
- Tier user (admin/client_pro can use, family read-only metadata)
- Quota mensuel par user (`ax_user_quota_<uid>`)
- Cost confirmation > 1€

## Anti-patterns

1. **Activer tous premium par defaut** → INTERDIT, opt-in
2. **Pas de cost preview** → toujours afficher avant call premium
3. **Module sans tier check** → INTERDIT, securite tier obligatoire
4. **Lib > 5MB sans warning** → toast "lazy-loading lourd"

## Veille techno automatique

Sentinelle `innovation-watch` (1×/sem) scan :
- Hugging Face trending models
- GitHub Awesome lists (`awesome-ai-tools`, `awesome-claude-code`)
- HackerNews "Show HN"
- Replicate trending models

→ Propose ajout nouveaux modules via `ax_claude_todo`.

## References

- Veille tech : Anthropic blog, OpenAI blog, Google AI blog
- Pattern Apex : `apex-ai/v13/services/skills/futuristic-modules.ts`
- Vue : `?view=futuristic-modules`
