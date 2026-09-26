#!/usr/bin/env node
/**
 * cli.js — Interface ligne de commande pour le système social
 *
 * Usage :
 *   node tools/social/cli.js generate --type narrative --story betrayal-001 --format short
 *   node tools/social/cli.js generate --type narrative --random --format long
 *   node tools/social/cli.js list-stories
 *   node tools/social/cli.js list-voices
 *   node tools/social/cli.js test-tts --text "Hello world" --voice en-US-GuyNeural
 *   node tools/social/cli.js publish-telegram --video <path>
 *   node tools/social/cli.js status
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCIAL_ROOT = __dirname;

/* ---------- Argument parsing ---------- */

function parseArgs(argv) {
  const cmd = argv[2];
  const args = { _cmd: cmd };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

/* ---------- Commands ---------- */

async function cmdListStories() {
  const lib = JSON.parse(
    fs.readFileSync(path.join(SOCIAL_ROOT, "config", "content-library.json"), "utf8")
  );
  console.log("\n📚 Bibliothèque de contenus\n");
  for (const [category, items] of Object.entries(lib)) {
    if (category.startsWith("_")) continue;
    console.log(`\n=== ${category} ===`);
    for (const item of items) {
      const status = item.used ? "✅" : "🆕";
      console.log(`  ${status} ${item.id}  [${item.lang}]  "${item.title}"  (${item.tags.join(", ")})`);
    }
  }
  console.log("");
}

async function cmdListVoices() {
  const { listVoices, VOICES } = await import("./engine/tts.js");
  console.log("\n🗣 Voix recommandées (par cas d'usage)\n");
  for (const [k, v] of Object.entries(VOICES)) {
    console.log(`  ${k.padEnd(35)} → ${v}`);
  }
  console.log("\n📡 Récupération de la liste complète depuis Edge TTS...");
  try {
    const voices = await listVoices();
    console.log(`Total : ${voices.length} voix disponibles`);
    const byLocale = {};
    for (const v of voices) {
      const loc = v.Locale || v.locale || "unknown";
      byLocale[loc] = (byLocale[loc] || 0) + 1;
    }
    const top = Object.entries(byLocale).sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log("\nTop 15 langues :");
    for (const [l, n] of top) console.log(`  ${l.padEnd(10)} : ${n} voix`);
  } catch (e) {
    console.error("⚠ Impossible de récupérer les voix :", e.message);
  }
}

async function cmdTestTts(args) {
  const { generateSpeech, VOICES } = await import("./engine/tts.js");
  const text = args.text || "Hello, this is a test of the Microsoft Edge text to speech engine.";
  const voice = args.voice || VOICES.en_storytelling_male_dramatic;
  const out = args.out || path.join(SOCIAL_ROOT, "output", "tts-test.mp3");

  console.log(`🗣 TTS test : "${text.substring(0, 60)}..."`);
  console.log(`   Voix    : ${voice}`);
  console.log(`   Sortie  : ${out}\n`);

  const result = await generateSpeech(text, {
    outputPath: out,
    voice,
    rate: parseInt(args.rate || "0", 10),
    pitch: parseInt(args.pitch || "0", 10),
  });

  console.log(`✅ Audio généré`);
  console.log(`   Fichier : ${result.audioPath}`);
  console.log(`   Taille  : ${(result.sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`   Durée   : ~${(result.durationMs / 1000).toFixed(1)}s (estimation)`);
}

async function cmdGenerate(args) {
  const type = args.type || "narrative";
  const format = args.format || "long"; // long | short

  // --- Option : générer un script via Gemma 4 AI ---
  if (args["ai-script"]) {
    const { generateScript, addToLibrary } = await import("./engine/script-generator.js");
    const niche = args.niche || "betrayal-revenge";
    const length = args.length || (format === "short" ? "short" : "medium");
    console.log(`\n🤖 Génération script via Gemma 4 (niche=${niche}, length=${length})...`);
    const newScript = await generateScript({ niche, length, topic: args.topic, language: args.language });
    console.log(`✅ Script généré : "${newScript.title}" (${newScript.wordCount} mots)`);

    // Ajoute à la library et continue avec ce script
    addToLibrary(newScript);
    args.story = newScript.id;
  }

  const lib = JSON.parse(
    fs.readFileSync(path.join(SOCIAL_ROOT, "config", "content-library.json"), "utf8")
  );

  // Trouve la catégorie qui matche le type
  const matchingCategories = Object.keys(lib).filter(
    (k) => !k.startsWith("_") && k.includes(type)
  );
  if (matchingCategories.length === 0) {
    console.error(`❌ Aucune catégorie pour type="${type}". Disponibles :`, Object.keys(lib).filter((k) => !k.startsWith("_")));
    process.exit(1);
  }

  // Sélectionne une histoire
  let story = null;
  if (args.story) {
    for (const cat of matchingCategories) {
      const found = lib[cat].find((s) => s.id === args.story);
      if (found) { story = found; break; }
    }
    if (!story) {
      console.error(`❌ Histoire "${args.story}" introuvable`);
      process.exit(1);
    }
  } else if (args.random) {
    // Première non utilisée d'une catégorie aléatoire
    const cat = matchingCategories[Math.floor(Math.random() * matchingCategories.length)];
    const unused = lib[cat].filter((s) => !s.used);
    if (unused.length === 0) {
      console.error(`❌ Toutes les histoires de ${cat} sont déjà utilisées`);
      process.exit(1);
    }
    story = unused[Math.floor(Math.random() * unused.length)];
  } else {
    // Premier non utilisé
    for (const cat of matchingCategories) {
      const unused = lib[cat].filter((s) => !s.used);
      if (unused.length > 0) { story = unused[0]; break; }
    }
    if (!story) {
      console.error(`❌ Toutes les histoires sont utilisées. Utilise --story <id> pour forcer.`);
      process.exit(1);
    }
  }

  if (!story.script || typeof story.script !== "string" || story.script.trim().length < 20) {
    console.error(`❌ Script invalide pour ${story.id} — doit contenir au moins 20 caractères`);
    process.exit(1);
  }
  if (!["long", "short"].includes(format)) {
    console.error(`❌ Format invalide : "${format}". Utilise "long" ou "short".`);
    process.exit(1);
  }

  console.log(`\n🎬 Génération vidéo`);
  console.log(`   Story    : ${story.id} — "${story.title}"`);
  console.log(`   Tags     : ${(story.tags || []).join(", ")}`);
  console.log(`   Format   : ${format}`);
  console.log(`   Template : ${templateName}`);
  console.log(`   Mots     : ${story.script.split(/\s+/).length}\n`);

  const templateName = args.template || "narrative-storytelling";
  const TEMPLATES = ["narrative-storytelling", "documentary", "listicle", "breaking-news", "tutorial"];
  if (!TEMPLATES.includes(templateName)) {
    console.error(`❌ Template inconnu : ${templateName}. Disponibles : ${TEMPLATES.join(", ")}`);
    process.exit(1);
  }
  const template = await import(`./templates/${templateName}.js`);
  const generateFn = template.generate || template.generateNarrativeVideo;
  if (!generateFn) {
    console.error(`❌ Template ${templateName} n'exporte pas de fonction generate()`);
    process.exit(1);
  }
  const musicPath = args.music || findFirstMusic();
  const result = await generateFn(story, {
    format,
    musicPath,
    bgImage: args.bg,
    verbose: args.verbose === true || args.verbose === "true",
    keepFrames: args.keep === true || args.keep === "true",
  });

  console.log(`\n✅ Vidéo générée`);
  console.log(`   Path     : ${result.videoPath}`);
  console.log(`   Durée    : ${result.durationSec?.toFixed(1) || '?'}s`);
  console.log(`   Taille   : ${result.metadata?.sizeBytes ? (result.metadata.sizeBytes / 1024 / 1024).toFixed(2) + ' MB' : '?'}`);
  console.log(`   Format   : ${result.metadata?.width || '?'}x${result.metadata?.height || '?'}`);

  // Sauvegarde le metadata enrichi
  const metaPath = path.join(path.dirname(result.videoPath), "metadata.json");
  const enrichedMeta = { ...result.metadata, template: templateName, storyId: story.id, generatedAt: new Date().toISOString() };
  fs.writeFileSync(metaPath, JSON.stringify(enrichedMeta, null, 2));
  console.log(`   Metadata : ${metaPath}`);

  // ── Post-generate: Analytics tracking ──
  try {
    const { recordMetrics } = await import("./engine/analytics.js");
    recordMetrics(story.id, "local", {
      title: story.title,
      niche: story.category || (story.tags || [])[0] || "unknown",
      tags: story.tags,
      duration: result.durationSec || 0,
      publishedAt: new Date().toISOString(),
      views: 0, likes: 0, comments: 0, shares: 0,
    });
    console.log(`   📊 Analytics : recorded`);
  } catch (e) { /* analytics optional */ }

  // ── Post-generate: Viral score ──
  try {
    const { predictViralPotential } = await import("./engine/viral-optimizer.js");
    const viral = predictViralPotential(story);
    console.log(`   🔥 Viral     : ${viral.viralScore}/10 — ${viral.verdict}`);
    enrichedMeta.viralScore = viral.viralScore;
    fs.writeFileSync(metaPath, JSON.stringify(enrichedMeta, null, 2));
  } catch (e) { /* viral optional */ }

  // ── Post-generate: SEO metadata ──
  try {
    const seo = await import("./engine/seo-optimizer.js");
    const ytMeta = seo.generateYouTubeMetadata(story, { durationSec: result.durationSec || 300 });
    const seoPath = path.join(path.dirname(result.videoPath), "seo.json");
    fs.writeFileSync(seoPath, JSON.stringify(ytMeta, null, 2));
    console.log(`   🔍 SEO       : ${seoPath}`);
  } catch (e) { /* seo optional */ }

  // ── Post-generate: Repurpose manifest ──
  try {
    const { repurposeAll, exportRepurposed } = await import("./engine/content-repurposer.js");
    const repurposed = repurposeAll(story);
    const repDir = path.join(path.dirname(result.videoPath), "repurposed");
    exportRepurposed(repurposed, repDir);
    console.log(`   ♻️ Repurposed : ${repurposed.totalPieces} pieces → ${repDir}`);
  } catch (e) { /* repurpose optional */ }

  // Si --send-telegram, envoie automatiquement
  if (args["send-telegram"]) {
    console.log(`\n📤 Envoi sur Telegram...`);
    await sendVideoTelegram(result.videoPath, result.metadata);
  }
}

async function cmdPublishTelegram(args) {
  const video = args.video;
  if (!video || !fs.existsSync(video)) {
    console.error(`❌ Fichier vidéo introuvable : ${video}`);
    process.exit(1);
  }
  const metaPath = path.join(path.dirname(video), "metadata.json");
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
  await sendVideoTelegram(video, meta);
}

async function sendVideoTelegram(videoPath, metadata) {
  const tgPath = "/home/user/CMCteams/tools/integrations/telegram/client.js";
  if (!fs.existsSync(tgPath)) {
    console.error(`❌ Client Telegram introuvable : ${tgPath}`);
    return;
  }
  const tg = await import(tgPath);

  const sizeMB = fs.statSync(videoPath).size / 1024 / 1024;
  const caption = [
    `🎬 <b>${escapeHtml(metadata.title || "Vidéo générée")}</b>`,
    `Format: ${metadata.format} · ${metadata.width}x${metadata.height}`,
    `Durée: ${metadata.durationMs ? (metadata.durationMs/1000).toFixed(1)+"s" : "?"}`,
    `Taille: ${sizeMB.toFixed(2)} MB`,
    metadata.tags ? `Tags: ${metadata.tags.join(", ")}` : "",
    "",
    "Réponds <code>OK</code> pour publier ou <code>NO</code> pour annuler.",
  ].filter(Boolean).join("\n");

  if (sizeMB > 50) {
    // Telegram limite à 50MB pour les bots simples
    console.log(`⚠ Vidéo > 50 MB, envoi en document...`);
    await tg.sendDocument(videoPath, caption, { parse_mode: "HTML" });
  } else {
    // Bots peuvent envoyer photos directement, pour vidéos il faut sendVideo
    // On utilise sendDocument pour fiabilité
    await tg.sendDocument(videoPath, caption, { parse_mode: "HTML" });
  }
  console.log(`✅ Envoyé sur Telegram (${sizeMB.toFixed(2)} MB)`);
}

async function cmdGenerateScript(args) {
  const { generateScript, generateBatch, addToLibrary } = await import("./engine/script-generator.js");
  const niche = args.niche || "betrayal-revenge";
  const length = args.length || "medium";
  const count = parseInt(args.count || "1", 10);

  console.log(`\n🤖 Génération de ${count} script(s) via Gemma 4`);
  console.log(`   Niche  : ${niche}`);
  console.log(`   Length : ${length}\n`);

  let scripts;
  if (count === 1) {
    scripts = [await generateScript({ niche, length, topic: args.topic, language: args.language })];
  } else {
    scripts = await generateBatch(count, { niche, length, language: args.language });
  }

  for (const s of scripts) {
    addToLibrary(s);
    console.log(`✅ ${s.id} — "${s.title}" (${s.wordCount} mots)`);
  }

  console.log(`\n📚 ${scripts.length} script(s) ajoutés à content-library.json`);
}

async function cmdExtractShorts(args) {
  const { extractShorts } = await import("./engine/shorts-extractor.js");
  const video = args.video;
  if (!video || !fs.existsSync(video)) {
    console.error(`❌ Vidéo introuvable : ${video}`);
    process.exit(1);
  }
  const count = parseInt(args.count || "3", 10);
  const duration = parseInt(args.duration || "45", 10);

  console.log(`\n✂️ Extraction de ${count} Shorts depuis ${path.basename(video)}`);
  const results = await extractShorts(video, { count, targetDurationSec: duration });

  console.log(`\n✅ ${results.length} Shorts extraits :`);
  for (const r of results) {
    const size = (fs.statSync(r.path).size / 1024 / 1024).toFixed(2);
    console.log(`   ${r.index}. ${path.basename(r.path)} (${size} MB, début: ${r.startSec.toFixed(1)}s)`);
  }
}

async function cmdPublish(args) {
  const platform = args.platform;
  const video = args.video;
  if (!platform || !video) {
    console.error(`❌ Usage : cli.js publish --platform <youtube|facebook|instagram> --video <path>`);
    process.exit(1);
  }
  if (!fs.existsSync(video)) {
    console.error(`❌ Vidéo introuvable : ${video}`);
    process.exit(1);
  }

  // Charge les metadata si dispo
  const metaPath = path.join(path.dirname(video), "metadata.json");
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};

  const title = args.title || meta.title || path.basename(video, path.extname(video));
  const description = args.description || buildDefaultDescription(meta);
  const tags = args.tags ? args.tags.split(",") : (meta.tags || []);
  const privacy = args.privacy || "private";
  const isShort = args.short === true || args.short === "true";

  console.log(`\n📤 Publication sur ${platform.toUpperCase()}`);
  console.log(`   Titre   : ${title}`);
  console.log(`   Privacy : ${privacy}`);
  console.log(`   Vidéo   : ${path.basename(video)} (${(fs.statSync(video).size / 1024 / 1024).toFixed(2)} MB)\n`);

  let result;
  switch (platform) {
    case "youtube": {
      const { uploadVideo } = await import("./publishers/youtube.js");
      result = await uploadVideo(video, {
        title,
        description,
        tags,
        privacyStatus: privacy,
        isShort,
      });
      break;
    }
    case "facebook": {
      const { uploadVideo, createReel } = await import("./publishers/facebook.js");
      if (isShort) {
        result = await createReel(video, { description: title + "\n\n" + description });
      } else {
        result = await uploadVideo(video, { title, description, published: privacy === "public" });
      }
      break;
    }
    case "instagram": {
      const { publishReelFromFile } = await import("./publishers/instagram.js");
      result = await publishReelFromFile(video, { caption: title + "\n\n" + description });
      break;
    }
    default:
      console.error(`❌ Plateforme inconnue : ${platform}. Disponibles : youtube, facebook, instagram`);
      process.exit(1);
  }

  console.log(`\n✅ Publié sur ${platform} : ${JSON.stringify(result, null, 2)}`);

  // Record publish in analytics
  try {
    const { recordMetrics } = await import("./engine/analytics.js");
    recordMetrics(meta.id || path.basename(video, '.mp4'), platform, {
      title: title,
      niche: (meta.tags || [])[0] || "unknown",
      tags: meta.tags || tags,
      publishedAt: new Date().toISOString(),
      views: 0, likes: 0, comments: 0, shares: 0,
    });
    console.log(`📊 Analytics tracked for ${platform}`);
  } catch (e) { /* analytics optional */ }
}

