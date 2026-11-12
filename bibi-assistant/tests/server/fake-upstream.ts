// Faux fournisseurs d'IA et de voix, sur un vrai serveur HTTP local : on teste le vrai code réseau de Bibi.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type Mode = "ok" | "401" | "429" | "500" | "slow";

export interface Fake {
  url: string;
  mode: Record<string, Mode>;
  calls: { path: string; headers: IncomingMessage["headers"]; body: string }[];
  close(): Promise<void>;
}

async function lire(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const c of req) parts.push(c as Buffer);
  return Buffer.concat(parts).toString("utf8");
}

export async function demarrerFaux(): Promise<Fake> {
  const mode: Record<string, Mode> = { groq: "ok", gemini: "ok", openrouter: "ok", custom: "ok" };
  const calls: Fake["calls"] = [];
  const srv: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await lire(req);
    const path = req.url ?? "";
    calls.push({ path, headers: req.headers, body });
    const prov = path.split("/")[1] ?? "";
    const m = mode[prov] ?? "ok";
    const json = (code: number, o: unknown, h: Record<string, string> = {}) => {
      res.writeHead(code, { "content-type": "application/json", ...h });
      res.end(JSON.stringify(o));
    };
    if (m === "401") return json(401, { error: { message: "Invalid API Key" } });
    if (m === "429") return json(429, { error: { message: "Rate limit reached" } }, { "retry-after": "12" });
    if (m === "500") return json(500, { error: { message: "boom" } });

    const sse = (morceaux: string[], fmt: (t: string) => unknown, fin?: string) => {
      res.writeHead(200, { "content-type": "text/event-stream", "x-ratelimit-remaining-requests": "42" });
      let i = 0;
      const tick = () => {
        if (res.writableEnded) return;
        if (i < morceaux.length) {
          res.write(`data: ${JSON.stringify(fmt(morceaux[i++]!))}\n\n`);
          setTimeout(tick, m === "slow" ? 150 : 1);
        } else {
          if (fin) res.write(`data: ${fin}\n\n`);
          res.end();
        }
      };
      tick();
    };

    // --- OpenAI-compatible (groq, openrouter, custom)
    if (/^\/(groq|openrouter|custom)\/models/.test(path)) {
      const data =
        prov === "openrouter"
          ? [
              { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama free", pricing: { prompt: "0", completion: "0" } },
              { id: "openai/gpt-4o", name: "GPT-4o", pricing: { prompt: "0.0000025", completion: "0.00001" } },
            ]
          : [{ id: "llama-3.3-70b-versatile" }, { id: "whisper-large-v3" }, { id: "model-b" }];
      return json(200, { data }, { "x-ratelimit-limit-requests": "30" });
    }
    if (/^\/(groq|openrouter|custom)\/chat\/completions/.test(path)) {
      const b = JSON.parse(body || "{}") as { stream?: boolean; messages?: { content: string }[] };
      const dernier = b.messages?.at(-1)?.content ?? "";
      const texte = [`Bonjour `, `depuis `, prov, ` : `, dernier.slice(0, 40)];
      if (b.stream) return sse(texte, (t) => ({ choices: [{ delta: { content: t } }] }), "[DONE]");
      return json(200, { choices: [{ message: { content: texte.join("") } }] });
    }
    if (/^\/groq\/audio\/transcriptions/.test(path)) return json(200, { text: "bonjour bibi" });

    // --- Gemini
    if (/^\/gemini\/v1beta\/models\?/.test(path))
      return json(200, { models: [{ name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] }] });
    if (/^\/gemini\/v1beta\/models\/.+:streamGenerateContent/.test(path))
      return sse(["Salut ", "de ", "Gemini"], (t) => ({ candidates: [{ content: { parts: [{ text: t }] } }] }));
    if (/^\/gemini\/v1beta\/models\/.+:generateContent/.test(path))
      return json(200, { candidates: [{ content: { parts: [{ text: "Salut de Gemini" }] } }] });

    // --- Voix
    if (/^\/kokoro\/v1\/audio\/voices/.test(path)) return json(200, { voices: ["ff_siwis", "af_bella"] });
    if (/^\/kokoro\/v1\/audio\/speech/.test(path)) {
      res.writeHead(200, { "content-type": "audio/mpeg" });
      return res.end(Buffer.from("FAKEMP3"));
    }
    if (/^\/piper\/voices/.test(path)) return json(200, { "fr_FR-siwis-medium": {} });
    if (path === "/piper") {
      res.writeHead(200, { "content-type": "audio/wav" });
      return res.end(Buffer.from("FAKEWAV"));
    }
    if (/^\/eleven\/v1\/voices/.test(path)) return json(200, { voices: [{ voice_id: "v1", name: "Voix 1", labels: { language: "fr" } }] });
    if (/^\/eleven\/v1\/text-to-speech\//.test(path)) {
      res.writeHead(200, { "content-type": "audio/mpeg" });
      return res.end(Buffer.from("FAKEEL"));
    }
    json(404, { error: { message: "inconnu" } });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    mode,
    calls,
    close: () => new Promise((r) => { srv.closeAllConnections(); srv.close(() => r()); }),
  };
}
