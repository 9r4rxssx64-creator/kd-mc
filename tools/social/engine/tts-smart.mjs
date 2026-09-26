#!/usr/bin/env node
/**
 * tts-smart.mjs — Smart TTS with 3 fallbacks
 * 1. Edge TTS (neural, best quality)
 * 2. gTTS via Python (Google Translate TTS, decent quality, always works)
 * 3. espeak-ng (robot, last resort)
 *
 * Usage: node tts-smart.mjs "text to speak" output.mp3
 */
import fs from 'fs';
import { execSync } from 'child_process';

const text = process.argv[2];
const outPath = process.argv[3] || '/tmp/tts_output.mp3';

if (!text) { console.error('Usage: node tts-smart.mjs "text" output.mp3'); process.exit(1); }

async function tryEdgeTTS() {
  try {
    const { MsEdgeTTS } = await import('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('en-US-GuyNeural', 'audio-24khz-96kbitrate-mono-mp3');
    await tts.toFile(outPath, text);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 200) {
      console.log('TTS: Edge (neural)');
      return true;
    }
  } catch {}
  return false;
}

function tryGTTS() {
  // gTTS is a Python package that uses Google Translate's TTS - always works, decent quality
  try {
    execSync('pip install -q gtts 2>/dev/null || pip3 install -q gtts 2>/dev/null', { stdio: 'pipe', timeout: 30000 });
    const safe = text.replace(/'/g, "\\'").slice(0, 5000);
    execSync(`python3 -c "from gtts import gTTS; tts = gTTS('${safe}', lang='en', slow=False); tts.save('${outPath}')"`, { timeout: 60000 });
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 200) {
      console.log('TTS: gTTS (Google)');
      return true;
    }
  } catch {}
  return false;
}

function tryEspeak() {
  try {
    const safe = text.replace(/[\\"]/g, '').slice(0, 3000);
    const wavPath = outPath.replace(/\.mp3$/, '.wav');
    execSync(`espeak-ng -v en -s 155 -p 35 -w "${wavPath}" "${safe}"`, { timeout: 30000 });
    execSync(`ffmpeg -y -i "${wavPath}" -codec:a libmp3lame -b:a 128k "${outPath}"`, { stdio: 'pipe', timeout: 15000 });
    try { fs.unlinkSync(wavPath); } catch {}
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
      console.log('TTS: espeak (robot)');
      return true;
    }
  } catch {}
  return false;
}

async function main() {
  if (await tryEdgeTTS()) process.exit(0);
  if (tryGTTS()) process.exit(0);
  if (tryEspeak()) process.exit(0);
  console.error('All TTS backends failed');
  process.exit(1);
}

main();