function buildDefaultDescription(meta) {
  const parts = [];
  if (meta.tags && meta.tags.length > 0) {
    parts.push("");
    parts.push(meta.tags.map((t) => "#" + t.replace(/\s+/g, "")).slice(0, 5).join(" "));
  }
  return parts.join("\n");
}

function cmdStatus() {
  console.log("\n📊 Status du système social\n");
  const out = path.join(SOCIAL_ROOT, "output");
  if (!fs.existsSync(out)) {
    console.log("Aucune vidéo générée encore.");
    return;
  }
  const dirs = fs.readdirSync(out).filter((d) => fs.statSync(path.join(out, d)).isDirectory());
  console.log(`Vidéos générées : ${dirs.length}`);
  for (const d of dirs) {
    const meta = path.join(out, d, "metadata.json");
    if (fs.existsSync(meta)) {
      const m = JSON.parse(fs.readFileSync(meta, "utf8"));
      console.log(`  📹 ${m.id}  "${m.title}"  ${m.format}  ${(m.sizeBytes/1024/1024).toFixed(2)}MB`);
    } else {
      console.log(`  📁 ${d}  (pas de metadata)`);
    }
  }
}

/* ---------- New module commands ---------- */

async function cmdThumbnail(args) {
  const { generateThumbnail, generateVariants, generateForAllPlatforms } = await import("./engine/thumbnail-generator.js");
  const title = args.title || "Untitled Video";
  const layout = args.layout || "dramatic";
  const scheme = args.color || args.scheme || "midnight-gold";
  const platform = args.platform || "youtube";

  if (args.variants) {
    console.log(`\n🎨 Generating A/B thumbnail variants for: "${title}"`);
    const results = await generateVariants(title, { colorScheme: scheme, channelName: args.channel });
    console.log(`✅ ${results.length} variants generated:`);
    for (const r of results) console.log(`   ${r.variant} → ${r.path}`);
  } else if (args["all-platforms"]) {
    console.log(`\n🎨 Generating thumbnails for ALL platforms: "${title}"`);
    const results = await generateForAllPlatforms(title, { layout, colorScheme: scheme, channelName: args.channel });
    console.log(`✅ Generated for ${Object.keys(results).length} platforms:`);
    for (const [p, r] of Object.entries(results)) console.log(`   ${p} (${r.width}x${r.height}) → ${r.path}`);
  } else {
    console.log(`\n🎨 Generating ${layout} thumbnail (${scheme}) for: "${title}"`);
    const result = await generateThumbnail(title, { layout, colorScheme: scheme, platform, channelName: args.channel });
    console.log(`✅ ${result.path}`);
  }
}

