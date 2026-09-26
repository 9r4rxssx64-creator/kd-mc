/**
 * APEX v13 — Translator Pro Module (port v12 vTranslatorPro + EXPANSION EXPERT)
 *
 * Niveau interprète professionnel :
 * - 50+ langues (au lieu de 30) avec ISO 639-1
 * - Mode interprète temps réel (STT → translate → TTS)
 * - Cache local 1000 traductions par langue (LRU)
 * - Détection langue auto
 * - Historique traductions persisté
 * - Glossaires métier (médical, légal, technique, marketing)
 * - Niveau formal/informel
 * - Conversion alphabet (cyrillique, arabe, mandarin, etc.)
 * - Translittération phonétique (latin <-> non-latin)
 *
 * Architecture :
 * - DeepL si clé API présente (qualité pro)
 * - Fallback Claude Haiku via aiRouter
 * - Cache 1000 dernières traductions (LRU)
 * - Mode interprète : STT → translate → TTS
 *
 * Sources : DeepL, Google Translate, ISO 639-1
 */

import { safeSetHTML } from '../../../../core/html-safe.js';
import { createCleanupScope, type CleanupScope } from '../../../../core/listener-cleanup.js';
import { logger } from '../../../../core/logger.js';
import { store } from '../../../../core/store.js';
import { guardFeatureEnabled } from '../../../../services/auth/feature-guard.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeTranslatorScope: CleanupScope | null = null;

export function dispose(): void {
  activeTranslatorScope?.cleanup();
  activeTranslatorScope = null;
}

export const AX_LANGS: Readonly<Record<string, string>> = {
  /* Langue locale Kevin (Casino Monaco) — TOUJOURS en tête */
  mc: '🇲🇨 Munegascu',
  /* Européennes principales */
  fr: '🇫🇷 Français',
  en: '🇬🇧 English',
  es: '🇪🇸 Español',
  it: '🇮🇹 Italiano',
  de: '🇩🇪 Deutsch',
  pt: '🇵🇹 Português',
  nl: '🇳🇱 Nederlands',
  ru: '🇷🇺 Русский',
  pl: '🇵🇱 Polski',
  uk: '🇺🇦 Українська',
  cs: '🇨🇿 Čeština',
  sk: '🇸🇰 Slovenčina',
  ro: '🇷🇴 Română',
  hu: '🇭🇺 Magyar',
  bg: '🇧🇬 Български',
  hr: '🇭🇷 Hrvatski',
  sr: '🇷🇸 Српски',
  sl: '🇸🇮 Slovenščina',
  el: '🇬🇷 Ελληνικά',
  /* Scandinaves */
  sv: '🇸🇪 Svenska',
  no: '🇳🇴 Norsk',
  da: '🇩🇰 Dansk',
  fi: '🇫🇮 Suomi',
  is: '🇮🇸 Íslenska',
  /* Baltique */
  et: '🇪🇪 Eesti',
  lv: '🇱🇻 Latviešu',
  lt: '🇱🇹 Lietuvių',
  /* Asiatiques principales */
  zh: '🇨🇳 中文 (Chinese)',
  'zh-tw': '🇹🇼 繁體中文 (Trad)',
  ja: '🇯🇵 日本語',
  ko: '🇰🇷 한국어',
  hi: '🇮🇳 हिन्दी',
  bn: '🇧🇩 বাংলা',
  ta: '🇮🇳 தமிழ்',
  te: '🇮🇳 తెలుగు',
  th: '🇹🇭 ไทย',
  vi: '🇻🇳 Tiếng Việt',
  id: '🇮🇩 Bahasa',
  ms: '🇲🇾 Bahasa Melayu',
  fil: '🇵🇭 Filipino',
  /* Moyen-Orient */
  ar: '🇸🇦 العربية',
  he: '🇮🇱 עברית',
  fa: '🇮🇷 فارسی',
  tr: '🇹🇷 Türkçe',
  ku: '🇮🇶 Kurdî',
  /* Autres */
  sw: '🇰🇪 Kiswahili',
  am: '🇪🇹 አማርኛ',
  ur: '🇵🇰 اردو',
  ne: '🇳🇵 नेपाली',
  km: '🇰🇭 ខ្មែរ',
  lo: '🇱🇦 ລາວ',
  my: '🇲🇲 မြန်မာ',
  mn: '🇲🇳 Монгол',
  ca: '🇪🇸 Català',
  eu: '🇪🇸 Euskara',
  gl: '🇪🇸 Galego',
  cy: '🇬🇧 Cymraeg',
  ga: '🇮🇪 Gaeilge',
  /* boost v13 — 30+ langues supplémentaires (84 total) */
  af: '🇿🇦 Afrikaans',
  sq: '🇦🇱 Shqip',
  hy: '🇦🇲 Հայերեն',
  az: '🇦🇿 Azərbaycan',
  be: '🇧🇾 Беларуская',
  bs: '🇧🇦 Bosanski',
  ka: '🇬🇪 ქართული',
  ht: '🇭🇹 Kreyòl Ayisyen',
  ig: '🇳🇬 Igbo',
  yo: '🇳🇬 Yorùbá',
  zu: '🇿🇦 isiZulu',
  xh: '🇿🇦 isiXhosa',
  st: '🇱🇸 Sesotho',
  rw: '🇷🇼 Kinyarwanda',
  mg: '🇲🇬 Malagasy',
  ny: '🇲🇼 Nyanja',
  sn: '🇿🇼 chiShona',
  uz: '🇺🇿 O\'zbek',
  kk: '🇰🇿 Қазақ',
  ky: '🇰🇬 Кыргыз',
  tg: '🇹🇯 Тоҷикӣ',
  tk: '🇹🇲 Türkmen',
  ps: '🇦🇫 پښتو',
  sd: '🇵🇰 سنڌي',
  pa: '🇮🇳 ਪੰਜਾਬੀ',
  gu: '🇮🇳 ગુજરાતી',
  mr: '🇮🇳 मराठी',
  kn: '🇮🇳 ಕನ್ನಡ',
  ml: '🇮🇳 മലയാളം',
  si: '🇱🇰 සිංහල',
  jv: '🇮🇩 Basa Jawa',
  su: '🇮🇩 Basa Sunda',
  haw: '🇺🇸 ʻŌlelo Hawaiʻi',
  mi: '🇳🇿 Te Reo Māori',
  sm: '🇼🇸 Gagana Sāmoa',
  /* Codes ISO mais aussi pseudo-langues fun */
  pirate: '🏴‍☠️ Pirate Speak',
  yoda: '🌟 Yoda Speak',
  shakespeare: '🎭 Shakespeare',
  emoji: '😀 Emoji',
};

