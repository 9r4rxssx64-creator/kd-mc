#!/usr/bin/env node
// MCP Server Gmail — wrapper qui expose les fonctions de tools/integrations/gmail/client.js
// Variables env requises : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readRecentEmails, sendEmail, searchEmails, markAsRead } from "../../integrations/gmail/client.js";

const server = new Server({ name: "kdmc-gmail", version: "1.0.0" }, { capabilities: { tools: {} } });

const TOOLS = [
  { name: "gmail_read_recent", description: "Récupère les N derniers emails reçus", inputSchema: { type: "object", properties: { n: { type: "number", default: 10 } } } },
  { name: "gmail_send", description: "Envoyer un email", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, html: { type: "boolean", default: false } }, required: ["to", "subject", "body"] } },
  { name: "gmail_search", description: "Recherche Gmail (syntaxe: 'from:x subject:y')", inputSchema: { type: "object", properties: { query: { type: "string" }, max: { type: "number", default: 10 } }, required: ["query"] } },
  { name: "gmail_mark_read", description: "Marquer un email comme lu", inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] } },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let r;
    if (name === "gmail_read_recent") r = await readRecentEmails(args.n || 10);
    else if (name === "gmail_send") r = await sendEmail(args.to, args.subject, args.body, args.html);
    else if (name === "gmail_search") r = await searchEmails(args.query, args.max || 10);
    else if (name === "gmail_mark_read") r = await markAsRead(args.messageId);
    else throw new Error(`Tool inconnu : ${name}`);
    return { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `❌ ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error("[kdmc-gmail MCP] ready");
