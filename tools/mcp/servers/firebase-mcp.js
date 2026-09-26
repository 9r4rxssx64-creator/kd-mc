#!/usr/bin/env node
// MCP Server pour Firebase RTDB CMC Teams
// Expose des outils Claude pour lire/écrire les données CMC Teams
//
// Installation : ajoute dans ~/.claude/mcp_settings.json :
// {
//   "mcpServers": {
//     "kdmc-firebase": {
//       "command": "node",
//       "args": ["/home/user/CMCteams/tools/mcp/servers/firebase-mcp.js"],
//       "env": { "FB_URL": "https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app" }
//     }
//   }
// }

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const FB_URL = process.env.FB_URL || "https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app";
const FB_PATH = process.env.FB_PATH || "/cmcteams";

const server = new Server(
  { name: "kdmc-firebase", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Tools exposés
const TOOLS = [
  {
    name: "fb_get",
    description: "Lit une clé du Firebase RTDB CMC Teams (ex: cmc_e, cmc_ov, cmc_pw)",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "Nom de la clé Firebase" } },
      required: ["key"],
    },
  },
  {
    name: "fb_set",
    description: "Écrit dans une clé Firebase (admin uniquement)",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: ["object", "array", "string", "number", "boolean", "null"] },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "fb_get_employees",
    description: "Liste les 257 employés CMC Teams avec leur équipe et famille",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fb_get_planning",
    description: "Récupère le planning d'un mois (overrides) au format {empId: {jour: code}}",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "number" },
        month: { type: "number", description: "0-indexé : 0=janvier, 11=décembre" },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "fb_health",
    description: "Vérifie la santé Firebase + retourne stats globales (employés, mois, backups)",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "fb_get") return await call(args.key);
    if (name === "fb_set") return await callSet(args.key, args.value);
    if (name === "fb_get_employees") {
      const data = await fbGet("cmc_e");
      return ok(JSON.stringify({ count: data?.length || 0, employees: data?.slice(0, 50) }, null, 2));
    }
    if (name === "fb_get_planning") {
      const data = await fbGet("cmc_ov");
      const k = `${args.year}-${args.month}`;
      return ok(JSON.stringify(data?.[k] || {}, null, 2).slice(0, 8000));
    }
    if (name === "fb_health") {
      const all = await fbGet("");
      const e = all?.cmc_e || [];
      const ov = all?.cmc_ov || {};
      const backups = Object.keys(all || {}).filter((k) => k.startsWith("cmc_auto_backup_"));
      return ok(JSON.stringify({
        employees: e.length,
        monthsWithPlanning: Object.keys(ov).length,
        backupsCount: backups.length,
        lastBackup: backups.sort().pop() || "none",
      }, null, 2));
    }
    return err(`Tool inconnu : ${name}`);
  } catch (e) {
    return err(e.message);
  }
});

async function call(key) {
  const data = await fbGet(key);
  return ok(JSON.stringify(data, null, 2).slice(0, 8000));
}
async function callSet(key, value) {
  await fbSet(key, value);
  return ok(`✅ ${key} mis à jour`);
}
async function fbGet(key) {
  const url = key ? `${FB_URL}${FB_PATH}/${encodeURIComponent(key)}.json` : `${FB_URL}${FB_PATH}.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Firebase GET ${key}: HTTP ${r.status}`);
  return r.json();
}
async function fbSet(key, value) {
  const r = await fetch(`${FB_URL}${FB_PATH}/${encodeURIComponent(key)}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`Firebase PUT ${key}: HTTP ${r.status}`);
  return true;
}
function ok(text) { return { content: [{ type: "text", text }] }; }
function err(text) { return { content: [{ type: "text", text: `❌ ${text}` }], isError: true }; }

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[kdmc-firebase MCP] ready");
