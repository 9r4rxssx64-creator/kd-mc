#!/usr/bin/env node
/**
 * CMC Teams — Script maître de génération de vidéo de démonstration
 *
 * Ce script orchestre l'ensemble du pipeline :
 * 1. Capture des screenshots de l'application (Puppeteer)
 * 2. Génération des frames animées (node-canvas)
 * 3. Intégration des screenshots dans les frames
 * 4. Compilation en vidéo MP4/WebM/GIF (FFmpeg)
 *
 * Usage:
 *   node tools/video/make-demo.js              # MP4 complet
 *   node tools/video/make-demo.js --format gif  # GIF animé
 *   node tools/video/make-demo.js --format all  # Tous formats
 *   node tools/video/make-demo.js --skip-capture # Sans capture (utilise screenshots existants)
 *   node tools/video/make-demo.js --fast         # Mode rapide (moins de frames)
 *
 * Pré-requis: npm install (puppeteer canvas sharp @ffmpeg-installer/ffmpeg fluent-ffmpeg)
 */

const path = require('path');
const fs = require('fs');

// Parse arguments
const args = process.argv.slice(2);
const flags = {
  format: 'mp4',
  skipCapture: args.includes('--skip-capture'),
  fast: args.includes('--fast'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};
const fmtIdx = args.indexOf('--format');
if (fmtIdx >= 0 && args[fmtIdx + 1]) flags.format = args[fmtIdx + 1];

async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║     ♦  CMC Teams — Video Demo Pipeline  ♦   ║');
  console.log('  ║        Casino de Monte-Carlo — SBM           ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');

  // Mode rapide : réduire les durées
  if (flags.fast) {
    console.log('⚡ Mode rapide activé (durées réduites)\n');
    const config = require('./config');
    config.sections.forEach(s => { s.duration = Math.ceil(s.duration / 2); });
    config.timing.transitionFrames = 15;
  }

  // === Étape 1: Capture screenshots ===
  if (!flags.skipCapture) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ÉTAPE 1/3 — Capture des vues');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      const { captureViews } = require('./capture-app');
      await captureViews();
    } catch (err) {
      console.log(`⚠️  Capture échouée: ${err.message}`);
      console.log('   → Continuation avec placeholders...\n');
    }
  } else {
    console.log('⏭️  Capture ignorée (--skip-capture)\n');
  }

  // === Étape 2: Génération des frames ===
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ÉTAPE 2/3 — Génération des frames');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const { generateAllFrames } = require('./generate-frames');
  const totalFrames = await generateAllFrames();

  // === Étape 3: Compilation vidéo ===
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ÉTAPE 3/3 — Compilation vidéo');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const { compileVideo, compileWebM, compileGif } = require('./compile-video');
  const outputs = [];

  try {
    if (flags.format === 'all') {
      outputs.push(compileVideo());
      outputs.push(compileWebM());
      outputs.push(compileGif());
    } else if (flags.format === 'webm') {
      outputs.push(compileWebM());
    } else if (flags.format === 'gif') {
      outputs.push(compileGif());
    } else {
      outputs.push(compileVideo());
    }
  } catch (err) {
    console.error('❌ Compilation échouée:', err.message);
    console.log('\n💡 Les frames PNG sont disponibles dans tools/video/frames/');
    console.log('   Vous pouvez compiler manuellement avec FFmpeg.');
  }

  // === Résumé ===
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║              ✅ TERMINÉ                      ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  ⏱️  Temps total: ${elapsed}s`);
  console.log(`  🎞️  Frames générées: ${totalFrames}`);

  if (outputs.length > 0) {
    console.log('  📁 Fichiers:');
    outputs.forEach(f => {
      const stats = fs.statSync(f);
      console.log(`     → ${path.basename(f)} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    });
  }

  console.log('');
}

main().catch(err => {
  console.error('\n❌ Erreur fatale:', err);
  process.exit(1);
});
