/**
 * Tutorial / Educational Template
 * Step-by-step numbered sections, highlight boxes, calm narration
 * Landscape 1920x1080 for YouTube
 */
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { synthesize, VOICES, detectBackend } from '../engine/tts.js';
import { compileVideo } from '../engine/compiler.js';

const PALETTE = {
  bg: '#0f0f1a',
  card: '#161630',
  cardBorder: '#2a2a5a',
  primary: '#4f8cff',
  secondary: '#7c3aed',
  accent: '#10b981',
  text: '#f0f0f5',
  textDim: '#8888aa',
  highlight: '#fbbf24',
  code: '#1e1e3a',
  codeBorder: '#333366',
};

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function drawStepIndicator(ctx, w, h, stepNum, totalSteps) {
  const indicatorW = 200;
  const indicatorH = 40;
  const x = w - indicatorW - 20;
  const y = 20;

  ctx.fillStyle = hexToRgba(PALETTE.card, 0.9);
  ctx.fillRect(x, y, indicatorW, indicatorH);
  ctx.strokeStyle = hexToRgba(PALETTE.primary, 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, indicatorW, indicatorH);

  ctx.font = `600 ${Math.floor(indicatorH * 0.5)}px "Inter",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.primary;
  ctx.fillText(`Step ${stepNum} / ${totalSteps}`, x + indicatorW / 2, y + indicatorH / 2);

  const barW = indicatorW - 20;
  const barH = 4;
  ctx.fillStyle = hexToRgba(PALETTE.textDim, 0.3);
  ctx.fillRect(x + 10, y + indicatorH + 8, barW, barH);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(x + 10, y + indicatorH + 8, barW * (stepNum / totalSteps), barH);
}

function drawHighlightBox(ctx, x, y, w, h, text, type = 'info') {
  const colors = {
    info: PALETTE.primary,
    tip: PALETTE.accent,
    warning: PALETTE.highlight,
    code: PALETTE.secondary,
  };
  const color = colors[type] || PALETTE.primary;

  ctx.fillStyle = hexToRgba(PALETTE.code, 0.95);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 4, h);
  ctx.strokeStyle = hexToRgba(color, 0.3);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const icons = { info: 'ℹ️', tip: '💡', warning: '⚠️', code: '🔧' };
  const fontSize = Math.floor(h * 0.35);
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(icons[type] || 'ℹ️', x + 14, y + 10);

  ctx.font = `500 ${Math.floor(h * 0.22)}px "Inter",sans-serif`;
  ctx.fillStyle = PALETTE.text;

  const maxW = w - 60;
  const words = text.split(/\s+/);
  let lines = [], current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxW && current) { lines.push(current); current = word; }
    else current = test;
  }
  if (current) lines.push(current);
  const lineH = Math.floor(h * 0.25);
  lines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, x + 50, y + 12 + i * lineH);
  });
}

function parseSteps(script) {
  const lines = script.split('\n').filter(l => l.trim());
  const steps = [];
  let intro = '';
  let currentStep = null;

  for (const line of lines) {
    const stepMatch = line.match(/^(?:Step\s+\d+[.:]\s*|\d+[.)]\s*)(.*)/i);
    if (stepMatch) {
      if (currentStep) steps.push(currentStep);
      currentStep = { title: stepMatch[1].trim(), content: '', tips: [] };
    } else if (currentStep) {
      const tipMatch = line.match(/^(?:Tip|Note|Warning|Pro tip)[.:]\s*(.*)/i);
      if (tipMatch) {
        currentStep.tips.push(tipMatch[1].trim());
      } else {
        currentStep.content += (currentStep.content ? ' ' : '') + line.trim();
      }
    } else {
      intro += (intro ? ' ' : '') + line.trim();
    }
  }
  if (currentStep) steps.push(currentStep);

  if (steps.length === 0) {
    const sentences = script.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    const chunkSize = Math.ceil(sentences.length / 5);
    for (let i = 0; i < sentences.length; i += chunkSize) {
      const chunk = sentences.slice(i, i + chunkSize);
      steps.push({ title: `Part ${steps.length + 1}`, content: chunk.join(' '), tips: [] });
    }
  }

  return { intro, steps };
}

export async function generate(story, opts = {}) {
  const w = opts.width || 1920;
  const h = opts.height || 1080;
  const fps = 30;

  const outDir = path.join(process.cwd(), 'tools/social/output', `tutorial_${Date.now()}`);
  const framesDir = path.join(outDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const backend = await detectBackend();
  const voice = opts.voice || VOICES.en_calm;

  const { intro, steps } = parseSteps(story.script);
  const totalSteps = steps.length;

  console.log(`📚 Tutorial: ${totalSteps} steps, ${w}x${h}`);

  const audioPath = path.join(outDir, 'narration.mp3');
  const fullScript = [intro, ...steps.map((s, i) => `Step ${i + 1}. ${s.title}. ${s.content}`)].join(' ');
  await synthesize(fullScript, audioPath, { voice, backend, rate: -10 });

  const totalDurationSec = Math.max(30, totalSteps * 8 + 5);
  const totalFrames = fps * totalDurationSec;
  const introFrames = fps * 4;
  const framesPerStep = Math.floor((totalFrames - introFrames) / totalSteps);
  let frameIndex = 0;

  for (let f = 0; f < introFrames; f++) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const progress = f / introFrames;

    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, PALETTE.bg);
    grd.addColorStop(1, '#0a0a14');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    const alpha = easeOutCubic(Math.min(1, progress * 2));
    ctx.globalAlpha = alpha;

    const titleSize = Math.floor(h * 0.06);
    ctx.font = `bold ${titleSize}px "Inter",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.primary;
    ctx.fillText(story.title.length > 50 ? story.title.slice(0, 47) + '...' : story.title, w / 2, h * 0.4);

    if (progress > 0.4) {
      ctx.globalAlpha = Math.min(1, (progress - 0.4) * 3);
      ctx.font = `400 ${Math.floor(h * 0.025)}px "Inter",sans-serif`;
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(`${totalSteps} steps — Follow along`, w / 2, h * 0.5);
    }

    ctx.globalAlpha = 1;
    const fname = `frame_${String(frameIndex++).padStart(6, '0')}.png`;
    fs.writeFileSync(path.join(framesDir, fname), canvas.toBuffer('image/png'));
  }

  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    for (let f = 0; f < framesPerStep; f++) {
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      const progress = f / framesPerStep;

      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, PALETTE.bg);
      grd.addColorStop(1, '#080812');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      drawStepIndicator(ctx, w, h, s + 1, totalSteps);

      const stepTitleSize = Math.floor(h * 0.04);
      ctx.font = `bold ${stepTitleSize}px "Inter",sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const numSize = Math.floor(h * 0.08);
      ctx.font = `900 ${numSize}px "Inter",sans-serif`;
      ctx.fillStyle = hexToRgba(PALETTE.primary, 0.2);
      ctx.fillText(`${s + 1}`, 40, 30);

      ctx.font = `bold ${stepTitleSize}px "Inter",sans-serif`;
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(step.title, 40, 100);

      const contentY = 160;
      const contentW = w * 0.55;
      const contentSize = Math.floor(h * 0.025);
      ctx.font = `400 ${contentSize}px "Inter",sans-serif`;
      ctx.fillStyle = hexToRgba(PALETTE.text, 0.85);

      const contentWords = step.content.split(/\s+/);
      const visibleCount = Math.floor(contentWords.length * easeOutCubic(Math.min(1, progress * 1.5)));
      const visibleText = contentWords.slice(0, visibleCount).join(' ');

      let cLines = [], cur = '';
      for (const word of visibleText.split(/\s+/)) {
        if (!word) continue;
        const test = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(test).width > contentW && cur) { cLines.push(cur); cur = word; }
        else cur = test;
      }
      if (cur) cLines.push(cur);
      const cLineH = contentSize * 1.5;
      cLines.forEach((line, i) => ctx.fillText(line, 40, contentY + i * cLineH));

      if (step.tips.length > 0 && progress > 0.5) {
        const tipAlpha = Math.min(1, (progress - 0.5) * 3);
        ctx.globalAlpha = tipAlpha;
        const boxX = w * 0.6;
        const boxW = w * 0.35;
        step.tips.forEach((tip, ti) => {
          drawHighlightBox(ctx, boxX, 160 + ti * 120, boxW, 100, tip, ti === 0 ? 'tip' : 'info');
        });
        ctx.globalAlpha = 1;
      }

      const subSize = Math.floor(h * 0.028);
      ctx.font = `bold ${subSize}px "Inter",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = PALETTE.text;
      const subY = h - 60;
      const lastWords = contentWords.slice(Math.max(0, visibleCount - 8), visibleCount).join(' ');
      if (lastWords) {
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(lastWords, w / 2, subY);
        ctx.fillText(lastWords, w / 2, subY);
      }

      const fname = `frame_${String(frameIndex++).padStart(6, '0')}.png`;
      fs.writeFileSync(path.join(framesDir, fname), canvas.toBuffer('image/png'));
    }
    console.log(`  📚 Step ${s + 1}/${totalSteps} rendered`);
  }

  console.log(`🖼️  ${frameIndex} frames generated`);

  const videoPath = path.join(outDir, `tutorial_${Date.now()}.mp4`);
  await compileVideo(framesDir, videoPath, { fps, width: w, height: h, crf: 22 });

  console.log(`✅ Tutorial video: ${videoPath}`);
  return {
    videoPath,
    metadata: {
      title: story.title,
      steps: totalSteps,
      format: 'landscape',
      resolution: `${w}x${h}`,
      frames: frameIndex,
    },
  };
}
