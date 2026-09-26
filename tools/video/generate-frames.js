#!/usr/bin/env node
/**
 * CMC Teams — Générateur de frames vidéo professionnel
 * Crée les frames titre, transitions et overlays avec node-canvas
 *
 * Usage: node tools/video/generate-frames.js
 */

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Cache des images chargées
const _imageCache = {};

const W = config.width;
const H = config.height;
const C = config.colors;

// === Helpers dessin ===

function clearCanvas(ctx) {
  ctx.fillStyle = C.greenDark;
  ctx.fillRect(0, 0, W, H);
}

/** Fond dégradé Casino luxe */
function drawLuxuryBg(ctx, t = 0) {
  // Base sombre
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0c1a0e');
  grd.addColorStop(0.3, '#0a1408');
  grd.addColorStop(0.7, '#0e1c12');
  grd.addColorStop(1, '#081008');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Halo doré central
  const cx = W / 2 + Math.sin(t * 0.02) * 50;
  const cy = H / 2 + Math.cos(t * 0.015) * 30;
  const radGrd = ctx.createRadialGradient(cx, cy, 50, cx, cy, 600);
  radGrd.addColorStop(0, 'rgba(201,162,39,.12)');
  radGrd.addColorStop(0.5, 'rgba(201,162,39,.04)');
  radGrd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radGrd;
  ctx.fillRect(0, 0, W, H);

  // Lignes diagonales subtiles
  ctx.save();
  ctx.globalAlpha = 0.03;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 80) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  ctx.restore();
}

/** Bordure dorée élégante */
function drawGoldBorder(ctx, padding = 40) {
  ctx.save();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.4;

  // Bordure externe
  roundRect(ctx, padding, padding, W - 2 * padding, H - 2 * padding, 20);
  ctx.stroke();

  // Coins décoratifs
  const cs = 30; // corner size
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.7;

  // Coin haut gauche
  ctx.beginPath();
  ctx.moveTo(padding, padding + cs);
  ctx.lineTo(padding, padding);
  ctx.lineTo(padding + cs, padding);
  ctx.stroke();

  // Coin haut droit
  ctx.beginPath();
  ctx.moveTo(W - padding - cs, padding);
  ctx.lineTo(W - padding, padding);
  ctx.lineTo(W - padding, padding + cs);
  ctx.stroke();

  // Coin bas gauche
  ctx.beginPath();
  ctx.moveTo(padding, H - padding - cs);
  ctx.lineTo(padding, H - padding);
  ctx.lineTo(padding + cs, H - padding);
  ctx.stroke();

  // Coin bas droit
  ctx.beginPath();
  ctx.moveTo(W - padding - cs, H - padding);
  ctx.lineTo(W - padding, H - padding);
  ctx.lineTo(W - padding, H - padding - cs);
  ctx.stroke();

  ctx.restore();
}