async function cmdAnalytics(args) {
  const analytics = await import("./engine/analytics.js");
  const action = args.action || "report";

  switch (action) {
    case "report": {
      const period = args.period || "weekly";
      const report = analytics.generateReport(period);
      if (args.format === "csv") { console.log(analytics.exportCsv(report)); }
      else if (args.format === "html") {
        const htmlPath = path.join(SOCIAL_ROOT, "output", `report_${Date.now()}.html`);
        fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
        fs.writeFileSync(htmlPath, analytics.exportHtml(report));
        console.log(`✅ HTML report: ${htmlPath}`);
      } else { console.log(analytics.exportMarkdown(report)); }
      break;
    }
    case "top": {
      const n = parseInt(args.count || "10", 10);
      const metric = args.metric || "views";
      const top = analytics.getTopVideos(n, metric);
      console.log(`\n🏆 Top ${n} by ${metric}:`);
      top.forEach((v, i) => console.log(`  ${i+1}. ${v.title || v.videoId} — ${v.latest?.[metric] || 0} ${metric}`));
      break;
    }
    case "recommend": {
      const recs = analytics.getRecommendations();
      console.log(`\n💡 Recommendations:`);
      recs.forEach(r => console.log(`  [${r.priority.toUpperCase()}] ${r.message}`));
      break;
    }
    default:
      console.error(`❌ Unknown analytics action: ${action}. Use: report, top, recommend`);
  }
}

