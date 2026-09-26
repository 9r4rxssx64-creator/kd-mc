/**
 * APEX v13 — Tools registry: iot category.
 * Auto-split from services/apex-tools.ts (refactor 2026-05-08).
 * DO NOT edit by hand — see apex-tools.ts to add/modify tools then re-split.
 */

import type { ApexTool } from '../core-svc/apex-tools-types.js';

export const IOT_TOOLS: readonly ApexTool[] = [
  {
    name: 'setup_broadlink_from_image',
    description:
      'Configure un compte Broadlink à partir d\'un screenshot user (token + devices détectés via Claude Vision). Stocke chiffré dans Coffre + propose modal config 1-clic.',
    inputSchema: {
      type: 'object',
      properties: {
        image_data_url: { type: 'string', description: 'Image data URL (data:image/...;base64,...)' },
        image_base64: { type: 'string', description: 'Image base64 pure (sans data: prefix)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'analyze_device_image',
    description:
      'Analyse photo device IoT (Smart TV, Hue, Sonos, Broadlink, routeur) → extrait infos structurées (MAC, IP, brand, model, token). Réutilise Claude Vision multimodal.',
    inputSchema: {
      type: 'object',
      properties: {
        image_data_url: { type: 'string', description: 'Image data URL (data:image/...;base64,...)' },
        image_base64: { type: 'string', description: 'Image base64 pure (sans data: prefix)' },
        force_type: { type: 'string', enum: ['broadlink_account', 'smart_tv', 'auto'] as const, description: 'Forcer type (default auto-detect)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'broadlink_list_devices',
    description: 'Liste les devices liés au compte Broadlink configuré (force_refresh=true pour bypass cache 5min).',
    inputSchema: {
      type: 'object',
      properties: {
        force_refresh: { type: 'boolean', description: 'Force re-fetch API (bypass cache)' },
      },
    },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'broadlink_send_ir',
    description:
      'Envoie une commande IR via le hub Broadlink (RM Pro/Mini) vers un device cible (TV, climatiseur). irHex = code IR hex (capturé/appris).',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'ID device Broadlink RM' },
        ir_hex: { type: 'string', description: 'Code IR hexadécimal' },
        learned_name: { type: 'string', description: 'Alternative : nom code appris (cherche dans cache local)' },
      },
      required: ['device_id'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'install_iot_provider',
    description:
      'Installe/configure un provider IoT (eWeLink, SmartLife/Tuya, Hue, Sonos, Home Assistant, Broadlink). Apex peut self-installer en autonomie quand Kevin fournit ses identifiants ou quand vision-device-analyze a extrait token. Ouvre access cross-provider via iot_list_devices + iot_send_command.',
    inputSchema: {
      type: 'object',
      properties: {
        provider_id: {
          type: 'string',
          description: 'Provider id : ewelink | tuya | broadlink | hue | sonos | home-assistant | (custom)',
          enum: ['ewelink', 'tuya', 'broadlink', 'hue', 'sonos', 'home-assistant'],
        },
        credentials: {
          type: 'object',
          description:
            'Map credentials. eWeLink/Broadlink: {email,password}. Tuya: {client_id,client_secret,uid,access_token}. Hue: {bridge_ip,username} ou {oauth_token}. Sonos: {token,household}. Home Assistant: {url,token}.',
        },
        region: {
          type: 'string',
          description: 'Région optionnelle (us|eu|cn|as) pour eWeLink/Tuya. Default eu.',
        },
      },
      required: ['provider_id', 'credentials'],
    },
    minTier: 'admin',
    impactLevel: 'C', /* setup credentials = sensible → validation Kevin */
  },
  {
    name: 'iot_list_devices',
    description:
      'Liste tous les devices IoT cross-provider configurés (eWeLink, Tuya, Hue, Sonos, HA, Broadlink). Retourne tableau {provider, device_id, name, type, online, capabilities}.',
    inputSchema: {
      type: 'object',
      properties: {
        provider_id: {
          type: 'string',
          description: 'Optionnel : filtre devices d\'un provider spécifique. Sinon retourne tout.',
        },
      },
    },
    minTier: 'laurence', /* read-only sécurisé pour Laurence + family */
    impactLevel: 'A',
  },
  {
    name: 'iot_send_command',
    description:
      'Envoie commande à un device IoT via le bon provider. Exemples : eWeLink {switch:"on"} | Tuya {switch_led:true,bright_value:500} | Hue {on:true,bri:200} | Sonos {action:"play"} | Home Assistant {service:"turn_on"}.',
    inputSchema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string', description: 'Provider du device' },
        device_id: { type: 'string', description: 'ID device dans le provider' },
        command: {
          type: 'object',
          description: 'Commande spécifique au provider (cf. description). Free-form selon device.',
        },
      },
      required: ['provider_id', 'device_id', 'command'],
    },
    minTier: 'admin',
    impactLevel: 'B',
  },
  {
    name: 'iot_test_provider',
    description:
      'Teste connexion d\'un provider IoT (latence + count devices). Utile pour status badge ou diagnostic.',
    inputSchema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string' },
      },
      required: ['provider_id'],
    },
    minTier: 'laurence',
    impactLevel: 'A',
  },
];
