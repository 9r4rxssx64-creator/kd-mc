/**
 * Multi-Language Support — Translation, voice localization, subtitle adaptation
 * 9 languages with TTS voice mapping, RTL support, cultural adaptation
 */
import fs from 'fs';
import path from 'path';

const LANGUAGES = {
  en: { name: 'English', code: 'en', ttsVoice: 'en-US-GuyNeural', ttsVoiceFemale: 'en-US-JennyNeural',
    subtitleFont: 'Inter', wordsPerLine: 5, rtl: false, rateAdjust: 0, pitchAdjust: 0 },
  fr: { name: 'Français', code: 'fr', ttsVoice: 'fr-FR-HenriNeural', ttsVoiceFemale: 'fr-FR-DeniseNeural',
    subtitleFont: 'Inter', wordsPerLine: 4, rtl: false, rateAdjust: -5, pitchAdjust: 0 },
  es: { name: 'Español', code: 'es', ttsVoice: 'es-ES-AlvaroNeural', ttsVoiceFemale: 'es-ES-ElviraNeural',
    subtitleFont: 'Inter', wordsPerLine: 4, rtl: false, rateAdjust: 5, pitchAdjust: 0 },
  it: { name: 'Italiano', code: 'it', ttsVoice: 'it-IT-DiegoNeural', ttsVoiceFemale: 'it-IT-ElsaNeural',
    subtitleFont: 'Inter', wordsPerLine: 4, rtl: false, rateAdjust: 0, pitchAdjust: 2 },
  de: { name: 'Deutsch', code: 'de', ttsVoice: 'de-DE-ConradNeural', ttsVoiceFemale: 'de-DE-KatjaNeural',
    subtitleFont: 'Inter', wordsPerLine: 3, rtl: false, rateAdjust: -3, pitchAdjust: -2 },
  pt: { name: 'Português', code: 'pt', ttsVoice: 'pt-BR-AntonioNeural', ttsVoiceFemale: 'pt-BR-FranciscaNeural',
    subtitleFont: 'Inter', wordsPerLine: 4, rtl: false, rateAdjust: 3, pitchAdjust: 0 },
  ar: { name: 'العربية', code: 'ar', ttsVoice: 'ar-SA-HamedNeural', ttsVoiceFemale: 'ar-SA-ZariyahNeural',
    subtitleFont: 'Noto Sans Arabic', wordsPerLine: 4, rtl: true, rateAdjust: -5, pitchAdjust: 0 },
  ja: { name: '日本語', code: 'ja', ttsVoice: 'ja-JP-KeitaNeural', ttsVoiceFemale: 'ja-JP-NanamiNeural',
    subtitleFont: 'Noto Sans JP', wordsPerLine: 8, rtl: false, rateAdjust: 5, pitchAdjust: 0, cjk: true },
  hi: { name: 'हिन्दी', code: 'hi', ttsVoice: 'hi-IN-MadhurNeural', ttsVoiceFemale: 'hi-IN-SwaraNeural',
    subtitleFont: 'Noto Sans Devanagari', wordsPerLine: 4, rtl: false, rateAdjust: 0, pitchAdjust: 0 },
};

const VOICE_STYLES = {
  storytelling: { rate: -10, pitch: -5, volume: 0 },
  documentary:  { rate: -15, pitch: -8, volume: 0 },
  news:         { rate: 5,   pitch: 0,  volume: 5 },
  calm:         { rate: -20, pitch: -3, volume: -5 },
  dramatic:     { rate: -5,  pitch: -10, volume: 5 },
  energetic:    { rate: 10,  pitch: 5,  volume: 5 },
};

export function getLanguageConfig(langCode) {
  return LANGUAGES[langCode] || LANGUAGES.en;
}

export function listLanguages() {
  return Object.entries(LANGUAGES).map(([code, cfg]) => ({
    code, name: cfg.name, rtl: cfg.rtl, cjk: cfg.cjk || false,
  }));
}

export function getBestVoice(langCode, style = 'storytelling', gender = 'male') {
  const lang = LANGUAGES[langCode] || LANGUAGES.en;
  const voice = gender === 'female' ? lang.ttsVoiceFemale : lang.ttsVoice;
  const styleConfig = VOICE_STYLES[style] || VOICE_STYLES.storytelling;
  return {
    voice,
    rate: styleConfig.rate + lang.rateAdjust,
    pitch: styleConfig.pitch + lang.pitchAdjust,
    volume: styleConfig.volume,
    language: lang.code,
  };
}