async function cmdExperiment(args) {
  const ab = await import("./engine/ab-testing.js");
  const action = args.action || "list";

  switch (action) {
    case "create": {
      const name = args.name || "Title Test";
      const variants = (args.variants || "A,B").split(",").map(v => v.trim());
      const exp = ab.createExperiment(name, variants, { type: args.type || "title" });
      console.log(`✅ Experiment created: ${exp.id} — "${exp.name}" (${exp.variants.length} variants)`);
      break;
    }
    case "list": {
      const exps = ab.listExperiments(args.status || null);
      console.log(`\n🧪 Experiments (${exps.length}):`);
      exps.forEach(e => console.log(`  ${e.status === "active" ? "🔬" : "✅"} ${e.id} — ${e.name} (${e.status})`));
      break;
    }
    case "analyze": {
      if (!args.id) { console.error("❌ --id required"); process.exit(1); }
      const report = ab.generateExperimentReport(args.id);
      console.log(report);
      break;
    }
    default:
      console.error(`❌ Unknown experiment action: ${action}. Use: create, list, analyze`);
  }
}

async function cmdSchedule(args) {
  const sched = await import("./scheduler/scheduler.js");
  const action = args.action || "next";

  switch (action) {
    case "create": {
      const config = {
        name: args.name || "Daily Upload",
        platforms: (args.platforms || "youtube").split(","),
        frequency: args.frequency || "daily",
        niche: args.niche || "auto",
        template: args.template || "narrative-storytelling",
      };
      const s = sched.createSchedule(config);
      console.log(`✅ Schedule created: ${s.id} — ${s.name} (${s.platforms.join(",")})`);
      break;
    }
    case "list": {
      const schedules = sched.listSchedules();
      console.log(`\n📅 Schedules (${schedules.length}):`);
      schedules.forEach(s => console.log(`  ${s.active ? "🟢" : "⚪"} ${s.id} — ${s.name} [${s.platforms.join(",")}]`));
      break;
    }
    case "calendar": {
      const days = parseInt(args.days || "14", 10);
      const cal = sched.generateCalendar(days);
      console.log(sched.exportCalendarMarkdown(cal));
      break;
    }
    case "next": {
      const n = parseInt(args.count || "10", 10);
      const runs = sched.getNextRuns(n);
      console.log(`\n📅 Next ${runs.length} runs:`);
      runs.forEach(r => console.log(`  ${r.time.slice(0,16)} | ${r.platform} | ${r.niche}`));
      break;
    }
    case "queue": {
      const q = sched.getQueue(args.status || null);
      console.log(`\n📦 Queue (${q.length} jobs):`);
      q.slice(0, 20).forEach(j => console.log(`  ${j.status === "completed" ? "✅" : j.status === "failed" ? "❌" : "⏳"} ${j.id} — ${j.platform} ${j.niche} (${j.status})`));
      break;
    }
    default:
      console.error(`❌ Unknown schedule action: ${action}. Use: create, list, calendar, next, queue`);
  }
}