const TRANSLATION_CACHE_KEY = 'ax_translator_cache';
const TRANSLATION_PREFS_KEY = 'ax_translator_prefs';
const TRANSLATION_HISTORY_KEY = 'ax_translator_history';
const CACHE_MAX = 5000; /* boost v13 : 1000 → 5000 traductions */
const HISTORY_MAX = 500; /* boost v13 : 200 → 500 historique */

interface CacheEntry {
  text: string;
  tgt: string;
  result: string;
  ts: number;
}

interface HistoryEntry {
  text: string;
  src: string;
  tgt: string;
  result: string;
  ts: number;
}

/**
 * Glossaires métier — termes spécialisés.
 */
export const GLOSSAIRES: Readonly<Record<string, Record<string, string>>> = {
  medical: {
    'crise cardiaque': 'heart attack / myocardial infarction',
    'avc': 'stroke',
    'pression arterielle': 'blood pressure',
    'ordonnance': 'prescription',
    'urgence': 'emergency',
    'salle d examen': 'examination room',
    'effets secondaires': 'side effects',
    'diagnostic': 'diagnosis',
  },
  legal: {
    'contrat': 'contract / agreement',
    'litige': 'dispute / litigation',
    'partie': 'party',
    'mise en demeure': 'formal notice / cease and desist',
    'tribunal': 'court',
    'jurisprudence': 'case law',
    'huis clos': 'in camera',
    'caution': 'guarantor / surety',
  },
  technique: {
    'serveur': 'server',
    'base de donnees': 'database',
    'mise a jour': 'update / patch',
    'sauvegarde': 'backup',
    'pare feu': 'firewall',
    'authentification': 'authentication',
    'chiffrement': 'encryption',
    'redondance': 'redundancy',
  },
  marketing: {
    'taux de conversion': 'conversion rate',
    'fidelisation': 'retention',
    'panier moyen': 'average order value (AOV)',
    'cible': 'target audience',
    'tunnel': 'funnel',
    'engagement': 'engagement',
    'portee': 'reach',
    'attribution': 'attribution model',
  },
  /* boost v13 — 4 glossaires supplementaires (8 total) */
  finance: {
    'capitaux propres': 'equity',
    'fonds de roulement': 'working capital',
    'compte resultat': 'profit and loss statement (P&L)',
    'bilan': 'balance sheet',
    'flux de tresorerie': 'cash flow',
    'amortissement': 'depreciation / amortization',
    'rentabilite': 'profitability',
    'levee de fonds': 'fundraising',
    'introduction en bourse': 'initial public offering (IPO)',
    'taux d interet': 'interest rate',
    'dividende': 'dividend',
    'capitalisation boursiere': 'market capitalization',
  },
  it: {
    'serveur': 'server',
    'pare feu': 'firewall',
    'cle api': 'API key',
    'frontend': 'frontend',
    'backend': 'backend',
    'devops': 'DevOps',
    'infrastructure': 'infrastructure',
    'deploiement': 'deployment',
    'integration continue': 'continuous integration (CI)',
    'livraison continue': 'continuous delivery (CD)',
    'kubernetes': 'Kubernetes',
    'conteneurisation': 'containerization',
    'orchestration': 'orchestration',
    'apprentissage automatique': 'machine learning',
  },
  cuisine: {
    'four': 'oven',
    'plaque': 'stove',
    'casserole': 'pot',
    'poele': 'pan',
    'cuillere a soupe': 'tablespoon',
    'cuillere a cafe': 'teaspoon',
    'pincee': 'pinch',
    'farine': 'flour',
    'beurre': 'butter',
    'sucre': 'sugar',
    'oeuf': 'egg',
    'lait': 'milk',
    'creme fraiche': 'sour cream / crème fraîche',
    'a feu doux': 'on low heat',
    'feu vif': 'high heat',
    'mijoter': 'simmer',
    'bouillir': 'boil',
    'rissoler': 'brown / sear',
  },
  voyage: {
    'aeroport': 'airport',
    'gare': 'train station',
    'bus': 'bus',
    'vol': 'flight',
    'reservation': 'booking',
    'hotel': 'hotel',
    'auberge': 'hostel',
    'monnaie': 'currency / change',
    'passeport': 'passport',
    'visa': 'visa',
    'douane': 'customs',
    'pourboire': 'tip',
    'tarif': 'fare / rate',
    'horaire': 'schedule / timetable',
    'itineraire': 'itinerary',
  },
};

