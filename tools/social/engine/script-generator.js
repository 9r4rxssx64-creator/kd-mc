/**
 * script-generator.js — Génération de scripts via Gemma 4 (Google AI Studio)
 *
 * Utilise l'API Gemini gratuite pour générer des scripts uniques qui
 * évitent la démonétisation YouTube "contenu IA générique".
 *
 * Variables d'env :
 *   GOOGLE_AI_API_KEY  — clé obtenue sur https://aistudio.google.com/apikey
 *
 * Usage :
 *   import { generateScript } from "./engine/script-generator.js";
 *   const story = await generateScript({ niche: "betrayal-revenge", length: "medium" });
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOCIAL_ROOT = path.resolve(__dirname, "..");

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemma-4-26b-a4b-it";

/* ---------- Prompt templates par niche ---------- */

const SYSTEM_PROMPTS = {
  "betrayal-revenge": `You are a professional YouTube faceless-channel scriptwriter specialized in betrayal and revenge stories (RPM $12.82, highest in 2026).

Your scripts are known for:
- Cold open: first sentence grabs attention without "imagine" or "picture this"
- Concrete details: real ages, specific amounts ($50,000 not "a lot"), real locations
- Escalating tension with pacing shifts (short punchy sentences mixed with longer build-ups)
- Moral payoff or twist at the end that creates "wait WHAT" moments
- NO clichés: no "little did they know", "in a turn of events", "unbeknownst to him"
- NO AI words: no "delve", "tapestry", "mosaic", "journey", "unleash", "elevate"
- First OR third person (pick one per story, don't switch)
- Tone: dramatic, specific, felt-like-real-life

Never start with "Meet X" or "This is the story of". Start IN the moment.`,

  "mystery": `You are a YouTube mystery narrator writing hooks that keep viewers until the end.

Rules:
- Open with an unanswered question or impossible scenario
- Seed 3-4 clues throughout the story
- Let the viewer theorize before the reveal
- Ending: twist that recontextualizes earlier details
- No supernatural unless specified (prefer human mysteries)
- NO AI clichés or vague attributions`,

  "finance-lesson": `You are a finance content creator making 2-min scripts that teach via story.

Rules:
- Open with a counterintuitive claim or specific loss
- Use one person's concrete example (age, amount, timeframe)
- The lesson must be actionable in one sentence
- No generic advice ("save more", "invest early")
- NO em-dashes, NO "delve", NO "it's worth noting"`,

  "motivation": `You are a motivation content creator. Write scripts that hit without being cheesy.

Rules:
- Ground the message in a specific person's situation
- The lesson is implied, not stated directly
- NO generic phrases ("you can do it", "believe in yourself")
- NO rule-of-three lists`,

  "true-crime": `You are a true crime narrator writing 3-5 min scripts based on fictional but realistic scenarios.

Rules:
- Cold open with a specific moment (not "on a quiet evening in...")
- Build tension via small details that feel real
- Don't glorify the perpetrator
- NO graphic violence descriptions (advertiser-friendly)
- End with aftermath or question, not resolution`,
};

const LENGTH_TARGETS = {
  short: { words: "120-180", secondsEstimate: "35-50s" },
  medium: { words: "250-350", secondsEstimate: "90-120s" },
  long: { words: "800-1200", secondsEstimate: "4-6 min" },
  longform: { words: "1500-2500", secondsEstimate: "8-15 min" },
};

/* ---------- Main API ---------- */

/**
 * Génère un script via Gemma 4.
 *
 * @param {object} opts
 * @param {string} opts.niche      "betrayal-revenge" | "mystery" | "finance-lesson" | "motivation" | "true-crime"
 * @param {string} opts.length     "short" | "medium" | "long" | "longform"
 * @param {string} opts.topic      (optionnel) Topic spécifique, sinon Gemma invente
 * @param {string} opts.language   "en" | "fr" (défaut "en")
 * @param {string} opts.model      (optionnel, défaut "gemma-4-26b-a4b-it")
 * @param {number} opts.temperature (défaut 0.9)
 * @returns {Promise<{id, title, script, tags, wordCount, niche, language, model, generatedAt}>}
 */
