/**
 * APEX v13 — Tools registry: media category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const MEDIA_TOOLS: readonly ApexTool[] = [
  {
    name: 'finance_calculate',
    description: 'Calcul fiscal/financier (IR FR 2026, crédit immo, plus-value, IBAN check).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['ir', 'credit', 'plus_value', 'iban_check'] },
        params: { type: 'object', description: 'Paramètres spécifiques au calcul' },
      },
      required: ['type', 'params'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'translate',
    description: 'Traduit un texte (30+ langues) via DeepL ou Claude Haiku failover.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        target_lang: { type: 'string', description: 'Code langue ISO (ex: en, es, ja)' },
      },
      required: ['text', 'target_lang'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'qr_generate',
    description: 'Génère un QR code (URL, vCard, WiFi credentials).',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string' },
        format: { type: 'string', enum: ['url', 'vcard', 'wifi', 'plain'] },
      },
      required: ['data'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'ocr_scan',
    description: 'OCR sur image base64 via Tesseract.js local (sans cloud).',
    inputSchema: {
      type: 'object',
      properties: {
        image_base64: { type: 'string' },
        lang: { type: 'string', description: 'fra, eng, ita, etc.' },
      },
      required: ['image_base64'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'image_analyze',
    description: 'Analyse vision IA (Claude Sonnet 4.6 vision ou GPT-4o vision).',
    inputSchema: {
      type: 'object',
      properties: {
        image_base64: { type: 'string' },
        prompt: { type: 'string' },
      },
      required: ['image_base64', 'prompt'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'search_latest_tools',
    description: 'Cherche derniers outils/APIs/libs récents dans un domaine via web_search. Retourne 5 candidats + dates de release.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Ex: ai-models, cloud-storage, payment-api, voice-recognition' },
      },
      required: ['domain'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'weather',
    description: 'Météo 7 jours via Open-Meteo (gratuit, sans clé). Lat/lon ou nom ville.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Ex: Monaco, Paris, lat,lon' },
        days: { type: 'number', description: 'Nombre jours forecast (1-7)' },
      },
      required: ['location'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'news_headlines',
    description: 'Dernières news via NewsAPI (clé optionnelle) ou RSS publics.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['general', 'tech', 'business', 'sports', 'health', 'science'] },
        country: { type: 'string', description: 'Code ISO 2 lettres (fr, us, etc.)' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'market_data',
    description: 'Prix temps réel : crypto (CoinGecko gratuit) ou stocks (Finnhub clé optionnelle).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['crypto', 'stock', 'forex'] },
        symbol: { type: 'string', description: 'Ex: BTC, ETH, AAPL, EUR/USD' },
      },
      required: ['type', 'symbol'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'json_validate',
    description: 'Valide un JSON, retourne {valid, parsed?, error?, depth, keys_count}. Pratique pour debug API.',
    inputSchema: {
      type: 'object',
      properties: { json: { type: 'string' } },
      required: ['json'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'csv_parse',
    description: 'Parse CSV (séparateur , ; \t auto-détecté) → array of objects. Header row obligatoire.',
    inputSchema: {
      type: 'object',
      properties: {
        csv: { type: 'string' },
        delimiter: { type: 'string', description: 'Délimiteur custom (auto si absent)' },
      },
      required: ['csv'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'text_diff',
    description: 'Diff deux textes ligne par ligne. Retourne added/removed/unchanged + stats.',
    inputSchema: {
      type: 'object',
      properties: {
        before: { type: 'string' },
        after: { type: 'string' },
      },
      required: ['before', 'after'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'hash_text',
    description: 'Hash SHA-256/SHA-1/MD5 d\'un texte via Web Crypto API.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        algo: { type: 'string', enum: ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'] },
      },
      required: ['text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'base64_encode_decode',
    description: 'Encode ou décode Base64 (UTF-8 safe).',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['encode', 'decode'] },
        text: { type: 'string' },
      },
      required: ['mode', 'text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'regex_test',
    description: 'Test une regex sur un texte. Retourne matches + groupes capture.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        flags: { type: 'string', description: 'Ex: gi, gm' },
        text: { type: 'string' },
      },
      required: ['pattern', 'text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'jwt_decode',
    description: 'Decode JWT (header + payload, SANS vérification signature). Pratique pour debug.',
    inputSchema: {
      type: 'object',
      properties: { token: { type: 'string' } },
      required: ['token'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'uuid_generate',
    description: 'Génère UUID v4 (crypto.randomUUID) pour clés uniques, IDs.',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'number', description: '1-50 (default 1)' } },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'summarize_text',
    description: 'Résumé extractif rapide (top N phrases scoring TF-IDF). Sans IA externe.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        sentences: { type: 'number', description: 'Nombre de phrases résumé (default 3)' },
      },
      required: ['text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'word_count',
    description: 'Stats texte : mots, caractères, phrases, paragraphes, durée lecture (200 wpm), Flesch readability.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'detect_language',
    description: 'Détection langue d\'un texte (heuristique trigrammes, FR/EN/IT/ES/DE/PT). Sans appel API.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'mind_map_generate',
    description: 'Génère mind map markdown depuis sujet central + branches.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        branches: { type: 'array', description: 'Array de sous-thèmes' },
      },
      required: ['topic'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'create_task',
    description: 'Crée une tâche locale (apex_v13_tasks). Stockée local + Firebase shared admin.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        due: { type: 'string', description: 'ISO 8601 date optionnelle' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
      },
      required: ['title'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'vat_validate_eu',
    description: 'Valide numéro TVA UE format (heuristique préfixe pays + longueur).',
    inputSchema: {
      type: 'object',
      properties: { vat: { type: 'string' } },
      required: ['vat'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'compound_interest',
    description: 'Calcul intérêts composés. Capital, taux, durée, fréquence → valeur finale.',
    inputSchema: {
      type: 'object',
      properties: {
        principal: { type: 'number' },
        rate: { type: 'number', description: 'Taux annuel % (ex: 5)' },
        years: { type: 'number' },
        frequency: { type: 'number', description: 'Compositions/an (default 12)' },
      },
      required: ['principal', 'rate', 'years'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'currency_convert',
    description: 'Conversion devises via taux exchangerate-api gratuit (100+ devises).',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        from: { type: 'string', description: 'Code ISO 4217 (EUR, USD, ...)' },
        to: { type: 'string' },
      },
      required: ['amount', 'from', 'to'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'image_compress',
    description: 'Compresse image base64 via Canvas API (qualité réglable, conserve ratio).',
    inputSchema: {
      type: 'object',
      properties: {
        image_base64: { type: 'string' },
        quality: { type: 'number', description: '0.1-1.0 (default 0.8)' },
        max_width: { type: 'number', description: 'Largeur max px (default 1920)' },
      },
      required: ['image_base64'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'image_generate',
    description:
      'GÉNÈRE une image à partir d\'un texte (texte → image, FLUX schnell via Replicate). ' +
      'À utiliser dès que l\'utilisateur demande de créer/générer/dessiner une image, un logo simple, une illustration. ' +
      'Réponse : {success, outputUrl}. Clé Vault `ax_replicate_key` requise (sinon message clair vers le Coffre).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description de l\'image à générer (en anglais de préférence pour de meilleurs résultats).',
        },
      },
      required: ['prompt'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
  {
    name: 'transform_image',
    description:
      'Transforme une image (URL https/data:/blob:) en cartoon, anime, vidéo animée, fond retiré, ou variation stylisée. ' +
      'Réponse : {success, outputUrl, cost_eur, estimatedSeconds}. ' +
      'Utilise Replicate API (clé Vault `ax_replicate_key`). ' +
      'Modes : cartoon (catacolabs/cartoonify) · anime (animeganv2) · video (stable-video-diffusion 4s) · ' +
      'remove-bg (lucataco/remove-bg) · stylize (sdxl img2img avec prompt).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL image source (https://, data:image/, ou blob:). Pas http:// ni file://.',
        },
        type: {
          type: 'string',
          enum: ['cartoon', 'anime', 'video', 'remove-bg', 'stylize'],
          description: 'Type de transformation à appliquer.',
        },
        prompt: {
          type: 'string',
          description: 'Pour `type=stylize` uniquement : prompt SDXL img2img (ex: "huile sur toile renaissance").',
        },
      },
      required: ['url', 'type'],
    },
    minTier: 'family',
    impactLevel: 'B',
  },
];
