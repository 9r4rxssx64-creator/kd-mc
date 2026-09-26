/**
 * CMC Teams — Configuration vidéo de démonstration
 * Pipeline réutilisable pour générer des vidéos professionnelles
 */

module.exports = {
  // === Dimensions vidéo ===
  width: 1920,
  height: 1080,
  fps: 30,

  // === Palette Casino de Monte-Carlo ===
  colors: {
    gold:       '#c9a227',
    goldBright: '#ffdc40',
    goldSoft:   'rgba(201,162,39,.15)',
    greenDark:  '#0a1408',
    greenMid:   '#1a3020',
    greenLight: '#3a8a50',
    text:       '#e0f0d8',
    textSoft:   '#a8c8a0',
    textDim:    '#7aaa80',
    red:        '#ce1126',
    white:      '#ffffff',
    violet:     '#a060ff',
    blue:       '#4a72a8',
  },

  // === Polices ===
  fonts: {
    title:    '800 72px Georgia, "Times New Roman", serif',
    subtitle: '600 36px Georgia, "Times New Roman", serif',
    body:     '500 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    caption:  '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    badge:    '800 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    huge:     '800 96px Georgia, "Times New Roman", serif',
    number:   '800 120px Georgia, "Times New Roman", serif',
  },

  // === Timing (en frames à 30fps) ===
  timing: {
    introHold:       150,  // 5s
    sectionTitle:     90,  // 3s
    screenshotHold:  150,  // 5s
    transitionFrames: 30,  // 1s
    outroHold:       120,  // 4s
    featureCard:     120,  // 4s
  },

  // === Sections de la démo ===
  sections: [
    {
      id: 'intro',
      type: 'title',
      title: 'CMC Teams',
      subtitle: 'Casino de Monte-Carlo',
      description: 'Application de gestion de planning & équipes',
      badge: 'v9.67',
      duration: 180, // 6s
    },
    {
      id: 'overview',
      type: 'feature-list',
      title: 'Vue d\'ensemble',
      icon: '♦',
      features: [
        { icon: '📅', text: 'Planning des équipes en temps réel' },
        { icon: '👥', text: '258 employés · 36 équipes' },
        { icon: '🔄', text: 'Synchronisation Firebase multi-appareils' },
        { icon: '📱', text: 'PWA responsive (mobile-first)' },
        { icon: '🔒', text: 'Sécurité renforcée (CSP, hash, audit)' },
        { icon: '🤖', text: 'IA Claude intégrée avec 36 outils' },
      ],
      duration: 180,
    },
    {
      id: 'login',
      type: 'screenshot',
      view: 'login',
      title: 'Authentification sécurisée',
      subtitle: 'Multi-critères : matricule, nom+prénom, email',
      highlights: ['Hash 10K rounds', 'Rate-limiting PIN', 'Journal sécurité'],
      duration: 150,
    },
    {
      id: 'accueil',
      type: 'screenshot',
      view: 'accueil',
      title: 'Dashboard Accueil',
      subtitle: 'Vue personnalisée avec KPIs temps réel',
      highlights: ['Service du jour', 'Solde CP', 'Anniversaires', 'Alertes RH'],
      duration: 150,
    },
    {
      id: 'planning',
      type: 'screenshot',
      view: 'planning',
      title: 'Planning Équipe',
      subtitle: 'Grille mensuelle complète par famille de jeux',
      highlights: ['Jeux américains · européens · Baccara', 'Codes couleur', 'Scroll aujourd\'hui'],
      duration: 180,
    },
    {
      id: 'departs',
      type: 'screenshot',
      view: 'departs',
      title: 'Ordres de Départ',
      subtitle: 'Organisation des rotations par table',
      highlights: ['Position chef/senior', 'Compétences BRTPECK', 'Rotation 20/40/60 min'],
      duration: 150,
    },
    {
      id: 'monplanning',
      type: 'screenshot',
      view: 'monplanning',
      title: 'Mon Planning Personnel',
      subtitle: 'Vue individuelle avec calendrier et statistiques',
      highlights: ['Export ICS', 'Demande d\'échange', 'Solde congés'],
      duration: 150,
    },
    {
      id: 'profil',
      type: 'screenshot',
      view: 'profil',
      title: 'Fiche de Renseignement',
      subtitle: 'Self-service employé avec auto-save Firebase',
      highlights: ['Photo avatar', 'Adresse/USBM/Poste', 'Carrière & groupe contractuel'],
      duration: 120,
    },
    {
      id: 'chat',
      type: 'screenshot',
      view: 'chat',
      title: 'Chat Casino',
      subtitle: 'Messagerie temps réel avec DMs et réactions',
      highlights: ['Bulles glass morphism', 'Photos en fond', 'Réponses & emojis'],
      duration: 150,
    },
    {
      id: 'stats',
      type: 'screenshot',
      view: 'stats',
      title: 'Statistiques & Analytique',
      subtitle: 'Dashboard RH complet avec graphiques SVG',
      highlights: ['Heures/mois', 'Nuits/coupures', 'Absentéisme', 'Courbe 12 mois'],
      duration: 150,
    },
    {
      id: 'admin',
      type: 'feature-list',
      title: 'Panneau Administration',
      icon: '⚙️',
      features: [
        { icon: '👥', text: 'Gestion 258 employés (bulk actions)' },
        { icon: '📋', text: 'Import PDF intelligent' },
        { icon: '🔐', text: 'Mots de passe & accès personnalisés' },
        { icon: '📊', text: 'Statistiques globales & par équipe' },
        { icon: '⚠️', text: 'Détection conflits planning' },
        { icon: '📝', text: 'Journal d\'audit complet' },
      ],
      duration: 180,
    },
    {
      id: 'convention',
      type: 'screenshot',
      view: 'convention',
      title: 'Convention Collective & Loi',
      subtitle: 'Documentation réglementaire intégrée',
      highlights: ['35 articles Convention SBM', 'Loi 1.103 Monaco', 'Règles 8 jeux de table'],
      duration: 150,
    },
    {
      id: 'ia',
      type: 'screenshot',
      view: 'ia',
      title: 'Assistant IA Claude',
      subtitle: '36 outils connectés aux données temps réel',
      highlights: ['Recherche planning', 'Calcul congés', 'Règles des jeux', 'Actions admin'],
      duration: 150,
    },
    {
      id: 'features-tech',
      type: 'feature-list',
      title: 'Architecture & Technologie',
      icon: '🏗️',
      features: [
        { icon: '📄', text: 'SPA monofichier HTML (zéro build, zéro dépendance)' },
        { icon: '🔥', text: 'Firebase Realtime Database (SSE)' },
        { icon: '📡', text: 'Queue offline + sync auto retour réseau' },
        { icon: '🔔', text: 'Notifications navigateur & PWA' },
        { icon: '♿', text: 'Accessibilité WCAG (focus-visible, screen reader)' },
        { icon: '🎨', text: 'Glass morphism + thèmes (Casino/Clair/Nuit)' },
      ],
      duration: 180,
    },
    {
      id: 'outro',
      type: 'title',
      title: 'CMC Teams',
      subtitle: 'Casino de Monte-Carlo — SBM',
      description: 'Gestion de planning nouvelle génération',
      badge: '♦ Société des Bains de Mer',
      duration: 150,
    },
  ],

  // === Paths ===
  paths: {
    frames: './tools/video/frames',
    output: './tools/video/output',
    assets: './tools/video/assets',
    app:    './index.html',
  },
};