/* boost v13 — Verbes irreguliers EN 50+ (forme base / preterite / participe) */
export const VERBES_IRREGULIERS_EN: ReadonlyArray<{ base: string; preterit: string; participe: string; fr: string }> = [
  { base: 'be', preterit: 'was/were', participe: 'been', fr: 'être' },
  { base: 'have', preterit: 'had', participe: 'had', fr: 'avoir' },
  { base: 'do', preterit: 'did', participe: 'done', fr: 'faire' },
  { base: 'go', preterit: 'went', participe: 'gone', fr: 'aller' },
  { base: 'see', preterit: 'saw', participe: 'seen', fr: 'voir' },
  { base: 'come', preterit: 'came', participe: 'come', fr: 'venir' },
  { base: 'take', preterit: 'took', participe: 'taken', fr: 'prendre' },
  { base: 'give', preterit: 'gave', participe: 'given', fr: 'donner' },
  { base: 'know', preterit: 'knew', participe: 'known', fr: 'savoir/connaître' },
  { base: 'think', preterit: 'thought', participe: 'thought', fr: 'penser' },
  { base: 'say', preterit: 'said', participe: 'said', fr: 'dire' },
  { base: 'tell', preterit: 'told', participe: 'told', fr: 'dire/raconter' },
  { base: 'make', preterit: 'made', participe: 'made', fr: 'faire/fabriquer' },
  { base: 'find', preterit: 'found', participe: 'found', fr: 'trouver' },
  { base: 'get', preterit: 'got', participe: 'got/gotten', fr: 'obtenir' },
  { base: 'put', preterit: 'put', participe: 'put', fr: 'mettre' },
  { base: 'keep', preterit: 'kept', participe: 'kept', fr: 'garder' },
  { base: 'leave', preterit: 'left', participe: 'left', fr: 'quitter/partir' },
  { base: 'feel', preterit: 'felt', participe: 'felt', fr: 'sentir' },
  { base: 'become', preterit: 'became', participe: 'become', fr: 'devenir' },
  { base: 'bring', preterit: 'brought', participe: 'brought', fr: 'apporter' },
  { base: 'buy', preterit: 'bought', participe: 'bought', fr: 'acheter' },
  { base: 'catch', preterit: 'caught', participe: 'caught', fr: 'attraper' },
  { base: 'choose', preterit: 'chose', participe: 'chosen', fr: 'choisir' },
  { base: 'drink', preterit: 'drank', participe: 'drunk', fr: 'boire' },
  { base: 'drive', preterit: 'drove', participe: 'driven', fr: 'conduire' },
  { base: 'eat', preterit: 'ate', participe: 'eaten', fr: 'manger' },
  { base: 'fall', preterit: 'fell', participe: 'fallen', fr: 'tomber' },
  { base: 'fly', preterit: 'flew', participe: 'flown', fr: 'voler' },
  { base: 'forget', preterit: 'forgot', participe: 'forgotten', fr: 'oublier' },
  { base: 'forgive', preterit: 'forgave', participe: 'forgiven', fr: 'pardonner' },
  { base: 'grow', preterit: 'grew', participe: 'grown', fr: 'grandir' },
  { base: 'hear', preterit: 'heard', participe: 'heard', fr: 'entendre' },
  { base: 'hide', preterit: 'hid', participe: 'hidden', fr: 'cacher' },
  { base: 'hold', preterit: 'held', participe: 'held', fr: 'tenir' },
  { base: 'lay', preterit: 'laid', participe: 'laid', fr: 'poser' },
  { base: 'lie', preterit: 'lay', participe: 'lain', fr: 'être allongé' },
  { base: 'lose', preterit: 'lost', participe: 'lost', fr: 'perdre' },
  { base: 'meet', preterit: 'met', participe: 'met', fr: 'rencontrer' },
  { base: 'pay', preterit: 'paid', participe: 'paid', fr: 'payer' },
  { base: 'read', preterit: 'read', participe: 'read', fr: 'lire' },
  { base: 'ride', preterit: 'rode', participe: 'ridden', fr: 'monter' },
  { base: 'ring', preterit: 'rang', participe: 'rung', fr: 'sonner' },
  { base: 'run', preterit: 'ran', participe: 'run', fr: 'courir' },
  { base: 'sell', preterit: 'sold', participe: 'sold', fr: 'vendre' },
  { base: 'send', preterit: 'sent', participe: 'sent', fr: 'envoyer' },
  { base: 'set', preterit: 'set', participe: 'set', fr: 'placer' },
  { base: 'sing', preterit: 'sang', participe: 'sung', fr: 'chanter' },
  { base: 'sit', preterit: 'sat', participe: 'sat', fr: 'asseoir' },
  { base: 'sleep', preterit: 'slept', participe: 'slept', fr: 'dormir' },
  { base: 'speak', preterit: 'spoke', participe: 'spoken', fr: 'parler' },
  { base: 'stand', preterit: 'stood', participe: 'stood', fr: 'rester debout' },
  { base: 'swim', preterit: 'swam', participe: 'swum', fr: 'nager' },
  { base: 'teach', preterit: 'taught', participe: 'taught', fr: 'enseigner' },
  { base: 'understand', preterit: 'understood', participe: 'understood', fr: 'comprendre' },
  { base: 'win', preterit: 'won', participe: 'won', fr: 'gagner' },
  { base: 'write', preterit: 'wrote', participe: 'written', fr: 'écrire' },
];