async function cmdBrand(args) {
  const branding = await import("./engine/branding.js");
  const action = args.action || "list";

  switch (action) {
    case "list": {
      const kits = branding.listBrandKits();
      const schemes = branding.listSchemes();
      console.log(`\n🎨 Brand kits: ${kits.join(", ")}`);
      console.log(`🎨 Color schemes: ${schemes.join(", ")}`);
      break;
    }
    case "create": {
      const name = args.name || "custom";
      const kit = branding.saveBrandKit(name, {
        channelName: args.channel || "KDMC Stories",
        tagline: args.tagline || "Stories that stick with you",
      });
      console.log(`✅ Brand kit saved: "${name}"`);
      break;
    }
    case "intro": {
      const kit = branding.loadBrandKit(args.kit || "default");
      console.log(`🎬 Generating intro frames...`);
      const frames = branding.generateIntroFrames(kit, args.title || "");
      console.log(`✅ ${frames.length} intro frames generated`);
      break;
    }
    default:
      console.error(`❌ Unknown brand action: ${action}. Use: list, create, intro`);
  }
}

async function cmdTranslate(args) {
  const ml = await import("./engine/multi-lang.js");
  if (args.list) {
    console.log(`\n🌍 Supported languages:`);
    ml.listLanguages().forEach(l => console.log(`  ${l.code} — ${l.name}${l.rtl ? " (RTL)" : ""}${l.cjk ? " (CJK)" : ""}`));
    return;
  }
  const text = args.text;
  const toLang = args.to || "fr";
  if (!text) { console.error("❌ --text required"); process.exit(1); }
  console.log(`\n🌍 Translating to ${toLang}...`);
  const result = await ml.translateScript(text, "en", toLang);
  console.log(`\n${result}`);
}