/** Symbole diamant ♦ */
function drawDiamond(ctx, x, y, size, color = C.gold, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.6, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.6, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Séparateur doré horizontal */
function drawGoldSeparator(ctx, y, w = 400) {
  const x = (W - w) / 2;
  ctx.save();

  // Ligne dégradée
  const grd = ctx.createLinearGradient(x, y, x + w, y);
  grd.addColorStop(0, 'rgba(201,162,39,0)');
  grd.addColorStop(0.2, 'rgba(201,162,39,.6)');
  grd.addColorStop(0.5, 'rgba(255,220,64,.9)');
  grd.addColorStop(0.8, 'rgba(201,162,39,.6)');
  grd.addColorStop(1, 'rgba(201,162,39,0)');

  ctx.strokeStyle = grd;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();

  // Diamant central
  drawDiamond(ctx, W / 2, y, 8, C.goldBright, 0.8);

  ctx.restore();
}

/** Rectangle arrondi */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Texte avec shadow glow */
function drawGlowText(ctx, text, x, y, font, color, glowColor, glowSize = 20) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Glow
  ctx.shadowColor = glowColor || color;
  ctx.shadowBlur = glowSize;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;

  // Deuxième passe nette
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Badge doré */
function drawBadge(ctx, text, x, y) {
  ctx.save();
  ctx.font = config.fonts.badge;
  const tw = ctx.measureText(text).width;
  const pw = 16, ph = 6;

  roundRect(ctx, x - tw / 2 - pw, y - 12 - ph, tw + 2 * pw, 24 + 2 * ph, 12);
  ctx.fillStyle = 'rgba(201,162,39,.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,162,39,.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = C.goldBright;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Glass morphism card */
function drawGlassCard(ctx, x, y, w, h, opts = {}) {
  ctx.save();
  const r = opts.radius || 16;

  // Fond semi-transparent
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = opts.bg || 'rgba(14,28,18,.65)';
  ctx.fill();

  // Bordure dorée
  ctx.strokeStyle = opts.border || 'rgba(201,162,39,.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Reflet en haut
  const refGrd = ctx.createLinearGradient(x, y, x, y + h * 0.3);
  refGrd.addColorStop(0, 'rgba(255,255,255,.06)');
  refGrd.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, x, y, w, h * 0.3, r);
  ctx.fillStyle = refGrd;
  ctx.fill();

  ctx.restore();
}

/** Particules dorées flottantes */
function drawParticles(ctx, t, count = 30) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const seed = i * 137.508;
    const x = ((seed * 7.31 + t * (0.3 + (i % 5) * 0.1)) % W);
    const y = ((seed * 3.17 + t * (0.2 + (i % 3) * 0.08)) % H);
    const size = 1.5 + (i % 4) * 0.8;
    const alpha = 0.1 + Math.sin(t * 0.05 + i) * 0.08;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = (i % 3 === 0) ? C.goldBright : C.gold;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Barre de progression en bas */
function drawProgressBar(ctx, progress) {
  const barH = 4;
  const y = H - barH;

  // Fond
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  ctx.fillRect(0, y, W, barH);

  // Progression dorée
  const grd = ctx.createLinearGradient(0, y, W * progress, y);
  grd.addColorStop(0, C.gold);
  grd.addColorStop(1, C.goldBright);
  ctx.fillStyle = grd;
  ctx.fillRect(0, y, W * progress, barH);
}

// === Easing functions ===
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
function easeOutBack(t) { const c1=1.70158;const c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }

// === Générateurs de frames par type ===

function generateTitleFrame(ctx, section, frameIndex, totalFrames) {
  const t = frameIndex;
  const progress = frameIndex / totalFrames;

  drawLuxuryBg(ctx, t);
  drawParticles(ctx, t, 40);
  drawGoldBorder(ctx);

  // Animation entrée
  const fadeIn = Math.min(1, frameIndex / 30);
  const slideUp = easeOutCubic(fadeIn);

  ctx.save();
  ctx.globalAlpha = fadeIn;

  // Diamant décoratif
  const diamondY = H * 0.28 + (1 - slideUp) * 40;
  drawDiamond(ctx, W / 2, diamondY, 20, C.goldBright, fadeIn * 0.6);

  // Titre principal
  const titleY = H * 0.42 + (1 - slideUp) * 30;
  drawGlowText(ctx, section.title, W / 2, titleY, config.fonts.huge, C.goldBright, 'rgba(255,220,64,.5)', 30);

  // Séparateur
  if (fadeIn > 0.3) {
    const sepFade = Math.min(1, (fadeIn - 0.3) / 0.4);
    ctx.globalAlpha = sepFade;
    drawGoldSeparator(ctx, H * 0.52, 500 * sepFade);
  }

  // Sous-titre
  if (fadeIn > 0.4) {
    const subFade = Math.min(1, (fadeIn - 0.4) / 0.4);
    ctx.globalAlpha = subFade;
    const subY = H * 0.60 + (1 - easeOutCubic(subFade)) * 20;
    drawGlowText(ctx, section.subtitle, W / 2, subY, config.fonts.subtitle, C.text, 'rgba(224,240,216,.3)', 10);
  }

  // Description
  if (section.description && fadeIn > 0.5) {
    const descFade = Math.min(1, (fadeIn - 0.5) / 0.4);
    ctx.globalAlpha = descFade * 0.7;
    ctx.font = config.fonts.body;
    ctx.fillStyle = C.textSoft;
    ctx.textAlign = 'center';
    ctx.fillText(section.description, W / 2, H * 0.68);
  }

  // Badge version
  if (section.badge && fadeIn > 0.6) {
    const badgeFade = Math.min(1, (fadeIn - 0.6) / 0.3);
    ctx.globalAlpha = badgeFade;
    drawBadge(ctx, section.badge, W / 2, H * 0.78);
  }

  ctx.restore();

  // Fade out à la fin
  if (progress > 0.85) {
    const fadeOut = (progress - 0.85) / 0.15;
    ctx.fillStyle = `rgba(10,20,8,${fadeOut})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawProgressBar(ctx, 0);
}

function generateFeatureListFrame(ctx, section, frameIndex, totalFrames, globalProgress) {
  const t = frameIndex;
  const progress = frameIndex / totalFrames;

  drawLuxuryBg(ctx, t);
  drawParticles(ctx, t, 25);

  // Fade in global
  const fadeIn = Math.min(1, frameIndex / 25);
  ctx.save();
  ctx.globalAlpha = fadeIn;

  // Icône section
  const iconY = 120 + (1 - easeOutCubic(fadeIn)) * 30;
  ctx.font = '64px serif';
  ctx.textAlign = 'center';
  ctx.fillText(section.icon, W / 2, iconY);

  // Titre section
  const titleY = 190 + (1 - easeOutCubic(fadeIn)) * 20;
  drawGlowText(ctx, section.title, W / 2, titleY, config.fonts.title, C.goldBright, 'rgba(255,220,64,.4)', 20);

  drawGoldSeparator(ctx, 230, 300);

  // Feature cards (apparition séquentielle)
  const features = section.features;
  const cols = 2;
  const rows = Math.ceil(features.length / cols);
  const cardW = 720;
  const cardH = 100;
  const gap = 20;
  const startX = (W - (cols * cardW + (cols - 1) * gap)) / 2;
  const startY = 280;

  features.forEach((feat, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const delay = 0.15 + i * 0.08;
    const cardProgress = Math.max(0, Math.min(1, (progress - delay) / 0.15));

    if (cardProgress <= 0) return;

    const cardAlpha = easeOutCubic(cardProgress);
    const slideX = (1 - easeOutBack(cardProgress)) * (col === 0 ? -60 : 60);

    const cx = startX + col * (cardW + gap) + slideX;
    const cy = startY + row * (cardH + gap);

    ctx.save();
    ctx.globalAlpha = cardAlpha * fadeIn;

    drawGlassCard(ctx, cx, cy, cardW, cardH, {
      bg: 'rgba(14,28,18,.55)',
      border: 'rgba(201,162,39,.2)',
    });

    // Icône
    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(feat.icon, cx + 50, cy + cardH / 2);

    // Texte
    ctx.font = config.fonts.body;
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    ctx.fillText(feat.text, cx + 90, cy + cardH / 2 + 2);

    ctx.restore();
  });

  ctx.restore();

  // Fade out
  if (progress > 0.88) {
    const fadeOut = (progress - 0.88) / 0.12;
    ctx.fillStyle = `rgba(10,20,8,${fadeOut})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawProgressBar(ctx, globalProgress);
}

function generateScreenshotFrame(ctx, section, frameIndex, totalFrames, globalProgress, screenshotImg) {
  const t = frameIndex;
  const progress = frameIndex / totalFrames;

  drawLuxuryBg(ctx, t);

  const fadeIn = Math.min(1, frameIndex / 25);
  ctx.save();
  ctx.globalAlpha = fadeIn;

  // Titre en haut
  const titleY = 70 + (1 - easeOutCubic(fadeIn)) * 20;
  drawGlowText(ctx, section.title, W / 2, titleY, '800 48px Georgia, "Times New Roman", serif', C.goldBright, 'rgba(255,220,64,.4)', 15);

  // Sous-titre
  if (section.subtitle) {
    ctx.font = config.fonts.caption;
    ctx.fillStyle = C.textSoft;
    ctx.textAlign = 'center';
    ctx.globalAlpha = fadeIn * 0.8;
    ctx.fillText(section.subtitle, W / 2, titleY + 40);
    ctx.globalAlpha = fadeIn;
  }

  // Zone screenshot (mockup téléphone)
  const mockupW = 380;
  const mockupH = 680;
  const mockupX = (W - mockupW) / 2;
  const mockupY = 140;

  const screenSlide = easeOutCubic(Math.min(1, frameIndex / 35));
  const screenY = mockupY + (1 - screenSlide) * 40;

  // Ombre du mockup
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, mockupX - 10, screenY - 10, mockupW + 20, mockupH + 20, 28);
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.restore();

  // Cadre du téléphone
  roundRect(ctx, mockupX - 10, screenY - 10, mockupW + 20, mockupH + 20, 28);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,162,39,.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Notch (encoche téléphone)
  ctx.save();
  roundRect(ctx, mockupX + mockupW/2 - 50, screenY - 10, 100, 24, 12);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.restore();

  // Écran (clip + screenshot)
  ctx.save();
  roundRect(ctx, mockupX, screenY, mockupW, mockupH, 20);
  ctx.clip();

  if (screenshotImg) {
    // Dessiner le vrai screenshot (ratio preservé, cover)
    const imgW = screenshotImg.width;
    const imgH = screenshotImg.height;
    const scale = Math.max(mockupW / imgW, mockupH / imgH);
    const dw = imgW * scale;
    const dh = imgH * scale;
    const dx = mockupX + (mockupW - dw) / 2;
    const dy = screenY + (mockupH - dh) / 2;
    ctx.drawImage(screenshotImg, dx, dy, dw, dh);
  } else {
    // Placeholder élégant
    ctx.fillStyle = '#0a1408';
    ctx.fillRect(mockupX, screenY, mockupW, mockupH);
    ctx.fillStyle = 'rgba(26,48,32,.95)';
    ctx.fillRect(mockupX, screenY, mockupW, 56);
    ctx.fillStyle = C.goldBright;
    ctx.font = '600 16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('CMC Teams', mockupX + mockupW / 2, screenY + 34);
    ctx.font = '48px serif';
    ctx.fillStyle = C.gold;
    ctx.globalAlpha = fadeIn * 0.4;
    ctx.fillText('📱', mockupX + mockupW / 2, screenY + mockupH / 2);
    ctx.globalAlpha = fadeIn;
  }
  ctx.restore();

  // Highlights à droite et à gauche
  if (section.highlights && section.highlights.length > 0) {
    const hlStartDelay = 0.3;

    section.highlights.forEach((hl, i) => {
      const hlProgress = Math.max(0, Math.min(1, (progress - hlStartDelay - i * 0.1) / 0.15));
      if (hlProgress <= 0) return;

      const hlAlpha = easeOutCubic(hlProgress);
      const isLeft = i % 2 === 0;
      const hlX = isLeft ? mockupX - 360 : mockupX + mockupW + 60;
      const hlY = screenY + 120 + i * 130;

      ctx.save();
      ctx.globalAlpha = hlAlpha * fadeIn;

      // Ligne connecteur
      ctx.strokeStyle = 'rgba(201,162,39,.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const lineStartX = isLeft ? hlX + 280 : hlX;
      const lineEndX = isLeft ? mockupX - 5 : mockupX + mockupW + 5;
      ctx.moveTo(lineStartX, hlY + 20);
      ctx.lineTo(lineEndX, hlY + 20);
      ctx.stroke();
      ctx.setLineDash([]);

      // Card highlight
      drawGlassCard(ctx, hlX, hlY - 8, 280, 56, {
        bg: 'rgba(201,162,39,.08)',
        border: 'rgba(201,162,39,.25)',
        radius: 12,
      });

      // Texte
      ctx.font = config.fonts.caption;
      ctx.fillStyle = C.text;
      ctx.textAlign = isLeft ? 'right' : 'left';
      ctx.fillText(hl, isLeft ? hlX + 260 : hlX + 20, hlY + 24);

      // Point doré
      ctx.beginPath();
      ctx.arc(isLeft ? hlX + 280 : hlX, hlY + 20, 4, 0, Math.PI * 2);
      ctx.fillStyle = C.goldBright;
      ctx.fill();

      ctx.restore();
    });
  }

  ctx.restore();

  // Fade out
  if (progress > 0.88) {
    const fadeOut = (progress - 0.88) / 0.12;
    ctx.fillStyle = `rgba(10,20,8,${fadeOut})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawProgressBar(ctx, globalProgress);
}

// === Transition entre sections ===

function generateTransitionFrame(ctx, frameIndex, transFrames) {
  const progress = frameIndex / transFrames;

  drawLuxuryBg(ctx, frameIndex);

  // Diamant central qui pulse
  const scale = 0.5 + Math.sin(progress * Math.PI) * 0.5;
  drawDiamond(ctx, W / 2, H / 2, 30 * scale, C.goldBright, scale * 0.5);

  // Fondu
  const alpha = 1 - Math.sin(progress * Math.PI) * 0.7;
  ctx.fillStyle = `rgba(10,20,8,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

// === Pipeline principal ===

async function preloadScreenshots() {
  const assetsDir = path.resolve(config.paths.assets);
  const screenshots = {};

  for (const section of config.sections) {
    if (section.type === 'screenshot' && section.view) {
      const ssPath = path.join(assetsDir, `ss_${section.view}.png`);
      if (fs.existsSync(ssPath)) {
        try {
          screenshots[section.view] = await loadImage(ssPath);
          console.log(`  📷 ${section.view} chargé (${screenshots[section.view].width}x${screenshots[section.view].height})`);
        } catch (e) {
          console.log(`  ⚠️  ${section.view}: erreur chargement`);
        }
      }
    }
  }
  return screenshots;
}

async function generateAllFrames() {
  const sections = config.sections;
  const framesDir = path.resolve(config.paths.frames);

  // Nettoyer
  fs.mkdirSync(framesDir, { recursive: true });
  const existing = fs.readdirSync(framesDir).filter(f => f.endsWith('.png'));
  existing.forEach(f => fs.unlinkSync(path.join(framesDir, f)));

  console.log(`🎬 Génération des frames vidéo (${W}x${H} @ ${config.fps}fps)`);
  console.log(`📂 Dossier: ${framesDir}`);
  console.log(`📋 ${sections.length} sections à générer\n`);

  // Pré-charger les screenshots
  console.log('📸 Chargement des screenshots...');
  const screenshots = await preloadScreenshots();
  console.log(`   ${Object.keys(screenshots).length} screenshots chargés\n`);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  let globalFrame = 0;
  let totalFrames = 0;

  // Calculer le total
  sections.forEach((s, i) => {
    totalFrames += s.duration;
    if (i < sections.length - 1) totalFrames += config.timing.transitionFrames;
  });

  console.log(`📊 Total: ${totalFrames} frames = ${(totalFrames / config.fps).toFixed(1)}s\n`);

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const sectionFrames = section.duration;
    const startT = Date.now();

    process.stdout.write(`  [${si + 1}/${sections.length}] ${section.id} (${section.type}) — ${sectionFrames} frames...`);

    for (let fi = 0; fi < sectionFrames; fi++) {
      const globalProgress = globalFrame / totalFrames;

      clearCanvas(ctx);

      switch (section.type) {
        case 'title':
          generateTitleFrame(ctx, section, fi, sectionFrames);
          break;
        case 'feature-list':
          generateFeatureListFrame(ctx, section, fi, sectionFrames, globalProgress);
          break;
        case 'screenshot':
          const ssImg = screenshots[section.view] || null;
          generateScreenshotFrame(ctx, section, fi, sectionFrames, globalProgress, ssImg);
          break;
      }

      // Sauvegarder la frame (JPEG pour vitesse, PNG pour qualité)
      const frameNum = String(globalFrame).padStart(6, '0');
      const outPath = path.join(framesDir, `frame_${frameNum}.png`);
      const buf = canvas.toBuffer('image/png');
      fs.writeFileSync(outPath, buf);

      globalFrame++;
    }

    // Transition entre sections (sauf la dernière)
    if (si < sections.length - 1) {
      const transFrames = config.timing.transitionFrames;
      for (let ti = 0; ti < transFrames; ti++) {
        clearCanvas(ctx);
        generateTransitionFrame(ctx, ti, transFrames);

        const frameNum = String(globalFrame).padStart(6, '0');
        const outPath = path.join(framesDir, `frame_${frameNum}.png`);
        fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
        globalFrame++;
      }
    }

    const elapsed = ((Date.now() - startT) / 1000).toFixed(1);
    console.log(` ✅ (${elapsed}s)`);
  }

  console.log(`\n✅ ${globalFrame} frames générées avec succès!`);
  console.log(`📁 ${framesDir}/frame_000000.png → frame_${String(globalFrame - 1).padStart(6, '0')}.png`);
  console.log(`⏱️  Durée totale: ${(globalFrame / config.fps).toFixed(1)} secondes`);

  return globalFrame;
}

// === Lancement ===
if (require.main === module) {
  generateAllFrames().catch(err => {
    console.error('❌ Erreur:', err);
    process.exit(1);
  });
}

module.exports = { generateAllFrames, drawLuxuryBg, drawGlassCard, drawGlowText, drawGoldBorder, drawDiamond, drawGoldSeparator, drawParticles, drawBadge, drawProgressBar, roundRect };