export function getSubtitleConfig(langCode) {
  const lang = LANGUAGES[langCode] || LANGUAGES.en;
  return {
    font: lang.subtitleFont,
    wordsPerLine: lang.wordsPerLine,
    rtl: lang.rtl,
    cjk: lang.cjk || false,
    fontSize: lang.cjk ? 38 : lang.rtl ? 36 : 42,
    lineHeight: lang.cjk ? 1.6 : 1.4,
    maxCharsPerLine: lang.cjk ? 20 : lang.rtl ? 35 : 40,
    textAlign: lang.rtl ? 'right' : 'center',
    direction: lang.rtl ? 'rtl' : 'ltr',
  };
}

export async function translateScript(script, fromLang, toLang, opts = {}) {
  const apiKey = opts.apiKey || process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_KEY required for translation');
  const targetLang = LANGUAGES[toLang];
  if (!targetLang) throw new Error(`Unsupported language: ${toLang}`);
  const prompt = `Translate this narration script from ${LANGUAGES[fromLang]?.name || fromLang} to ${targetLang.name}.
Keep the storytelling tone, emotional impact, and pacing. Adapt cultural references naturally.
Do NOT add any prefix, explanation, or notes — output ONLY the translated text.

Script:
${script}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty translation response');
  return text.trim();
}

export async function adaptScript(script, targetLang, opts = {}) {
  const apiKey = opts.apiKey || process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_KEY required');
  const targetConfig = LANGUAGES[targetLang];
  if (!targetConfig) throw new Error(`Unsupported language: ${targetLang}`);
  const prompt = `Culturally adapt this English narration script for a ${targetConfig.name}-speaking audience.
Don't just translate — adapt references, names, currency amounts, and idioms to feel native.
Keep the same story structure, emotional beats, and hook.
Output ONLY the adapted script in ${targetConfig.name}.

Script:
${script}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
  const data = await resp.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

export async function generateMultiLang(story, languages, pipelineFn, opts = {}) {
  const results = {};
  for (const lang of languages) {
    const langConfig = LANGUAGES[lang];
    if (!langConfig) { results[lang] = { error: `Unsupported: ${lang}` }; continue; }
    try {
      let script = story.script;
      if (lang !== 'en') {
        script = opts.adapt
          ? await adaptScript(story.script, lang, opts)
          : await translateScript(story.script, 'en', lang, opts);
      }
      const voiceConfig = getBestVoice(lang, opts.style || 'storytelling', opts.gender);
      const subConfig = getSubtitleConfig(lang);
      const result = await pipelineFn({
        ...story,
        script,
        language: lang,
        voice: voiceConfig.voice,
        rate: voiceConfig.rate,
        pitch: voiceConfig.pitch,
        subtitleConfig: subConfig,
      }, opts);
      results[lang] = { success: true, ...result };
      if (languages.length > 1) await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      results[lang] = { error: err.message };
    }
  }
  return results;
}

export function detectLanguage(text) {
  const sample = text.slice(0, 500);
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(sample)) return 'ja';
  if (/[\u0600-\u06FF]/.test(sample)) return 'ar';
  if (/[\u0900-\u097F]/.test(sample)) return 'hi';
  if (/[àâäéèêëîïôöùûüçœæ]/i.test(sample) && /\b(le|la|les|de|du|des|et|est|un|une)\b/i.test(sample)) return 'fr';
  if (/[áéíóúñ¿¡]/i.test(sample) && /\b(el|la|los|las|de|del|en|es|un|una|por|que)\b/i.test(sample)) return 'es';
  if (/[àèéìòù]/i.test(sample) && /\b(il|la|le|di|del|che|è|un|una|per)\b/i.test(sample)) return 'it';
  if (/[äöüß]/i.test(sample) && /\b(der|die|das|und|ist|ein|eine|von|zu|den)\b/i.test(sample)) return 'de';
  if (/[ãõàáâéêíóôúç]/i.test(sample) && /\b(o|a|os|as|de|do|da|em|um|uma|que|por)\b/i.test(sample)) return 'pt';
  return 'en';
}

export { LANGUAGES, VOICE_STYLES };