async function cmdViral(args) {
  const viral = await import("./engine/viral-optimizer.js");
  const action = args.action || "score";

  if (action === "score" && args.story) {
    const lib = JSON.parse(fs.readFileSync(path.join(SOCIAL_ROOT, "config", "content-library.json"), "utf8"));
    let story = null;
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith("_")) continue;
      const found = (stories || []).find(s => s.id === args.story);
      if (found) { story = { ...found, category: cat }; break; }
    }
    if (!story) { console.error(`❌ Story "${args.story}" not found`); process.exit(1); }
    const result = viral.predictViralPotential(story);
    console.log(`\n🔥 Viral Analysis: "${story.title}"`);
    console.log(`   Viral Score : ${result.viralScore}/10 — ${result.verdict}`);
    console.log(`   Title Score : ${result.title.total}/10`);
    console.log(`   Hook Score  : ${result.hook.score}/10`);
    console.log(`   Script Score: ${result.script.viralScore}/10`);
    if (result.recommendations.length > 0) {
      console.log(`\n   💡 Recommendations:`);
      result.recommendations.forEach(r => console.log(`      → ${r}`));
    }
  } else if (action === "title") {
    const title = args.title || args.text;
    if (!title) { console.error("❌ --title required"); process.exit(1); }
    const result = viral.optimizeTitle(title);
    console.log(`\n🔥 Title Optimization: "${title}"`);
    console.log(`   Current Score: ${result.original.score}/10`);
    console.log(`   Best Variant : "${result.best.title}" (${result.best.total}/10)`);
    if (result.alternatives.length > 0) {
      console.log(`\n   Alternatives:`);
      result.alternatives.forEach(a => console.log(`      ${a.total}/10 — "${a.title}"`));
    }
  } else if (action === "hooks") {
    const topic = args.topic || "trust";
    const hooks = viral.generateHookVariants(topic, 5);
    console.log(`\n🪝 Hook Variants for "${topic}":`);
    hooks.forEach(h => console.log(`   ${h.variant}. ${h.hook}`));
  } else {
    console.error(`❌ Unknown viral action: ${action}. Use: score --story <id>, title --title "...", hooks --topic "..."`);
  }
}