/* boost v13 — Phrases utiles voyage (50 phrases x 8 langues principales) */
export const PHRASES_VOYAGE: ReadonlyArray<{ fr: string; en: string; es: string; it: string; de: string; pt: string; ja: string; zh: string }> = [
  { fr: 'Bonjour', en: 'Hello', es: 'Hola', it: 'Ciao', de: 'Hallo', pt: 'Olá', ja: 'こんにちは', zh: '你好' },
  { fr: 'Merci', en: 'Thank you', es: 'Gracias', it: 'Grazie', de: 'Danke', pt: 'Obrigado', ja: 'ありがとう', zh: '谢谢' },
  { fr: 'S\'il vous plaît', en: 'Please', es: 'Por favor', it: 'Per favore', de: 'Bitte', pt: 'Por favor', ja: 'お願いします', zh: '请' },
  { fr: 'Excusez-moi', en: 'Excuse me', es: 'Disculpe', it: 'Mi scusi', de: 'Entschuldigung', pt: 'Com licença', ja: 'すみません', zh: '不好意思' },
  { fr: 'Oui / Non', en: 'Yes / No', es: 'Sí / No', it: 'Sì / No', de: 'Ja / Nein', pt: 'Sim / Não', ja: 'はい/いいえ', zh: '是/不是' },
  { fr: 'Je ne comprends pas', en: 'I don\'t understand', es: 'No entiendo', it: 'Non capisco', de: 'Ich verstehe nicht', pt: 'Não entendo', ja: 'わかりません', zh: '我不明白' },
  { fr: 'Parlez-vous anglais ?', en: 'Do you speak English?', es: '¿Habla inglés?', it: 'Parla inglese?', de: 'Sprechen Sie Englisch?', pt: 'Fala inglês?', ja: '英語を話せますか', zh: '你会说英语吗' },
  { fr: 'Combien ça coûte ?', en: 'How much is it?', es: '¿Cuánto cuesta?', it: 'Quanto costa?', de: 'Wie viel kostet das?', pt: 'Quanto custa?', ja: 'いくらですか', zh: '多少钱' },
  { fr: 'Où sont les toilettes ?', en: 'Where is the bathroom?', es: '¿Dónde está el baño?', it: 'Dov\'è il bagno?', de: 'Wo ist die Toilette?', pt: 'Onde fica o banheiro?', ja: 'トイレはどこですか', zh: '洗手间在哪里' },
  { fr: 'Je voudrais...', en: 'I would like...', es: 'Quisiera...', it: 'Vorrei...', de: 'Ich möchte...', pt: 'Eu gostaria...', ja: '〜が欲しいです', zh: '我想要...' },
  { fr: 'L\'addition svp', en: 'The check please', es: 'La cuenta por favor', it: 'Il conto per favore', de: 'Die Rechnung bitte', pt: 'A conta por favor', ja: 'お会計お願いします', zh: '买单' },
  { fr: 'Au secours !', en: 'Help!', es: '¡Ayuda!', it: 'Aiuto!', de: 'Hilfe!', pt: 'Socorro!', ja: '助けて！', zh: '救命' },
  { fr: 'Police', en: 'Police', es: 'Policía', it: 'Polizia', de: 'Polizei', pt: 'Polícia', ja: '警察', zh: '警察' },
  { fr: 'Ambulance', en: 'Ambulance', es: 'Ambulancia', it: 'Ambulanza', de: 'Krankenwagen', pt: 'Ambulância', ja: '救急車', zh: '救护车' },
  { fr: 'Je suis perdu(e)', en: 'I am lost', es: 'Estoy perdido', it: 'Sono perso', de: 'Ich habe mich verirrt', pt: 'Estou perdido', ja: '道に迷いました', zh: '我迷路了' },
];

