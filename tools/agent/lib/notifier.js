// Notifications : Telegram (prioritaire, gratuit, instant) + Email (backup)

export async function notifyTelegram(cfg, text, opts = {}) {
  if (!cfg.TELEGRAM_BOT_TOKEN || !cfg.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: cfg.TELEGRAM_CHAT_ID,
    text: text.slice(0, 4096), // limite Telegram
    parse_mode: opts.parseMode || "HTML",
    disable_web_page_preview: true,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.warn("[notifier] Telegram error", r.status, txt.slice(0, 200));
  }
  return r.ok;
}

export async function notifyEmail(cfg, subject, body) {
  // Nécessite module Gmail chargé (setup.md dans /tools/integrations/gmail/)
  if (!cfg.GMAIL_REFRESH_TOKEN) return;
  try {
    const { sendEmail } = await import("../../integrations/gmail/client.js");
    return sendEmail(cfg.NOTIFY_EMAIL_TO, subject, body);
  } catch (e) {
    console.warn("[notifier] Email indisponible :", e.message);
  }
}

/**
 * Notifie admin sur tous les canaux configurés (Telegram + Email).
 * Priorité Telegram (instant), fallback email si Telegram down.
 */
export async function notifyAdmin(cfg, subject, body) {
  const results = await Promise.allSettled([
    notifyTelegram(cfg, `<b>${escapeHtml(subject)}</b>\n\n${escapeHtml(body).slice(0, 3900)}`),
    notifyEmail(cfg, subject, body),
  ]);
  return results;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