async function cmdRepurpose(args) {
  const repurposer = await import("./engine/content-repurposer.js");
  const storyId = args.story;
  if (!storyId) { console.error("❌ --story <id> required"); process.exit(1); }
  const lib = JSON.parse(fs.readFileSync(path.join(SOCIAL_ROOT, "config", "content-library.json"), "utf8"));
  let story = null;
  for (const [cat, stories] of Object.entries(lib)) {
    if (cat.startsWith("_")) continue;
    const found = (stories || []).find(s => s.id === storyId);
    if (found) { story = found; break; }
  }
  if (!story) { console.error(`❌ Story "${storyId}" not found`); process.exit(1); }
  console.log(`\n♻️ Repurposing: "${story.title}"`);
  const result = repurposer.repurposeAll(story);
  console.log(`   Generated ${result.totalPieces} content pieces:\n`);
  console.log(`   📱 ${result.generated.shortClips.length} short clips`);
  console.log(`   💬 ${result.generated.quoteCards.length} quote cards`);
  console.log(`   🐦 Twitter thread (${result.generated.twitterThread.length} tweets)`);
  console.log(`   📸 Instagram carousel (${result.generated.instagramCarousel.length} slides)`);
  console.log(`   💼 LinkedIn post (${result.generated.linkedInPost.chars} chars)`);
  console.log(`   📝 Blog post (${result.generated.blogPost.words} words)`);
  console.log(`   📧 Newsletter`);
  console.log(`   🎙 Podcast notes`);
  if (args.export) {
    const outDir = path.join(SOCIAL_ROOT, "output", `repurposed_${storyId}`);
    repurposer.exportRepurposed(result, outDir);
    console.log(`\n   📁 Exported to: ${outDir}`);
  }
}

async function cmdSeo(args) {
  const seo = await import("./engine/seo-optimizer.js");
  const storyId = args.story;
  if (!storyId) { console.error("❌ --story <id> required"); process.exit(1); }
  const lib = JSON.parse(fs.readFileSync(path.join(SOCIAL_ROOT, "config", "content-library.json"), "utf8"));
  let story = null;
  for (const [cat, stories] of Object.entries(lib)) {
    if (cat.startsWith("_")) continue;
    const found = (stories || []).find(s => s.id === storyId);
    if (found) { story = { ...found, category: cat.replace("narrative_", "") }; break; }
  }
  if (!story) { console.error(`❌ Story "${storyId}" not found`); process.exit(1); }
  const duration = parseInt(args.duration || "300", 10);
  const all = seo.generateAllPlatformMeta(story, { durationSec: duration });
  console.log(`\n🔍 SEO Metadata: "${story.title}"\n`);
  console.log(`=== YouTube ===`);
  console.log(`Title: ${all.youtube.title}`);
  console.log(`Tags: ${all.youtube.tags.slice(0, 10).join(", ")}`);
  console.log(`Chapters: ${all.youtube.chapters.length}`);
  console.log(`\n=== TikTok ===`);
  console.log(`Caption: ${all.tiktok.caption.slice(0, 100)}...`);
  console.log(`\n=== Instagram ===`);
  console.log(`Hashtags: ${all.instagram.hashtags.length}`);
  console.log(`Caption length: ${all.instagram.caption.length} chars`);
}