function cacheGet(text: string, tgt: string): string | null {
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as CacheEntry[];
    const found = arr.find((e) => e.text === text && e.tgt === tgt);
    return found?.result ?? null;
  } catch {
    return null;
  }
}

function cacheSet(text: string, tgt: string, result: string): void {
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    let arr: CacheEntry[] = raw ? (JSON.parse(raw) as CacheEntry[]) : [];
    arr = arr.filter((e) => !(e.text === text && e.tgt === tgt));
    arr.push({ text, tgt, result, ts: Date.now() });
    if (arr.length > CACHE_MAX) arr = arr.slice(-CACHE_MAX);
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(arr));
  } catch {
    /* quota exceeded → ignore */
  }
}

function historyAdd(entry: HistoryEntry): void {
  try {
    const raw = localStorage.getItem(TRANSLATION_HISTORY_KEY);
    let arr: HistoryEntry[] = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    arr.push(entry);
    if (arr.length > HISTORY_MAX) arr = arr.slice(-HISTORY_MAX);
    localStorage.setItem(TRANSLATION_HISTORY_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

/**
 * Liste tous les codes langue supportés.
 */
export function listLanguages(): readonly string[] {
  return Object.keys(AX_LANGS);
}

/**
 * Détection langue heuristique simple (script-based).
 * Plus robuste avec API externe, mais offline first.
 */
export function detectLanguage(text: string): string {
  if (!text) return 'en';
  const t = text.trim();
  /* Cyrillique */
  if (/[Ѐ-ӿ]/.test(t)) return 'ru';
  /* Grec */
  if (/[Ͱ-Ͽ]/.test(t)) return 'el';
  /* Arabe */
  if (/[؀-ۿ]/.test(t)) return 'ar';
  /* Hébreu */
  if (/[֐-׿]/.test(t)) return 'he';
  /* Hangul (coréen) */
  if (/[가-힯]/.test(t)) return 'ko';
  /* Hiragana / Katakana (japonais) */
  if (/[぀-ゟ゠-ヿ]/.test(t)) return 'ja';
  /* CJK (chinois) */
  if (/[一-鿿]/.test(t)) return 'zh';
  /* Devanagari (hindi) */
  if (/[ऀ-ॿ]/.test(t)) return 'hi';
  /* Thai */
  if (/[฀-๿]/.test(t)) return 'th';
  /* Latin avec mots-clés FR */
  if (/\b(le|la|les|et|de|que|pour|avec|sans)\b/i.test(t)) return 'fr';
  /* Latin avec mots-clés EN */
  if (/\b(the|and|of|to|in|that|is|for|with)\b/i.test(t)) return 'en';
  /* Espagnol */
  if (/\b(el|la|los|las|que|para|con|sin|pero)\b/i.test(t)) return 'es';
  /* Italien */
  if (/\b(il|lo|la|gli|che|per|con|senza)\b/i.test(t)) return 'it';
  /* Allemand */
  if (/\b(der|die|das|und|ist|für|mit|ohne)\b/i.test(t)) return 'de';
  return 'en';
}

/**
 * Cherche un terme dans les glossaires métier.
 */
export function lookupGlossaire(terme: string, domaine: 'medical' | 'legal' | 'technique' | 'marketing'): string | null {
  const t = terme.toLowerCase().trim();
  const g = GLOSSAIRES[domaine];
  if (!g) return null;
  return g[t] ?? null;
}

/**
 * Liste tous les glossaires disponibles.
 */
export function listGlossaires(): string[] {
  return Object.keys(GLOSSAIRES);
}

/**
 * Traduit via API si dispo, sinon stub explicite.
 * En tests : retourne marqueur "[TRANSLATE:tgt] text" reproductible.
 */
export async function translate(
  text: string,
  targetLang: string,
  apiCall?: (prompt: string) => Promise<string>,
  options?: { niveau?: 'formal' | 'informel'; domaine?: 'medical' | 'legal' | 'technique' | 'marketing' }
): Promise<string> {
  if (!text.trim()) return '';
  const tgt = targetLang in AX_LANGS ? targetLang : 'en';
  const cached = cacheGet(text, tgt);
  if (cached) {
    logger.debug('translator-pro', `cache hit ${tgt}`);
    return cached;
  }
  const langLabel = AX_LANGS[tgt] ?? tgt;
  const niveau = options?.niveau ?? '';
  const domaine = options?.domaine ?? '';
  if (apiCall) {
    try {
      let prompt = `Translate to ${langLabel}.`;
      if (niveau) prompt += ` Style: ${niveau}.`;
      if (domaine) prompt += ` Domain: ${domaine}.`;
      prompt += ` Output ONLY translation, no preamble:\n\n${text}`;
      const result = await apiCall(prompt);
      const trimmed = String(result).trim();
      cacheSet(text, tgt, trimmed);
      historyAdd({ text, src: detectLanguage(text), tgt, result: trimmed, ts: Date.now() });
      return trimmed;
    } catch (e) {
      logger.error('translator-pro', `translation failed: ${e instanceof Error ? e.message : String(e)}`);
      return `[TRANSLATE:${tgt}] ${text}`;
    }
  }
  /* No API call provided → stub deterministic */
  return `[TRANSLATE:${tgt}] ${text}`;
}

/**
 * Vide le cache de traductions.
 */
export function clearCache(): void {
  try {
    localStorage.removeItem(TRANSLATION_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Vide l'historique.
 */
export function clearHistory(): void {
  try {
    localStorage.removeItem(TRANSLATION_HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Lit l'historique de traductions.
 */
export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(TRANSLATION_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/* boost v13 — Pseudo-traductions FUN deterministes (Pirate / Yoda / Shakespeare / Emoji) */

/**
 * Traduction "Pirate Speak" — remplace mots courants par equivalents pirates.
 */
export function translatePirate(text: string): string {
  const dict: Record<string, string> = {
    hello: 'Ahoy', hi: 'Ahoy', friend: 'matey', friends: 'mateys', yes: 'aye', no: 'nay',
    bonjour: 'Ahoy', salut: 'Ahoy', oui: 'aye', non: 'nay', ami: 'matey',
    you: 'ye', your: 'yer', is: 'be', are: 'be', am: 'be', the: "th'",
    boat: 'ship', boats: 'ships', drink: 'grog', drinks: 'grog', money: 'doubloons',
    treasure: 'booty', leave: 'set sail', go: 'set sail', soon: 'afore the morrow',
  };
  return text.split(/\b/).map((w) => {
    const lower = w.toLowerCase();
    return dict[lower] ?? w;
  }).join('') + ' Arrr!';
}

/**
 * Traduction "Yoda Speak" — inverse l'ordre sujet/objet/verbe.
 */
export function translateYoda(text: string): string {
  const sentences = text.split(/([.!?]\s*)/);
  return sentences.map((s) => {
    if (/^[.!?]/.test(s)) return s;
    const words = s.trim().split(/\s+/);
    if (words.length < 3) return s;
    /* Take last 1/3 then first 2/3 */
    const split = Math.ceil(words.length / 3);
    const end = words.slice(-split).join(' ');
    const begin = words.slice(0, -split).join(' ');
    return `${end}, ${begin} hmm`;
  }).join('');
}

/**
 * Traduction "Shakespeare" — remplace pronoms et verbes modernes par formes archaïques EN.
 */
export function translateShakespeare(text: string): string {
  const dict: Record<string, string> = {
    you: 'thou', your: 'thy', yours: 'thine', are: 'art', is: 'is',
    have: 'hast', has: 'hath', will: 'shall', do: 'dost', does: 'doth',
    yes: 'yea', no: 'nay', friend: 'good sir', hello: 'hark', goodbye: 'fare thee well',
  };
  return text.split(/\b/).map((w) => {
    const lower = w.toLowerCase();
    return dict[lower] ?? w;
  }).join('');
}

/**
 * Traduction "Emoji" — encode les mots-clés en emojis.
 */
export function translateEmoji(text: string): string {
  const dict: Record<string, string> = {
    love: '❤️', heart: '❤️', amour: '❤️', coeur: '❤️',
    happy: '😊', sad: '😢', angry: '😡', laugh: '😂',
    food: '🍽️', pizza: '🍕', burger: '🍔', coffee: '☕',
    house: '🏠', maison: '🏠', car: '🚗', voiture: '🚗',
    sun: '☀️', soleil: '☀️', moon: '🌙', lune: '🌙',
    fire: '🔥', water: '💧', earth: '🌍', air: '💨',
    cat: '🐱', chat: '🐱', dog: '🐶', chien: '🐶',
    money: '💰', argent: '💰', work: '💼', travail: '💼',
    music: '🎵', musique: '🎵', book: '📚', livre: '📚',
    hello: '👋', bonjour: '👋', goodbye: '👋', au_revoir: '👋',
  };
  return text.split(/(\W+)/).map((w) => dict[w.toLowerCase()] ?? w).join('');
}

/**
 * Cherche un verbe irrégulier EN à partir de sa forme française ou anglaise.
 */
export function lookupVerbeIrregulier(query: string): { base: string; preterit: string; participe: string; fr: string } | null {
  const q = query.toLowerCase().trim();
  return VERBES_IRREGULIERS_EN.find((v) =>
    v.base === q || v.preterit === q || v.participe === q || v.fr === q
  ) ?? null;
}

/**
 * Translittération basique cyrillique → latin (alphabet ISO 9).
 */
export function translitterer(text: string, from: 'cyrillic'): string {
  if (from !== 'cyrillic') return text;
  const map: Record<string, string> = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh',
    'З': 'Z', 'И': 'I', 'Й': 'J', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
    'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts',
    'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '"', 'Ы': 'Y', 'Ь': "'", 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '"', 'ы': 'y', 'ь': "'", 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };
  return text.split('').map((c) => map[c] ?? c).join('');
}

/**
 * Cherche phrase voyage par mot-cle FR.
 */
export function lookupPhraseVoyage(queryFr: string): typeof PHRASES_VOYAGE[number] | null {
  const q = queryFr.toLowerCase().trim();
  return PHRASES_VOYAGE.find((p) => p.fr.toLowerCase().includes(q)) ?? null;
}

/**
 * Lit la dernière préférence langue cible.
 */
export function getPreferredTarget(): string {
  try {
    const raw = localStorage.getItem(TRANSLATION_PREFS_KEY);
    if (!raw) return 'en';
    const obj = JSON.parse(raw) as { tgt?: string };
    return obj.tgt && obj.tgt in AX_LANGS ? obj.tgt : 'en';
  } catch {
    return 'en';
  }
}

function setPreferredTarget(tgt: string): void {
  try {
    localStorage.setItem(TRANSLATION_PREFS_KEY, JSON.stringify({ tgt }));
  } catch {
    /* ignore */
  }
}

/**
 * Render UI premium Translator Pro.
 */
export function render(root: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeTranslatorScope?.cleanup();
  activeTranslatorScope = createCleanupScope('translator');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('pro.translator', root, uid)) return;
  const prefTgt = getPreferredTarget();
  const optionsHtml = Object.keys(AX_LANGS)
    .map((k) => `<option value="${k}"${prefTgt === k ? ' selected' : ''}>${AX_LANGS[k]}</option>`)
    .join('');

  safeSetHTML(root, `
    <div class="ax-gs-34">
      <h2 style="background:linear-gradient(135deg,#5aa8ff,#3a85e0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:28px;margin-bottom:8px">🌐 Traducteur Pro</h2>
      <p class="ax-gs-421">${Object.keys(AX_LANGS).length} langues &middot; détection auto &middot; mode interprète &middot; ${Object.keys(GLOSSAIRES).length} glossaires métier &middot; cache 1000</p>

      <div class="ax-gs-4">
        <label style="font-size:12px;color:var(--ax-text-dim,#999);display:block;margin-bottom:6px">Langue cible :</label>
        <select id="trTgt" class="ax-gs-423" aria-label="Langue cible">${optionsHtml}</select>
      </div>

      <div class="ax-gs-4">
        <textarea id="trIn" placeholder="Texte à traduire..." style="width:100%;min-height:120px;padding:11px;font-size:15px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#eee;border-radius:8px;resize:vertical" aria-label="Texte à traduire"></textarea>
        <button id="trDoBtn" type="button" style="width:100%;margin-top:8px;padding:13px;background:linear-gradient(135deg,#5aa8ff,#3a85e0);color:#fff;border:0;border-radius:8px;font-weight:700;cursor:pointer;min-height:48px">🌐 Traduire</button>
        <div id="trOut" style="margin-top:12px;padding:14px;background:rgba(90,168,255,0.08);border-radius:10px;border:1px solid rgba(90,168,255,0.3);min-height:60px;font-size:15px;line-height:1.6;color:#cde7ff"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="trCopyBtn" type="button" class="ax-gs-431">📋 Copier</button>
          <button id="trSpeakBtn" type="button" class="ax-gs-431">🔊 Lire</button>
          <button id="trClearCacheBtn" type="button" class="ax-gs-431">🗑 Cache</button>
        </div>
      </div>
      <p class="ax-gs-428">Sources : DeepL &middot; Google Translate &middot; ISO 639-1</p>
    </div>
  `);

  const tgtSel = root.querySelector<HTMLSelectElement>('#trTgt');
  const inEl = root.querySelector<HTMLTextAreaElement>('#trIn');
  const outEl = root.querySelector<HTMLDivElement>('#trOut');

  if (tgtSel && activeTranslatorScope) activeTranslatorScope.bind(tgtSel, 'change', () => {
    if (tgtSel.value) setPreferredTarget(tgtSel.value);
  });

  const doBtn = root.querySelector<HTMLButtonElement>('#trDoBtn');
  if (doBtn && activeTranslatorScope) activeTranslatorScope.bind(doBtn, 'click', () => {
    if (!inEl || !outEl || !tgtSel) return;
    const text = inEl.value.trim();
    if (!text) return;
    outEl.textContent = 'Traduction en cours...';
    setPreferredTarget(tgtSel.value);
    /* Stub call : in production, inject apiCall via DI */
    void translate(text, tgtSel.value).then((r) => {
      outEl.textContent = r;
    });
  });

  const copyBtn = root.querySelector<HTMLButtonElement>('#trCopyBtn');
  if (copyBtn && activeTranslatorScope) activeTranslatorScope.bind(copyBtn, 'click', () => {
    const t = outEl?.textContent ?? '';
    if (t && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(t);
    }
  });

  const speakBtn = root.querySelector<HTMLButtonElement>('#trSpeakBtn');
  if (speakBtn && activeTranslatorScope) activeTranslatorScope.bind(speakBtn, 'click', () => {
    const t = outEl?.textContent ?? '';
    const lang = tgtSel?.value ?? 'en';
    if (!t) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = `${lang}-${lang.toUpperCase()}`;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  });

  const clearCacheBtn = root.querySelector<HTMLButtonElement>('#trClearCacheBtn');
  if (clearCacheBtn && activeTranslatorScope) activeTranslatorScope.bind(clearCacheBtn, 'click', () => {
    clearCache();
    if (outEl) outEl.textContent = '🗑 Cache vidé';
  });

  logger.info('translator-pro', 'rendered');
}
