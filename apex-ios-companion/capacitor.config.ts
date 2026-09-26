/**
 * APEX iOS Companion — Capacitor configuration (scaffolding v13.3.58, Kevin 2026-05-08).
 *
 * À finaliser dans une session ultérieure (voir README.md "Roadmap finalisation").
 *
 * Usage prévu :
 *   npm install
 *   npx cap init  (déjà fait via ce fichier)
 *   npx cap add ios
 *   npx cap sync ios
 *   npx cap open ios   (ouvre Xcode)
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.kdmc.apex.companion',
  appName: 'Apex',
  /* Charge apex-ai/v13/dist build local (npm run build:v13) */
  webDir: '../apex-ai/v13/dist',
  /* Alternative : charger directement depuis GitHub Pages production */
  server: {
    url: 'https://9r4rxssx64-creator.github.io/CMCteams/apex-ai-v13/',
    cleartext: false,
    /* allowNavigation autorise apex à fetch ces hosts depuis WebView */
    allowNavigation: [
      'api.anthropic.com',
      'api.openai.com',
      'generativelanguage.googleapis.com',
      'api.groq.com',
      'kdmc-clients-default-rtdb.firebaseio.com',
      'cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app',
      '*.workers.dev',
    ],
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#08080f',
    /* limitsNavigationsToAppBoundDomains: false (default) — laisse fetch externe */
    scheme: 'apex',
    /* Permet à Apex de pousser via custom scheme apex://… */
    handleApplicationURL: true,
  },
  plugins: {
    /* Plugins natifs custom à implémenter (voir plugins/ folder) */
    ApexBluetooth: {
      stateRestorationKey: 'apex-bt-restore',
      /* Background mode permet scan even quand app pas active (avec entitlement) */
      enableBackgroundMode: false,
    },
    ApexNFC: {
      /* iOS NFC requires user-initiated session */
      hint: 'Approche un tag NFC pour qu\'Apex le lise',
    },
    ApexUSB: {
      /* External Accessory framework only works with MFi-certified devices */
      mfiOnly: true,
    },
    /* Plugins Capacitor standards utiles */
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#08080f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#08080f',
    },
  },
};

export default config;