function cmdHelp() {
  console.log(`
🎬 CMCteams Social — Pipeline vidéo automatisé expert+++

USAGE :
  node tools/social/cli.js <command> [options]

CORE COMMANDS :
  list-stories                    Liste les histoires de la bibliothèque
  list-voices                     Liste les voix TTS disponibles
  test-tts --text "..." --voice X Test rapide du TTS

  generate                        Génère une vidéo
    --type narrative              Type de contenu (défaut: narrative)
    --template <name>             Template: narrative-storytelling|documentary|listicle|breaking-news|tutorial
    --story <id>                  ID spécifique (défaut: première non utilisée)
    --random                      Sélection aléatoire
    --ai-script                   Génère un script via Gemma 4 avant la vidéo
    --niche <niche>               Niche pour AI script
    --format long|short           Format (défaut: long, 16:9)
    --music <path>                Musique de fond MP3
    --bg <path>                   Image de fond
    --send-telegram               Envoie sur Telegram après génération
    --keep                        Garde les frames PNG

  generate-script                 Génère script(s) via Gemma 4
    --niche <niche>               betrayal-revenge | mystery | finance-lesson | motivation | true-crime
    --count <n>                   Nombre de scripts (défaut 1)
    --language en|fr              Langue (défaut en)

  extract-shorts --video <path>   Extrait N Shorts 9:16
    --count <n>                   Nombre de Shorts (défaut 3)
    --duration <sec>              Durée par Short (défaut 45)

  publish --platform <p> --video <path>  Publie sur une plateforme
    --platform youtube|facebook|instagram
    --privacy private|unlisted|public

  publish-telegram --video <path> Envoie sur Telegram
  status                          Liste les vidéos générées

ADVANCED COMMANDS :
  thumbnail                       Génère des thumbnails IA
    --title "..."                 Titre de la vidéo
    --layout dramatic|split|numbered|versus|question|minimal
    --color midnight-gold|blood-red|neon-pink|ocean-blue|...
    --platform youtube|instagram|tiktok|twitter|facebook
    --variants                    Génère A/B variants
    --all-platforms               Génère pour toutes les plateformes
    --channel "..."               Nom de chaîne (watermark)

  analytics                       Dashboard analytics + revenue
    --action report|top|recommend
    --period daily|weekly|monthly
    --format markdown|csv|html
    --count <n>                   Top N vidéos (pour action=top)

  experiment                      A/B testing framework
    --action create|list|analyze
    --name "..."                  Nom de l'expérience
    --variants "A,B,C"            Variantes (comma-separated)
    --id <exp_id>                 ID expérience (pour analyze)

  schedule                        Scheduler automatique
    --action create|list|calendar|next|queue
    --platforms youtube,tiktok    Plateformes (comma-separated)
    --niche auto|betrayal|...     Niche (auto = rotation)
    --days <n>                    Jours de calendrier (défaut 14)

  brand                           Branding & watermark
    --action list|create|intro
    --name "..."                  Nom du brand kit
    --channel "..."               Nom de chaîne

  translate                       Traduction multi-langue
    --text "..."                  Texte à traduire
    --to fr|es|it|de|pt|ar|ja|hi  Langue cible
    --list                        Liste les langues supportées

FUTURISTIC COMMANDS :
  viral                           Prédiction virale + optimisation
    --action score --story <id>   Analyse virale complète d'une story
    --action title --title "..."  Optimise un titre (score + variantes)
    --action hooks --topic "..."  Génère 5 variantes de hooks

  repurpose --story <id>          Transforme 1 vidéo en 10+ contenus
    --export                      Exporte les fichiers (Twitter, LinkedIn, blog...)

  seo --story <id>                Génère métadonnées SEO multi-plateformes
    --duration <sec>              Durée vidéo (pour chapitres YouTube)

EXEMPLES :
  node cli.js generate --random --format short
  node cli.js thumbnail --title "He Lost Everything" --variants
  node cli.js analytics --action report --format html
  node cli.js schedule --action calendar --days 30
  node cli.js experiment --action create --name "Title Test" --variants "VersionA,VersionB"
  node cli.js translate --text "Hello world" --to fr
  node cli.js brand --action list
  node cli.js viral --action score --story betrayal-001
  node cli.js repurpose --story betrayal-001 --export
  node cli.js seo --story betrayal-001
`);
}

/* ---------- Helpers ---------- */

function findFirstMusic() {
  const musicDir = path.join(SOCIAL_ROOT, "assets", "music");
  if (!fs.existsSync(musicDir)) return null;
  const files = fs.readdirSync(musicDir).filter((f) => /\.(mp3|m4a|wav)$/i.test(f));
  return files.length > 0 ? path.join(musicDir, files[0]) : null;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------- Main ---------- */

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._cmd;

  try {
    switch (cmd) {
      case "list-stories":      await cmdListStories(); break;
      case "list-voices":       await cmdListVoices(); break;
      case "test-tts":          await cmdTestTts(args); break;
      case "generate":          await cmdGenerate(args); break;
      case "generate-script":   await cmdGenerateScript(args); break;
      case "extract-shorts":    await cmdExtractShorts(args); break;
      case "publish":           await cmdPublish(args); break;
      case "publish-telegram":  await cmdPublishTelegram(args); break;
      case "thumbnail":         await cmdThumbnail(args); break;
      case "analytics":         await cmdAnalytics(args); break;
      case "experiment":        await cmdExperiment(args); break;
      case "schedule":          await cmdSchedule(args); break;
      case "brand":             await cmdBrand(args); break;
      case "translate":         await cmdTranslate(args); break;
      case "viral":             await cmdViral(args); break;
      case "repurpose":         await cmdRepurpose(args); break;
      case "seo":               await cmdSeo(args); break;
      case "status":            cmdStatus(); break;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        cmdHelp();
        break;
      default:
        console.error(`❌ Commande inconnue : ${cmd}`);
        cmdHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Erreur : ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