export async function generateScript(opts = {}) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_AI_API_KEY not set.\n" +
      "1. Get key: https://aistudio.google.com/apikey\n" +
      "2. Save: echo 'export GOOGLE_AI_API_KEY=\"...\"' >> ~/.claude/secrets/cmcteams.env\n" +
      "3. Source: source ~/.claude/secrets/cmcteams.env"
    );
  }

  const niche = opts.niche || "betrayal-revenge";
  const length = opts.length || "medium";
  const language = opts.language || "en";
  const model = opts.model || DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.9;

  const systemPrompt = SYSTEM_PROMPTS[niche];
  if (!systemPrompt) {
    throw new Error(`Niche inconnue: ${niche}. Disponibles: ${Object.keys(SYSTEM_PROMPTS).join(", ")}`);
  }

  const lengthInfo = LENGTH_TARGETS[length] || LENGTH_TARGETS.medium;

  const userPrompt = buildUserPrompt({ niche, length: lengthInfo, topic: opts.topic, language });

  // Gemini API call
  const url = `${GEMINI_API}/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPrompt + "\n\n" + userPrompt }
        ],
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: length === "longform" ? 4000 : (length === "long" ? 2000 : 800),
      topP: 0.95,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemma API ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemma n'a pas retourné de texte. Réponse: " + JSON.stringify(data).substring(0, 300));
  }

  // Parse le format attendu : "TITLE: ... | TAGS: ... | SCRIPT: ..."
  const parsed = parseGeneratedScript(text);

  const id = `${niche}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  return {
    id,
    title: parsed.title,
    script: parsed.script,
    tags: parsed.tags,
    niche,
    language,
    length,
    wordCount: parsed.script.split(/\s+/).length,
    model,
    generatedAt: new Date().toISOString(),
    used: false,
  };
}

/**
 * Génère N scripts et les ajoute à la content library.
 */
export async function generateBatch(count, opts = {}) {
  const scripts = [];
  for (let i = 0; i < count; i++) {
    try {
      console.log(`[script-gen] ${i + 1}/${count} — niche=${opts.niche || "betrayal-revenge"}`);
      const script = await generateScript(opts);
      scripts.push(script);
      // Rate limit : 60 RPM gratuit, donc 1s entre chaque
      if (i < count - 1) await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      console.error(`[script-gen] Échec ${i + 1}: ${err.message}`);
    }
  }
  return scripts;
}

/**
 * Ajoute un script généré à la content-library.json.
 */
export function addToLibrary(script) {
  const libPath = path.join(SOCIAL_ROOT, "config", "content-library.json");
  const lib = JSON.parse(fs.readFileSync(libPath, "utf8"));

  // Déterminer la catégorie depuis la niche
  const categoryMap = {
    "betrayal-revenge": script.niche.includes("betrayal") ? "narrative_betrayal" : "narrative_revenge",
    "mystery": "narrative_mystery",
    "finance-lesson": "narrative_finance",
    "motivation": "narrative_motivation",
    "true-crime": "narrative_true_crime",
  };
  const category = categoryMap[script.niche] || "narrative_custom";

  lib[category] = lib[category] || [];
  lib[category].push({
    id: script.id,
    lang: script.language,
    title: script.title,
    tags: script.tags,
    script: script.script,
    used: false,
    generatedBy: script.model,
    generatedAt: script.generatedAt,
  });

  fs.writeFileSync(libPath, JSON.stringify(lib, null, 2));
  return { category, total: lib[category].length };
}

/* ---------- Helpers ---------- */

function buildUserPrompt({ niche, length, topic, language }) {
  const topicPart = topic
    ? `Topic: "${topic}"`
    : `Topic: invent a compelling, original scenario (not one I could have heard before).`;

  const langPart = language === "fr" ? "Write in French." : "Write in English.";

  return `Generate ONE YouTube video script.

${topicPart}
Target length: ${length.words} words (~${length.secondsEstimate} of narration)
${langPart}

Output format (STRICT, parseable):

TITLE: [compelling title, max 60 characters, no clickbait punctuation]

TAGS: [5-8 comma-separated tags, lowercase, no hashtags]

SCRIPT:
[The full narration script here. No stage directions like "[pause]" or "[dramatic music]".
Just the words the narrator will say.]

Generate now:`;
}

function parseGeneratedScript(text) {
  // Extract TITLE
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/);
  const title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : "Untitled";

  // Extract TAGS
  const tagsMatch = text.match(/TAGS:\s*(.+?)(?:\n|$)/);
  const tags = tagsMatch
    ? tagsMatch[1].trim().split(/,\s*/).map((t) => t.replace(/^#/, "").toLowerCase()).slice(0, 8)
    : [];

  // Extract SCRIPT (everything after "SCRIPT:" and before any trailing marker)
  const scriptMatch = text.match(/SCRIPT:\s*([\s\S]+?)(?:\n\n---|\n\nEND|\n\[END\]|$)/);
  let script = scriptMatch ? scriptMatch[1].trim() : text.trim();

  // Clean common artifacts
  script = script
    .replace(/^\[.*?\]\s*/gm, "")         // [stage directions]
    .replace(/^\*.*?\*\s*/gm, "")         // *actions*
    .replace(/—/g, ".")                   // em dashes to periods (humanizer rule)
    .replace(/\s+/g, " ")                 // normalize whitespace
    .replace(/\s*\.\s*\./g, ".")          // ". ." → "."
    .trim();

  return { title, tags, script };
}

export default { generateScript, generateBatch, addToLibrary, SYSTEM_PROMPTS, LENGTH_TARGETS };
