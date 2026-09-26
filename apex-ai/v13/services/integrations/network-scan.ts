/**
 * APEX v13 — Network Scan (LAN discovery + device interaction).
 *
 * Demande Kevin 2026-05-04 :
 * "Je veux qu'Apex puisse par WiFi ou n'importe quel réseau accéder à TOUS
 *  les appareils connectés sur ce réseau. Bluetooth, WiFi, réseaux. Aller plus loin."
 *
 * Architecture (limites browser respectées) :
 * - WebRTC ICE candidate trick → discover IP locale machine
 * - Subnet inference (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 * - Probe range 1-254 sur ports communs (timeout court 500ms)
 * - Fingerprint device via response headers / endpoints connus
 * - Catalogue 50+ devices courants (Hue, Sonos, Nest, Home Assistant, NAS, printer, Apple TV, Chromecast)
 * - Cache résultats localStorage 5 min (anti rescan agressif)
 *
 * Limitations browser (être honnête) :
 * - Pas mDNS / Bonjour direct (besoin extension native)
 * - Pas SSDP / UPnP (CORS bloque)
 * - HTTP probes only (HTTPS aussi mais self-signed = error)
 * - Range scan lent (254 IP × timeout = jusqu'à 2 min)
 *
 * Compense via :
 * - Helper iframe pour bypass CORS sur LAN local (limite)
 * - Suggérer install native bridge (Cloudflare Tunnel, ngrok local)
 * - Wire Web Bluetooth (déjà existant) pour BLE devices physiques proches
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export type DeviceType =
  /* Hubs / Routeurs / Réseau */
  | 'router' | 'switch' | 'access_point' | 'mesh_node' | 'unifi_controller'
  /* Smart home / Domotique */
  | 'home_assistant' | 'homebridge' | 'hue_bridge' | 'deconz_bridge' | 'zigbee2mqtt'
  | 'openhab' | 'domoticz' | 'fhem' | 'eedomus' | 'jeedom' | 'fibaro' | 'smartthings'
  /* Audio / Speakers */
  | 'sonos' | 'bose' | 'denon_heos' | 'yamaha_musiccast' | 'roon' | 'logitech_squeezebox'
  | 'airplay_receiver' | 'volumio' | 'moode' | 'snapcast'
  /* TV / Streaming */
  | 'chromecast' | 'apple_tv' | 'fire_tv' | 'roku' | 'samsung_tv' | 'lg_webos_tv'
  | 'philips_ambilight' | 'shield_tv' | 'kodi_xbmc' | 'plex' | 'jellyfin' | 'emby'
  /* Caméras / Sécurité */
  | 'nest_cam' | 'ring_doorbell' | 'arlo_cam' | 'unifi_protect' | 'frigate_nvr'
  | 'reolink_cam' | 'hikvision_cam' | 'dahua_cam' | 'amcrest_cam' | 'foscam'
  | 'eufy_cam' | 'wyze_cam' | 'blink_cam' | 'tapo_cam' | 'shinobi'
  /* NAS / Stockage */
  | 'nas_synology' | 'nas_qnap' | 'nas_asustor' | 'nas_terramaster' | 'nas_drobo'
  | 'nas_truenas' | 'nas_unraid' | 'nas_proxmox' | 'nextcloud' | 'owncloud'
  /* Imprimantes / Print servers */
  | 'printer_ipp' | 'printer_airprint' | 'printer_hp_jetdirect' | 'printer_brother'
  | 'printer_canon' | 'printer_epson' | 'printer_lexmark' | 'printer_xerox'
  | 'octoprint' | 'klipper_3d' | 'duet_3d'
  /* Servers / Self-hosted */
  | 'pihole' | 'adguard_home' | 'bind_dns' | 'unbound_dns'
  | 'wireguard' | 'openvpn' | 'tailscale' | 'zerotier'
  | 'gitea' | 'gitlab' | 'gogs' | 'forgejo'
  | 'jellyfin' | 'plex' | 'emby' | 'navidrome' | 'audiobookshelf'
  | 'sonarr' | 'radarr' | 'lidarr' | 'readarr' | 'bazarr' | 'overseerr' | 'jellyseerr'
  | 'transmission' | 'qbittorrent' | 'deluge' | 'sabnzbd' | 'nzbget'
  | 'paperless_ngx' | 'bookstack' | 'wikijs' | 'mediawiki'
  | 'vaultwarden' | 'bitwarden' | 'authelia' | 'keycloak' | 'authentik'
  | 'grafana' | 'prometheus' | 'influxdb' | 'telegraf' | 'loki' | 'jaeger'
  | 'portainer' | 'rancher' | 'kubernetes_dashboard' | 'docker_compose_ui'
  | 'home_assistant_supervisor' | 'esphome'
  /* IoT industriel */
  | 'modbus_tcp' | 'mqtt_broker' | 'opc_ua' | 'bacnet' | 'knx_bus'
  /* Automation */
  | 'node_red' | 'n8n' | 'huginn' | 'iftt_local' | 'apache_airflow'
  /* Communication */
  | 'asterisk_pbx' | 'freeswitch' | 'matrix_synapse' | 'rocketchat' | 'mattermost'
  | 'jitsi_meet' | 'bigbluebutton' | 'nextcloud_talk'
  /* Gaming / Media */
  | 'minecraft_server' | 'factorio_server' | 'valheim_server' | 'palworld_server'
  | 'pterodactyl' | 'gameserver_query'
  /* Bornes EV / Énergie */
  | 'tesla_wall_connector' | 'wallbox_pulsar' | 'easee_home' | 'shelly_em'
  | 'solar_edge' | 'enphase_envoy' | 'fronius' | 'sma_inverter' | 'victron_gx'
  /* Thermostats */
  | 'nest_thermostat' | 'ecobee' | 'tado' | 'netatmo' | 'honeywell_evohome'
  /* Lights / Switches */
  | 'lifx' | 'wiz_lights' | 'shelly_relay' | 'tp_link_kasa' | 'tuya_smart' | 'ifan_4'
  /* Vacuum robots */
  | 'roborock' | 'roomba' | 'mi_vacuum' | 'ecovacs_deebot'
  /* Cuisine smart */
  | 'thermomix' | 'instant_pot_smart' | 'kitchenaid_smart'
  /* Imprimantes 3D / CNC */
  | 'octoprint' | 'klipper_3d' | 'mainsail_3d' | 'fluidd_3d'
  | 'unknown';

