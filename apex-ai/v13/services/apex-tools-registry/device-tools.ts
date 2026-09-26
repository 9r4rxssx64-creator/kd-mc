/**
 * APEX v13 — Tools registry: device category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const DEVICE_TOOLS: readonly ApexTool[] = [
  {
    name: 'voice_command',
    description: 'Reconnaissance vocale Web Speech API + intent matching (ouvrir/lancer/chercher).',
    inputSchema: {
      type: 'object',
      properties: {
        lang: { type: 'string', description: 'Code lang (fr-FR, en-US)' },
        timeout_sec: { type: 'number', description: 'Timeout micro 5-30s' },
      },
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'screen_share',
    description: 'Capture screen via getDisplayMedia (sandbox iframe) pour debug visuel ou présentation.',
    inputSchema: {
      type: 'object',
      properties: {
        duration_sec: { type: 'number', description: 'Durée enregistrement max' },
      },
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'partage_contenu',
    description: 'Partage natif iOS/Android (URL, texte, fichiers) via navigator.share. Utilise quand user dit "partage", "envoie", "share".',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        text: { type: 'string' },
        url: { type: 'string' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'vibrer',
    description: 'Vibration haptique iPhone/Android (Android only physiquement, iOS ignore silencieusement).',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'array', description: 'Durées ms (ex: [100,50,100])' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'ma_position',
    description: 'Coordonnées GPS via navigator.geolocation. Demande permission une fois.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'batterie',
    description: 'Niveau batterie + en charge (Android Chrome only).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'parler',
    description: 'TTS Web Speech (synthèse vocale). Voix native iOS/Android. Utilise quand user dit "lis-moi", "dis-moi", "parle".',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        voice: { type: 'string', description: 'Nom voix optionnel' },
        lang: { type: 'string', description: 'fr-FR par défaut' },
        rate: { type: 'number', description: '0.5-2 (1 par défaut)' },
      },
      required: ['text'],
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'ouvrir_maps',
    description: 'Ouvre Apple Maps (iOS) ou Google Maps avec adresse/coords. Utilise quand user dit "va à", "itinéraire", "carte".',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        coords: { type: 'string', description: 'lat,lon' },
      },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'appeler',
    description: 'Ouvre app téléphone iOS/Android avec numéro pré-rempli (tel:URI).',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'string' } },
      required: ['number'],
    },
    minTier: 'client_free',
    impactLevel: 'B',
  },
  {
    name: 'sms',
    description: 'Ouvre app SMS iOS/Android avec destinataire + message pré-rempli (sms:URI).',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['number'],
    },
    minTier: 'client_free',
    impactLevel: 'B',
  },
  {
    name: 'mail',
    description: 'Ouvre app Mail iOS/Android avec destinataire + sujet + corps pré-rempli (mailto:URI).',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to'],
    },
    minTier: 'client_free',
    impactLevel: 'B',
  },
  {
    name: 'mes_photos',
    description: 'Sélection multiple photos galerie iPhone/Android via input file. Utilise quand user dit "trie mes photos", "mes photos".',
    inputSchema: {
      type: 'object',
      properties: { max: { type: 'number', description: 'Max nombre photos' } },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'tri_photos',
    description: 'Analyse EXIF photos (date, GPS, caméra) et regroupe par date YYYY-MM.',
    inputSchema: {
      type: 'object',
      properties: { files: { type: 'array', description: 'Array File objects' } },
    },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'detect_device',
    description: 'Detect environnement (iOS/Android/Desktop, PWA standalone ou browser) + capabilities supportées.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'scan_network',
    description: 'Scan LAN complet (WebRTC ICE → IP locale + subnet + 80+ device probes : Hue, Sonos, Plex, NAS, caméras, imprimantes, IoT). Retourne devices trouvés.',
    inputSchema: {
      type: 'object',
      properties: {
        useCache: { type: 'string', description: 'Si "false" force rescan (default true cache 5 min)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'local_ip',
    description: 'Découvre IP locale via WebRTC ICE candidate.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'open_lan_device',
    description: 'Ouvre UI HTTP d\'un device LAN dans nouvel onglet (window.open).',
    inputSchema: {
      type: 'object',
      properties: {
        ip: { type: 'string', description: 'IP du device (ex: 192.168.1.50)' },
        port: { type: 'number', description: 'Port HTTP (default 80)' },
      },
      required: ['ip'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'scan_badge',
    description: 'Lecture NFC tag (Android Chrome only). 60+ formats reconnus (NDEF, MIFARE, NTAG, FeliCa, ISO14443/15693, HID Prox, Vigik, EMV, etc.).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'list_badges',
    description: 'Liste tous les badges scannés (chiffrés AES-GCM via vault).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'clone_badge_to_tag',
    description: 'Clone badge stocké dans nouveau tag NFC vierge (Android Chrome write).',
    inputSchema: {
      type: 'object',
      properties: { badge_id: { type: 'string' } },
      required: ['badge_id'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'badge_to_qr',
    description: 'Génère QR code équivalent du badge (alternative scanners QR/NFC).',
    inputSchema: {
      type: 'object',
      properties: { badge_id: { type: 'string' } },
      required: ['badge_id'],
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'list_emulators',
    description: 'Liste 18 émulateurs hardware supportés (Flipper Zero USB+BLE, Proxmark3, ChameleonMini, ACR122, OMNIKEY, HydraNFC, RFIDler, M5Stick, ESP32+PN532, MagSpoof, Apex Companion App iOS/Android) + capabilities browser.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'connect_flipper_usb',
    description: 'Connecte Flipper Zero via WebUSB (Vendor 0x0483).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'connect_flipper_ble',
    description: 'Connecte Flipper Zero via Web Bluetooth (Service UUID 8fe5b3d5-...).',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'connect_proxmark',
    description: 'Connecte Proxmark3 Easy/RDV4 via WebSerial.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'connect_chameleon',
    description: 'Connecte ChameleonMini via WebSerial CDC ACM.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'emulate_badge',
    description: 'Émule badge stocké via device connecté (Flipper, Proxmark, Chameleon, etc.). Délègue commandes spécifiques.',
    inputSchema: {
      type: 'object',
      properties: {
        badge_id: { type: 'string' },
        duration_sec: { type: 'number', description: 'Durée émulation (default 60s)' },
      },
      required: ['badge_id'],
    },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'emulator_command',
    description: 'Envoie commande RAW au device émulateur connecté (ex Proxmark "hf mfu read", Flipper "rfid emulate").',
    inputSchema: {
      type: 'object',
      properties: { cmd: { type: 'string' } },
      required: ['cmd'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'emulator_disconnect',
    description: 'Déconnecte device émulateur en cours.',
    inputSchema: { type: 'object', properties: {} },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'get_my_location',
    description: 'Position GPS courante du user (haute précision, ~5m). Retourne lat/lng/accuracy/altitude. Demande permission browser au premier appel.',
    inputSchema: {
      type: 'object',
      properties: {
        high_accuracy: { type: 'boolean', description: 'true (default) = GPS, false = WiFi/IP rapide' },
      },
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'distance_to',
    description: 'Distance Haversine entre user et destination (km). Destination = adresse texte (geocoded) ou {lat,lng}.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Adresse ou "lat,lng"' },
      },
      required: ['destination'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'find_nearby',
    description: 'Cherche lieux proches (restaurants, pharmacies, hôpitaux, etc.) via Overpass API OSM gratuit. Retourne 10 résultats triés par distance.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Type lieu : restaurant, pharmacy, hospital, atm, fuel, supermarket, etc.' },
        radius_m: { type: 'number', description: 'Rayon recherche en mètres (default 1000)' },
      },
      required: ['category'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'reverse_geocode',
    description: 'Adresse depuis coordonnées GPS via Nominatim OpenStreetMap (gratuit). Retourne {country, city, street, postalCode}.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        language: { type: 'string', description: 'Code langue (default fr)' },
      },
      required: ['lat', 'lng'],
    },
    minTier: 'family',
    impactLevel: 'A',
  },
  {
    name: 'weather_local',
    description: 'Météo locale 7 jours via Open-Meteo (gratuit, sans clé). Si pas de coords fournies, utilise position user.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude (optionnel)' },
        lng: { type: 'number', description: 'Longitude (optionnel)' },
      },
    },
    minTier: 'family',
    impactLevel: 'A',
  },
];
