#!/usr/bin/env node
// MCP Server Telegram — wrapper de tools/integrations/telegram/client.js
// Variables env requises : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { sendMessage, sendPhoto, sendDocument } from "../../integrations/telegram/client.js";

const server = new Server({ name: "kdmc-telegram", version: "1.0.0" }, { capabilities: { tools: {} } });

const TOOLS = [
  { name: "telegram_send", description: "Envoyer un message Telegram à Kevin", inputSchema: { type: "object", properties: { text: { type: "string" }, parseMode: { type: "string", enum: ["HTML", "MarkdownV2"] } }, required: ["text"] } },
  { name: "telegram_send_photo", description: "Envoyer une photo (path local)", inputSchema: { type: "object", properties: { path: { type: "string" }, caption: { type: "string" } }, required: ["path"] } },
  { name: "telegram_send_doc", description: "Envoyer un document (ex: backup JSON)", inputSchema: { type: "object", properties: { path: { type: "string" }, caption: { type: "string" } }, required: ["path"] } },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let r;
    if (name === "telegram_send") r = await sendMessage(args.text, { parseMode: args.parseMode });
    else if (name === "telegram_send_photo") r = await sendPhoto(args.path, args.caption);
    else if (name === "telegram_send_doc") r = await sendDocument(args.path, args.caption);
    else throw new Error(`Tool inconnu : ${name}`);
    return { content: [{ type: "text", text: `✅ Telegram OK : ${name}` }] };
  } catch (e) {
    return { content: [{ type: "text", text: `❌ ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error("[kdmc-telegram MCP] ready");