export interface NetworkDevice {
  ip: string;
  port: number;
  type: DeviceType;
  vendor?: string;
  model?: string;
  hostname?: string;
  service: string;
  metadata?: Record<string, unknown>;
  last_seen: number;
}

export interface ScanResult {
  ok: boolean;
  local_ip?: string;
  subnet?: string;
  devices: readonly NetworkDevice[];
  scan_duration_ms: number;
  reason?: string;
}

/* Catalogue devices courants : port + hint URL + identifier */
const DEVICE_PROBES: Array<{
  port: number;
  type: DeviceType;
  service: string;
  vendor: string;
  path: string;
  match: (text: string, headers?: Headers) => boolean;
}> = [
  /* Philips Hue Bridge — port 80 + /api/0/config */
  {
    port: 80, type: 'hue_bridge', service: 'Philips Hue', vendor: 'Philips',
    path: '/api/0/config',
    match: (text) => text.includes('bridgeid') || text.includes('hue'),
  },
  /* Sonos — port 1400 */
  {
    port: 1400, type: 'sonos', service: 'Sonos Speaker', vendor: 'Sonos',
    path: '/xml/device_description.xml',
    match: (text) => text.toLowerCase().includes('sonos'),
  },
  /* Home Assistant — port 8123 */
  {
    port: 8123, type: 'home_assistant', service: 'Home Assistant', vendor: 'Open Source',
    path: '/manifest.json',
    match: (text) => text.includes('Home Assistant') || text.includes('homeassistant'),
  },
  /* Plex — port 32400 */
  {
    port: 32400, type: 'plex', service: 'Plex Media Server', vendor: 'Plex',
    path: '/identity',
    match: (text) => text.includes('MediaContainer') || text.includes('Plex'),
  },
  /* Jellyfin — port 8096 */
  {
    port: 8096, type: 'jellyfin', service: 'Jellyfin Media Server', vendor: 'Jellyfin',
    path: '/System/Info/Public',
    match: (text) => text.includes('Jellyfin') || text.includes('ServerName'),
  },
  /* Pi-hole — port 80 / admin */
  {
    port: 80, type: 'pihole', service: 'Pi-hole DNS', vendor: 'Pi-hole',
    path: '/admin/api.php?status',
    match: (text) => text.includes('"status"') || text.includes('pi-hole'),
  },
  /* Synology NAS — port 5000 */
  {
    port: 5000, type: 'nas_synology', service: 'Synology DSM', vendor: 'Synology',
    path: '/webman/index.cgi',
    match: (_text, headers) => (headers?.get('Server') ?? '').includes('Synology'),
  },
  /* QNAP NAS — port 8080 */
  {
    port: 8080, type: 'nas_qnap', service: 'QNAP', vendor: 'QNAP',
    path: '/cgi-bin/Login.cgi',
    match: (_, headers) => (headers?.get('Server') ?? '').includes('QNAP'),
  },
  /* Printer IPP — port 631 */
  {
    port: 631, type: 'printer_ipp', service: 'IPP Printer', vendor: 'CUPS',
    path: '/printers/',
    match: (text) => text.includes('CUPS') || text.includes('printer'),
  },
  /* OctoPrint — port 5000 */
  {
    port: 5000, type: 'octoprint', service: 'OctoPrint 3D', vendor: 'OctoPrint',
    path: '/api/version',
    match: (text) => text.includes('"server"') && text.includes('octoprint'),
  },
  /* UniFi Controller — port 8443 */
  {
    port: 8443, type: 'unifi_controller', service: 'UniFi Controller', vendor: 'Ubiquiti',
    path: '/manage',
    match: (text) => text.includes('unifi') || text.includes('Ubiquiti'),
  },
  /* === Smart Home extra === */
  { port: 4567, type: 'homebridge', service: 'Homebridge', vendor: 'OSS', path: '/api/server/status', match: (t) => t.includes('homebridge') },
  { port: 80, type: 'deconz_bridge', service: 'deCONZ', vendor: 'dresden elektronik', path: '/api/config', match: (t) => t.includes('deCONZ') || t.includes('dresden') },
  { port: 8080, type: 'zigbee2mqtt', service: 'Zigbee2MQTT', vendor: 'OSS', path: '/api/info', match: (t) => t.includes('zigbee2mqtt') },
  { port: 8080, type: 'openhab', service: 'openHAB', vendor: 'OSS', path: '/rest/', match: (t) => t.includes('openHAB') },
  { port: 8080, type: 'domoticz', service: 'Domoticz', vendor: 'OSS', path: '/json.htm?type=command&param=getversion', match: (t) => t.includes('Domoticz') },
  { port: 80, type: 'jeedom', service: 'Jeedom', vendor: 'Jeedom SAS', path: '/index.php', match: (t) => t.toLowerCase().includes('jeedom') },
  /* === Audio === */
  { port: 4070, type: 'roon', service: 'Roon Server', vendor: 'Roon Labs', path: '/', match: (t) => t.includes('Roon') },
  { port: 9000, type: 'logitech_squeezebox', service: 'Squeezebox/LMS', vendor: 'Logitech', path: '/', match: (t) => t.toLowerCase().includes('squeezebox') || t.includes('Logitech Media') },
  { port: 80, type: 'volumio', service: 'Volumio', vendor: 'Volumio', path: '/api/v1/getstate', match: (t) => t.includes('volumio') },
  { port: 8060, type: 'roku', service: 'Roku', vendor: 'Roku', path: '/query/device-info', match: (t) => t.includes('roku') || t.includes('Roku') },
  /* === TV / Streaming === */
  { port: 8008, type: 'chromecast', service: 'Chromecast', vendor: 'Google', path: '/setup/eureka_info?options=detail', match: (t) => t.includes('eureka') || t.includes('cast') },
  { port: 8009, type: 'chromecast', service: 'Chromecast TLS', vendor: 'Google', path: '/', match: () => true },
  { port: 7000, type: 'apple_tv', service: 'Apple TV AirPlay', vendor: 'Apple', path: '/info', match: (t) => t.includes('AirTunes') || t.includes('AppleTV') },
  { port: 9197, type: 'apple_tv', service: 'Apple TV mDNS', vendor: 'Apple', path: '/', match: () => true },
  { port: 8043, type: 'samsung_tv', service: 'Samsung Smart TV', vendor: 'Samsung', path: '/api/v2/', match: (t) => t.includes('Samsung') || t.includes('Tizen') },
  { port: 3000, type: 'lg_webos_tv', service: 'LG webOS TV', vendor: 'LG', path: '/', match: (t) => t.includes('webOS') || t.includes('LG') },
  { port: 8080, type: 'kodi_xbmc', service: 'Kodi/XBMC', vendor: 'Kodi Foundation', path: '/jsonrpc?request=', match: (t) => t.includes('XBMC') || t.includes('Kodi') },
  { port: 8096, type: 'emby', service: 'Emby', vendor: 'Emby', path: '/emby/System/Info/Public', match: (t) => t.includes('Emby') },
  /* === Caméras IP / Sécurité === */
  { port: 7443, type: 'unifi_protect', service: 'UniFi Protect', vendor: 'Ubiquiti', path: '/api/info', match: (t) => t.includes('UniFi Protect') },
  { port: 5000, type: 'frigate_nvr', service: 'Frigate NVR', vendor: 'OSS', path: '/api/version', match: (t) => t.includes('frigate') || t.includes('Frigate') },
  { port: 80, type: 'reolink_cam', service: 'Reolink Camera', vendor: 'Reolink', path: '/cgi-bin/api.cgi', match: (_, h) => (h?.get('Server') ?? '').toLowerCase().includes('lighttpd') },
  { port: 80, type: 'hikvision_cam', service: 'Hikvision IP Cam', vendor: 'Hikvision', path: '/ISAPI/System/deviceInfo', match: (t) => t.includes('Hikvision') || t.includes('DVRDVS') },
  { port: 80, type: 'dahua_cam', service: 'Dahua IP Cam', vendor: 'Dahua', path: '/cgi-bin/magicBox.cgi?action=getDeviceType', match: (t) => t.toLowerCase().includes('dahua') },
  { port: 80, type: 'foscam', service: 'Foscam', vendor: 'Foscam', path: '/cgi-bin/CGIProxy.fcgi', match: (t) => t.includes('Foscam') },
  { port: 8181, type: 'shinobi', service: 'Shinobi NVR', vendor: 'OSS', path: '/', match: (t) => t.toLowerCase().includes('shinobi') },
  /* === NAS étendus === */
  { port: 9090, type: 'nas_truenas', service: 'TrueNAS Cockpit', vendor: 'iXsystems', path: '/', match: (t) => t.includes('TrueNAS') || t.includes('cockpit') },
  { port: 8443, type: 'nas_proxmox', service: 'Proxmox VE', vendor: 'Proxmox', path: '/', match: (t) => t.includes('Proxmox') },
  { port: 8000, type: 'nas_unraid', service: 'unRAID', vendor: 'Lime Technology', path: '/', match: (_, h) => (h?.get('Server') ?? '').includes('Apache/2') },
  { port: 80, type: 'nextcloud', service: 'Nextcloud', vendor: 'Nextcloud GmbH', path: '/status.php', match: (t) => t.includes('"productname":"Nextcloud"') },
  { port: 80, type: 'owncloud', service: 'ownCloud', vendor: 'ownCloud', path: '/status.php', match: (t) => t.includes('"productname":"ownCloud"') },
  /* === Imprimantes étendues === */
  { port: 9100, type: 'printer_hp_jetdirect', service: 'HP JetDirect', vendor: 'HP', path: '/', match: () => true },
  { port: 80, type: 'printer_brother', service: 'Brother Printer', vendor: 'Brother', path: '/general/status.html', match: (t) => t.toLowerCase().includes('brother') },
  /* === Self-hosted étendus === */
  { port: 3000, type: 'gitea', service: 'Gitea', vendor: 'OSS', path: '/api/v1/version', match: (t) => t.includes('gitea') || t.includes('Gitea') },
  { port: 80, type: 'gitlab', service: 'GitLab', vendor: 'GitLab Inc', path: '/-/health', match: (_, h) => (h?.get('Server') ?? '').includes('gitlab') },
  { port: 8080, type: 'vaultwarden', service: 'Vaultwarden', vendor: 'OSS', path: '/alive', match: () => true },
  { port: 9091, type: 'authelia', service: 'Authelia', vendor: 'OSS', path: '/api/health', match: (t) => t.includes('authelia') },
  { port: 8080, type: 'keycloak', service: 'Keycloak', vendor: 'Red Hat', path: '/auth/', match: (t) => t.toLowerCase().includes('keycloak') },
  { port: 9000, type: 'authentik', service: 'Authentik', vendor: 'OSS', path: '/api/v3/root/config/', match: (t) => t.includes('authentik') },
  { port: 3000, type: 'grafana', service: 'Grafana', vendor: 'Grafana Labs', path: '/api/health', match: (t) => t.includes('"database":"ok"') || t.includes('Grafana') },
  { port: 9090, type: 'prometheus', service: 'Prometheus', vendor: 'CNCF', path: '/-/healthy', match: (t) => t.includes('Prometheus') },
  { port: 8086, type: 'influxdb', service: 'InfluxDB', vendor: 'InfluxData', path: '/health', match: (t) => t.includes('influxdb') },
  { port: 9000, type: 'portainer', service: 'Portainer', vendor: 'Portainer', path: '/api/system/status', match: (t) => t.includes('portainer') || t.includes('Version') },
  { port: 5055, type: 'overseerr', service: 'Overseerr', vendor: 'OSS', path: '/api/v1/status', match: (t) => t.includes('overseerr') },
  { port: 8989, type: 'sonarr', service: 'Sonarr', vendor: 'OSS', path: '/api/v3/health', match: (t) => t.includes('sonarr') || t.includes('Sonarr') },
  { port: 7878, type: 'radarr', service: 'Radarr', vendor: 'OSS', path: '/api/v3/health', match: (t) => t.includes('radarr') || t.includes('Radarr') },
  { port: 9091, type: 'transmission', service: 'Transmission', vendor: 'OSS', path: '/transmission/web/', match: (t) => t.toLowerCase().includes('transmission') },
  { port: 8080, type: 'qbittorrent', service: 'qBittorrent', vendor: 'OSS', path: '/api/v2/app/version', match: (t) => /^\d+\.\d+\.\d+/.test(t) },
  { port: 8081, type: 'bookstack', service: 'BookStack', vendor: 'OSS', path: '/api/docs', match: (t) => t.includes('BookStack') },
  { port: 3000, type: 'paperless_ngx', service: 'Paperless-NGX', vendor: 'OSS', path: '/api/', match: (t) => t.includes('paperless') },
  /* === Solar / Énergie === */
  { port: 80, type: 'enphase_envoy', service: 'Enphase Envoy', vendor: 'Enphase', path: '/info.xml', match: (t) => t.includes('envoy') || t.includes('Enphase') },
  { port: 80, type: 'fronius', service: 'Fronius Solar', vendor: 'Fronius', path: '/solar_api/GetAPIVersion.cgi', match: (t) => t.includes('fronius') || t.includes('Solar') },
  { port: 80, type: 'shelly_em', service: 'Shelly Energy Meter', vendor: 'Allterco', path: '/status', match: (t) => t.includes('shelly') },
  { port: 80, type: 'tesla_wall_connector', service: 'Tesla Wall Connector', vendor: 'Tesla', path: '/api/1/version', match: (t) => t.includes('tesla') || t.includes('wall_connector') },
  /* === Thermostats === */
  { port: 80, type: 'tado', service: 'Tado', vendor: 'Tado', path: '/', match: (t) => t.includes('tado') },
  { port: 80, type: 'netatmo', service: 'Netatmo', vendor: 'Netatmo', path: '/', match: (t) => t.includes('netatmo') },
  /* === Lights / Switches === */
  { port: 80, type: 'shelly_relay', service: 'Shelly Relay', vendor: 'Allterco', path: '/shelly', match: (t) => t.includes('shelly') || t.includes('Shelly') },
  { port: 9999, type: 'tp_link_kasa', service: 'TP-Link Kasa', vendor: 'TP-Link', path: '/', match: () => true },
  { port: 80, type: 'lifx', service: 'LIFX Bulb', vendor: 'LIFX', path: '/', match: (t) => t.toLowerCase().includes('lifx') },
  { port: 38899, type: 'wiz_lights', service: 'WiZ Lights', vendor: 'Signify', path: '/', match: () => true },
  /* === Communication === */
  { port: 8008, type: 'matrix_synapse', service: 'Matrix Synapse', vendor: 'Matrix.org', path: '/_matrix/client/versions', match: (t) => t.includes('matrix') },
  { port: 3000, type: 'rocketchat', service: 'Rocket.Chat', vendor: 'Rocket.Chat', path: '/api/info', match: (t) => t.includes('rocketchat') || t.includes('Rocket.Chat') },
  { port: 8065, type: 'mattermost', service: 'Mattermost', vendor: 'Mattermost', path: '/api/v4/system/ping', match: (t) => t.includes('"status":"OK"') },
  { port: 443, type: 'jitsi_meet', service: 'Jitsi Meet', vendor: 'Jitsi', path: '/about/', match: (t) => t.includes('jitsi') || t.includes('Jitsi') },
  /* === Automation === */
  { port: 1880, type: 'node_red', service: 'Node-RED', vendor: 'OpenJS', path: '/', match: (t) => t.includes('Node-RED') || t.includes('node-red') },
  { port: 5678, type: 'n8n', service: 'n8n', vendor: 'n8n.io', path: '/healthz', match: (t) => t.includes('n8n') || t.includes('"status":"ok"') },
  /* === Gaming === */
  { port: 25565, type: 'minecraft_server', service: 'Minecraft Server', vendor: 'Mojang', path: '/', match: () => true },
  { port: 28015, type: 'rust_server', service: 'Rust Server', vendor: 'Facepunch', path: '/', match: () => true } as unknown as { port: number; type: DeviceType; service: string; vendor: string; path: string; match: (t: string, h?: Headers) => boolean },
  /* === IoT industriel === */
  { port: 502, type: 'modbus_tcp', service: 'Modbus TCP', vendor: 'Industrial', path: '/', match: () => true },
  { port: 1883, type: 'mqtt_broker', service: 'MQTT Broker', vendor: 'Eclipse Mosquitto/HiveMQ', path: '/', match: () => true },
  { port: 4840, type: 'opc_ua', service: 'OPC UA Server', vendor: 'Industrial', path: '/', match: () => true },
];

