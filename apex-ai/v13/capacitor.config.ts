/**
 * Capacitor config — Apex iOS native (Kevin "passe en native iOS" 2026-05-15).
 *
 * Wrapper iOS de Apex v13 PWA → app native iOS App Store.
 * Garde 95% du code TypeScript existant + accès natif Keychain/Photos/etc.
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kdmc.apex',
  appName: 'Apex',
  webDir: 'dist',
  /* v13.4.122 : utilise le bundle Vite build (dist/) comme webDir.
   * Permet le mode hybrid : WebView affiche le bundle Apex web compilé. */
  server: {
    androidScheme: 'https',
    /* iOS : utiliser le bundle local (pas de remote) pour fonctionner offline */
    iosScheme: 'apex',
  },
  ios: {
    /* Configuration WebView iOS WKWebView */
    contentInset: 'always', /* Respect safe-area iPhone notch */
    backgroundColor: '#08080f', /* Fond noir Apex pendant boot */
    scheme: 'apex',
    /* iCloud Keychain sync automatique pour Preferences plugin */
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    /* Keychain via Preferences plugin (sync iCloud automatique si configuré) */
    Preferences: {
      group: 'group.com.kdmc.apex.vault', /* App Group pour partage Keychain */
    },
    /* Push notifications APNs natif (vs Web Push limité) */
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    /* Splash screen pendant boot */
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#08080f',
      iosSpinnerStyle: 'large',
      spinnerColor: '#c9a227',
      showSpinner: true,
    },
    /* Status bar dark theme */
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#08080f',
    },
  },
};

export default config;
