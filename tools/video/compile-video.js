#!/usr/bin/env node
/**
 * CMC Teams — Compilateur vidéo MP4
 * Assemble les frames PNG en vidéo MP4 avec FFmpeg
 *
 * Usage: node tools/video/compile-video.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Trouver FFmpeg
function findFfmpeg() {
  try {
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch (e) {
    try {
      execSync('which ffmpeg', { stdio: 'pipe' });
      return 'ffmpeg';
    } catch (e2) {
      throw new Error('FFmpeg non trouvé. Installez: npm install @ffmpeg-installer/ffmpeg');
    }
  }
}

function compileVideo(opts = {}) {
  const ffmpeg = findFfmpeg();
  const framesDir = path.resolve(config.paths.frames);
  const outputDir = path.resolve(config.paths.output);

  fs.mkdirSync(outputDir, { recursive: true });

  // Vérifier les frames
  const frames = fs.readdirSync(framesDir).filter(f => f.startsWith('frame_') && f.endsWith('.png')).sort();
  if (frames.length === 0) {
    throw new Error('Aucune frame trouvée. Lancez d\'abord: node tools/video/generate-frames.js');
  }

  console.log(`🎬 Compilation vidéo MP4`);
  console.log(`📂 Frames: ${framesDir} (${frames.length} frames)`);
  console.log(`🎞️  FPS: ${config.fps}`);
  console.log(`📐 Résolution: ${config.width}x${config.height}`);

  const timestamp = new Date().toISOString().slice(0, 10);
  const outputFile = opts.output || path.join(outputDir, `CMCTeams_Demo_${timestamp}.mp4`);

  // Commande FFmpeg
  const cmd = [
    `"${ffmpeg}"`,
    '-y',                                    // Écraser si existe
    '-framerate', config.fps,                // FPS entrée
    '-i', `"${path.join(framesDir, 'frame_%06d.png')}"`,  // Pattern frames
    '-c:v', 'libx264',                       // Codec H.264
    '-preset', opts.preset || 'medium',      // Qualité/vitesse
    '-crf', opts.crf || '18',                // Qualité (18 = très bonne)
    '-pix_fmt', 'yuv420p',                   // Compatibilité maximale
    '-movflags', '+faststart',               // Streaming web
    '-vf', `scale=${config.width}:${config.height}:flags=lanczos`,
    '-profile:v', 'high',                    // Profil H.264 haute qualité
    '-level', '4.1',                         // Niveau compatibilité
    '-bf', '2',                              // B-frames
    '-g', config.fps * 2,                    // GOP (2 secondes)
    '-metadata', 'title="CMC Teams — Démonstration"',
    '-metadata', 'artist="Casino de Monte-Carlo"',
    '-metadata', `comment="Généré automatiquement — ${config.sections.length} sections"`,
    `"${outputFile}"`,
  ].join(' ');

  console.log(`\n🔧 Compilation en cours...`);

  try {
    execSync(cmd, {
      stdio: 'pipe',
      timeout: 300000, // 5 min max
    });
  } catch (err) {
    console.error('Stderr:', err.stderr?.toString().slice(-500));
    throw new Error('FFmpeg a échoué: ' + (err.message || '').slice(0, 200));
  }

  const stats = fs.statSync(outputFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
  const duration = (frames.length / config.fps).toFixed(1);

  console.log(`\n✅ Vidéo générée avec succès!`);
  console.log(`📁 Fichier: ${outputFile}`);
  console.log(`📊 Taille: ${sizeMB} MB`);
  console.log(`⏱️  Durée: ${duration}s`);
  console.log(`🎞️  ${frames.length} frames @ ${config.fps}fps`);

  return outputFile;
}

// Variante WebM (plus léger, meilleur pour le web)
function compileWebM(opts = {}) {
  const ffmpeg = findFfmpeg();
  const framesDir = path.resolve(config.paths.frames);
  const outputDir = path.resolve(config.paths.output);

  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 10);
  const outputFile = opts.output || path.join(outputDir, `CMCTeams_Demo_${timestamp}.webm`);

  const cmd = [
    `"${ffmpeg}"`,
    '-y',
    '-framerate', config.fps,
    '-i', `"${path.join(framesDir, 'frame_%06d.png')}"`,
    '-c:v', 'libvpx-vp9',
    '-b:v', '2M',
    '-crf', '30',
    '-pix_fmt', 'yuv420p',
    '-row-mt', '1',
    '-tile-columns', '2',
    '-threads', '4',
    '-metadata', 'title="CMC Teams — Démonstration"',
    `"${outputFile}"`,
  ].join(' ');

  console.log(`\n🔧 Compilation WebM...`);
  execSync(cmd, { stdio: 'pipe', timeout: 300000 });

  const stats = fs.statSync(outputFile);
  console.log(`✅ WebM: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  return outputFile;
}

// GIF animé (pour README)
function compileGif(opts = {}) {
  const ffmpeg = findFfmpeg();
  const framesDir = path.resolve(config.paths.frames);
  const outputDir = path.resolve(config.paths.output);

  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 10);
  const outputFile = opts.output || path.join(outputDir, `CMCTeams_Demo_${timestamp}.gif`);

  // Deux passes: 1) palette, 2) GIF avec palette optimisée
  const paletteFile = path.join(outputDir, '_palette.png');

  const scaleW = opts.width || 640;

  const cmdPalette = [
    `"${ffmpeg}"`,
    '-y',
    '-framerate', config.fps,
    '-i', `"${path.join(framesDir, 'frame_%06d.png')}"`,
    '-vf', `fps=10,scale=${scaleW}:-1:flags=lanczos,palettegen=stats_mode=diff`,
    `"${paletteFile}"`,
  ].join(' ');

  const cmdGif = [
    `"${ffmpeg}"`,
    '-y',
    '-framerate', config.fps,
    '-i', `"${path.join(framesDir, 'frame_%06d.png')}"`,
    '-i', `"${paletteFile}"`,
    '-lavfi', `"fps=10,scale=${scaleW}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"`,
    `"${outputFile}"`,
  ].join(' ');

  console.log(`\n🔧 Compilation GIF (${scaleW}px)...`);
  execSync(cmdPalette, { stdio: 'pipe', timeout: 120000 });
  execSync(cmdGif, { stdio: 'pipe', timeout: 120000 });

  // Nettoyer palette
  if (fs.existsSync(paletteFile)) fs.unlinkSync(paletteFile);

  const stats = fs.statSync(outputFile);
  console.log(`✅ GIF: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  return outputFile;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const format = args[0] || 'mp4';

  try {
    if (format === 'webm') {
      compileWebM();
    } else if (format === 'gif') {
      compileGif();
    } else if (format === 'all') {
      compileVideo();
      compileWebM();
      compileGif();
    } else {
      compileVideo();
    }
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

module.exports = { compileVideo, compileWebM, compileGif, findFfmpeg };