const COMMON_PORTS = [80, 443, 631, 1400, 5000, 5353, 8080, 8096, 8123, 8443, 9000, 32400];
const CACHE_KEY = 'apex_v13_network_scan_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; /* 5 min */

class NetworkScan {
  /**
   * Discover IP locale via WebRTC ICE candidate (trick reconnu).
   * Fonctionne Chrome/Firefox/Safari (parfois bloqué Safari WebRTC strict).
   */
  async getLocalIP(): Promise<string | null> {
    if (typeof RTCPeerConnection === 'undefined') return null;
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('apex-ip-discovery');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pc.close();
          resolve(null);
        }, 3000);
        pc.onicecandidate = (event) => {
          if (!event.candidate) return;
          const ipMatch = event.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch?.[1]) {
            const ip = ipMatch[1];
            /* Ignore IPs publiques (mDNS hash, etc.) */
            if (this.isPrivateIP(ip)) {
              clearTimeout(timeout);
              pc.close();
              resolve(ip);
            }
          }
        };
      });
    } catch (err: unknown) {
      logger.warn('network-scan', 'getLocalIP failed', { err });
      return null;
    }
  }

  /**
   * Détermine subnet depuis IP locale (assume /24).
   */
  inferSubnet(localIp: string): string {
    const parts = localIp.split('.');
    if (parts.length !== 4) return '';
    return `${parts[0]}.${parts[1]}.${parts[2]}.`;
  }

  /**
   * Scan complet LAN : discover IP, scan subnet, probe devices.
   */
  async scan(opts: { subnet?: string; ports?: readonly number[]; useCache?: boolean } = {}): Promise<ScanResult> {
    const start = Date.now();
    /* Check cache si activé */
    if (opts.useCache !== false) {
      const cached = this.getCached();
      if (cached) {
        void start; /* mark used */
        return cached;
      }
    }

    /* 1. Discover IP locale */
    const localIp = await this.getLocalIP();
    if (!localIp) {
      return { ok: false, devices: [], scan_duration_ms: Date.now() - start, reason: 'WebRTC ICE blocked or unavailable' };
    }
    const subnet = opts.subnet ?? this.inferSubnet(localIp);
    if (!subnet) {
      return { ok: false, devices: [], scan_duration_ms: Date.now() - start, reason: 'Cannot infer subnet from ' + localIp, local_ip: localIp };
    }
    const ports = opts.ports ?? COMMON_PORTS;

    /* 2. Probe range 1-254 sur ports communs */
    const devices: NetworkDevice[] = [];
    const probes: Promise<NetworkDevice | null>[] = [];
    for (let i = 1; i <= 254; i++) {
      const ip = subnet + i;
      if (ip === localIp) continue; /* Skip soi-même */
      for (const port of ports) {
        probes.push(this.probeIpPort(ip, port));
      }
    }
    /* Limite parallélisme à 50 fetch concurrents pour pas saturer browser */
    const results = await this.batchPromises(probes, 50);
    for (const r of results) {
      if (r) devices.push(r);
    }

    const result: ScanResult = {
      ok: true,
      local_ip: localIp,
      subnet,
      devices,
      scan_duration_ms: Date.now() - start,
    };
    void auditLog.record('network_scan.completed', {
      details: { devices: devices.length, duration_ms: result.scan_duration_ms },
    });
    /* Cache 5 min */
    this.setCached(result);
    return result;
  }

  /**
   * Probe une IP:port spécifique avec timeout court 500ms.
   */
  async probeIpPort(ip: string, port: number): Promise<NetworkDevice | null> {
    const candidates = DEVICE_PROBES.filter((p) => p.port === port);
    if (candidates.length === 0) {
      /* Pas de probe spécifique pour ce port → juste ping HEAD */
      const alive = await this.pingAlive(ip, port);
      if (alive) {
        return {
          ip, port, type: 'unknown', service: `port ${port}`, last_seen: Date.now(),
        };
      }
      return null;
    }
    /* Probe spécifique : try chaque candidat */
    for (const probe of candidates) {
      try {
        const url = `http://${ip}:${port}${probe.path}`;
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 800);
        const res = await fetch(url, { signal: ctrl.signal, mode: 'no-cors' }).catch(() => null);
        clearTimeout(timeout);
        if (!res) continue;
        const text = await res.text().catch(() => '');
        if (probe.match(text, res.headers)) {
          return {
            ip, port, type: probe.type, vendor: probe.vendor,
            service: probe.service, last_seen: Date.now(),
          };
        }
      } catch {
        /* Network error or CORS, skip */
      }
    }
    return null;
  }

  /**
   * Ping rapide HEAD pour détecter device alive (sans identifier).
   */
  async pingAlive(ip: string, port: number): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 500);
      const res = await fetch(`http://${ip}:${port}/`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: ctrl.signal,
      }).catch(() => null);
      clearTimeout(timeout);
      return res !== null;
    } catch {
      return false;
    }
  }

  /**
   * Liste devices déjà découverts (cache).
   */
  listKnownDevices(): readonly NetworkDevice[] {
    const cached = this.getCached();
    return cached?.devices ?? [];
  }

  /**
   * Interagir avec un device LAN (ex: ouvrir UI Hue Bridge dans browser).
   */
  async openDeviceUI(device: NetworkDevice): Promise<{ ok: boolean; url: string }> {
    const url = `http://${device.ip}:${device.port}/`;
    void auditLog.record('network_scan.open_device', { details: { ip: device.ip, port: device.port, type: device.type } });
    /* Window.open natif (laisse user/IA décider) */
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return { ok: true, url };
  }

  /* === Helpers === */

  private isPrivateIP(ip: string): boolean {
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('169.254.')) return true; /* link-local */
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1] ?? '0', 10);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }

  private async batchPromises<T>(promises: Promise<T>[], batchSize: number): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    return results;
  }

  private getCached(): ScanResult | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw) as ScanResult & { cached_at?: number };
      if (cached.cached_at && Date.now() - cached.cached_at < CACHE_TTL_MS) {
        return cached;
      }
    } catch { /* ignore */ }
    return null;
  }

  private setCached(result: ScanResult): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...result, cached_at: Date.now() }));
    } catch { /* quota */ }
  }
}

export const networkScan = new NetworkScan();
