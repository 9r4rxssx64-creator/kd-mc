#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Générateur des 3 PDF mémo remplissables pour Kevin.
- 01-secrets-github.pdf : tous les secrets GitHub + champ à remplir
- 02-liens-utiles.pdf   : dashboards/consoles/billing + champ note
- 03-liens-projets.pdf  : projets + repo + URL live

Champs AcroForm (remplissables sur iPhone/Mac). Aucune valeur secrète n'est
écrite : seulement les NOMS des secrets + des cases vides à remplir par Kevin.

Usage : python3 tools/memo-pdf/generate_pdfs.py
Sortie : coffre-fort/memo/*.pdf
"""
import os
# Mode "live" : passe à 1 quand kd-mc.com est déployé (kd-mc.com répond).
# Le workflow coffre-pdf-refresh.yml détecte le live et régénère avec COFFRE_PDF_LIVE=1.
LIVE = os.environ.get("COFFRE_PDF_LIVE") == "1"
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------- thème
GOLD = HexColor("#e8b830")
BG = HexColor("#0b1409")
CARD = HexColor("#13251a")
TEXT = HexColor("#f1efe6")
MUTED = HexColor("#9bb0a2")
LINK = HexColor("#7fc7ff")
FIELD_BG = HexColor("#ffffff")
FIELD_BORDER = HexColor("#c9a227")

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "coffre-fort", "memo")
OUT_DIR = os.path.abspath(OUT_DIR)


# ---------------------------------------------------------------- données
SECRETS = [
    ("IA / Modèles (LLM)", [
        "ANTHROPIC_API_KEY", "OPEN_AI_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY",
        "MISTRAL_API_KEY", "COHERE_API_KEY", "XAI_API_KEY", "TOGETHER_API_KEY",
        "PERPLEXITI_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY",
    ]),
    ("Infrastructure / CI-CD", [
        "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "RAILWAY_TOKEN",
        "APEX_GITHUB_PAT", "GH_TOKEN", "AGENT_SECRET", "AGENT_SECRET_VERCEL",
        "SEMGREP_APP_TOKEN",
    ]),
    ("Firebase / Authentification", [
        "FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL", "FIREBASE_WEB_API_KEY",
        "APEX_ADMIN_PIN_SHA256", "APEX_ADMIN_PIN_SHA", "JWT_SECRET",
    ]),
    ("Push / Messagerie", [
        "VAPID_PRIVATE_KEY", "PUSH_ADMIN_TOKEN", "AX_PUSH_ADMIN_TOKEN",
        "AX_VAPID_PUBLIC", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
        "VONAGE_API_KEY", "VONAGE_API_SECRET", "EMAILJS_PRIVATE_KEY",
    ]),
    ("YouTube / Réseaux sociaux", [
        "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN",
        "GOOGLE_AI_API_KEY",
    ]),
    ("Données / Analytics", [
        "TAVILY_API_KEY", "FINNHUB_API_KEY", "PEXELS_API_KEY", "PINECONE_API_KEY",
    ]),
    ("iOS Build / App Store", [
        "APPLE_CERT_P12_BASE64", "APPLE_CERT_P12_PASSWORD",
        "APPLE_PROVISIONING_PROFILE_BASE64", "APPLE_TEAM_ID",
        "APPSTORE_API_KEY_ID", "APPSTORE_API_ISSUER_ID", "APPSTORE_API_KEY_BASE64",
    ]),
    ("Autres services", [
        "PRINTIFY_API_KEY", "API_OPEN_LEGO",
    ]),
]

LINKS = [
    ("Anthropic (Claude)", "https://console.anthropic.com/settings/keys", "Clés API + quota/billing"),
    ("OpenAI", "https://platform.openai.com/account/billing", "Billing + clés"),
    ("Google AI Studio (Gemini)", "https://aistudio.google.com/app/apikey", "Clé Gemini (free tier)"),
    ("OpenRouter", "https://openrouter.ai/keys", "Failover multi-modèles"),
    ("Groq", "https://console.groq.com/keys", "Inference rapide gratuite"),
    ("Mistral", "https://console.mistral.ai/api-keys/", "Clé API Mistral"),
    ("DeepSeek", "https://platform.deepseek.com/api_keys", "Clé API DeepSeek"),
    ("Perplexity", "https://www.perplexity.ai/settings/api", "Clé API Perplexity"),
    ("Together AI", "https://api.together.xyz/settings/api-keys", "Clé API Together"),
    ("Cohere", "https://dashboard.cohere.com/api-keys", "Clé API Cohere"),
    ("xAI (Grok)", "https://console.x.ai", "Clé API xAI"),
    ("ElevenLabs", "https://elevenlabs.io/app/settings/api-keys", "Synthèse vocale"),
    ("Cloudflare — Tokens", "https://dash.cloudflare.com/profile/api-tokens", "API tokens"),
    ("Cloudflare — Workers", "https://dash.cloudflare.com/?to=/:account/workers/overview", "Workers + R2 + logs"),
    ("GitHub — Secrets repo", "https://github.com/9r4rxssx64-creator/cmcteams/settings/secrets/actions", "Ajouter/modifier les secrets"),
    ("GitHub — Tokens (PAT)", "https://github.com/settings/tokens", "Personal access tokens"),
    ("GitHub — Actions", "https://github.com/9r4rxssx64-creator/cmcteams/actions", "Workflows + runs"),
    ("Firebase Console (CMCteams)", "https://console.firebase.google.com/project/cmcteams-c16ab", "RTDB, règles, auth"),
    ("Google Cloud Console", "https://console.cloud.google.com", "APIs, OAuth, projets"),
    ("YouTube API (credentials)", "https://console.cloud.google.com/apis/credentials", "OAuth + refresh token"),
    ("Railway", "https://railway.app/dashboard", "Déploiements backend"),
    ("Vercel", "https://vercel.com/dashboard", "Déploiements / agent"),
    ("Telegram BotFather", "https://t.me/BotFather", "Création bot + token"),
    ("Tavily Search", "https://app.tavily.com/home", "Web search API"),
    ("Finnhub", "https://finnhub.io/dashboard", "Données financières"),
    ("Pexels", "https://www.pexels.com/api/", "Photos stock"),
    ("Pinecone", "https://app.pinecone.io", "Vector DB (mémoire)"),
    ("Notion", "https://www.notion.so/my-integrations", "Intégrations API"),
    ("Printify", "https://app.printify.com", "Print-on-demand (La Détente)"),
    ("Vonage", "https://dashboard.nexmo.com/settings", "SMS API"),
    ("EmailJS", "https://dashboard.emailjs.com/admin", "Emails transactionnels"),
]

# Domaine kd-mc.com (Cloudflare Registrar, 2026-06-06). Belle adresse par projet.
# (name, version, repo, nouvelle_adresse_kd-mc, ancienne_adresse, extra)
PROJECTS = [
    ("Accueil KDMC (portfolio)", "v1.0",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/kdmc-home",
     "https://kd-mc.com", "(nouvelle page d'accueil)",
     "www.kd-mc.com pointe aussi ici"),
    ("CMCteams (planning casino)", "v9.78x",
     "https://github.com/9r4rxssx64-creator/cmcteams",
     "https://cmcteams.kd-mc.com", "https://9r4rxssx64-creator.github.io/CMCteams/",
     "Firebase : cmcteams-c16ab (RTDB europe-west1)"),
    ("APEX AI v13 (orchestrateur)", "v13.4.x",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/apex-ai/v13",
     "https://apex-ai.kd-mc.com", "https://9r4rxssx64-creator.github.io/CMCteams/apex-ai-v13/",
     "v12 legacy : .../apex-ai/"),
    ("Apex Chat (messagerie)", "v1.1.x",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/messaging-app",
     "https://apex-chat.kd-mc.com", "https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/", ""),
    ("La Détente (boutique textile)", "v1.11.0",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/shops/la-detente",
     "https://la-detente.kd-mc.com", "https://9r4rxssx64-creator.github.io/CMCteams/shops/la-detente/",
     "Studio : .../studio.html"),
    ("Chez Lolo (boutique)", "v1.11.0",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/shops/chez-lolo",
     "https://chez-lolo.kd-mc.com", "https://9r4rxssx64-creator.github.io/CMCteams/shops/chez-lolo/", ""),
    ("e-KDMC (hub boutiques)", "v1.11",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/shops",
     "(via kd-mc.com)", "https://9r4rxssx64-creator.github.io/CMCteams/shops/index.html", ""),
    ("iRemoteHub (télécommande)", "v0.1",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/iRemoteHub",
     "(à brancher)", "https://9r4rxssx64-creator.github.io/CMCteams/iRemoteHub/", ""),
    ("Social Video Pipeline (auto-publish)", "v1.0",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/tools/social",
     "(CI/CD)", "(GitHub Actions uniquement)", ""),
    ("Coffre-fort perso", "v1.0",
     "https://github.com/9r4rxssx64-creator/cmcteams/tree/main/coffre-fort",
     "(à brancher)", "https://9r4rxssx64-creator.github.io/CMCteams/coffre-fort/", ""),
]

# Cartographie kd-mc.com (source : KDMC_ADRESSES.md). (belle_adresse, cible, type)
KDMC_SITES = [
    ("https://kd-mc.com", "Accueil — portfolio des projets"),
    ("https://cmcteams.kd-mc.com", "CMCteams — planning casino"),
    ("https://apex-ai.kd-mc.com", "Apex AI v13 — assistant"),
    ("https://apex-chat.kd-mc.com", "Apex Chat — messagerie"),
    ("https://la-detente.kd-mc.com", "La Détente — boutique textile"),
    ("https://chez-lolo.kd-mc.com", "Chez Lolo — boutique"),
]
KDMC_SERVERS = [
    ("https://api.kd-mc.com", "apex-v13-backend.9r4rxssx64.workers.dev"),
    ("https://chat-api.kd-mc.com", "apex-chat-api.9r4rxssx64.workers.dev"),
    ("https://push.kd-mc.com", "apex-push-worker.9r4rxssx64.workers.dev"),
    ("https://auth.kd-mc.com", "apex-auth-worker.9r4rxssx64.workers.dev"),
    ("https://secrets.kd-mc.com", "apex-secrets-proxy.9r4rxssx64.workers.dev"),
    ("https://vault.kd-mc.com", "apex-vault-svc.9r4rxssx64.workers.dev"),
]


# ---------------------------------------------------------------- helpers dessin
class Doc:
    def __init__(self, path, title, subtitle):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle(title)
        self.title = title
        self.subtitle = subtitle
        self.field_n = 0
        self._new_page(first=True)

    def _bg(self):
        self.c.setFillColor(BG)
        self.c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    def _header(self, first):
        c = self.c
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 17 if first else 12)
        c.drawString(MARGIN, PAGE_H - MARGIN - (4 if first else 0), self.title)
        if first:
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 9.5)
            c.drawString(MARGIN, PAGE_H - MARGIN - 18, self.subtitle)
        self.y = PAGE_H - MARGIN - (38 if first else 22)

    def _footer(self):
        c = self.c
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.5)
        c.drawString(MARGIN, 10 * mm, "Mémo perso Kevin — confidentiel, ne pas partager.  Coffre-fort : 9r4rxssx64-creator.github.io/CMCteams/coffre-fort/")
        c.drawRightString(PAGE_W - MARGIN, 10 * mm, "Page %d" % self.c.getPageNumber())

    def _new_page(self, first=False):
        if not first:
            self._footer()
            self.c.showPage()
        self._bg()
        self._header(first)

    def ensure(self, need):
        if self.y - need < 22 * mm:
            self._new_page()

    def section(self, label):
        self.ensure(16 * mm)
        c = self.c
        self.y -= 6
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 11.5)
        c.drawString(MARGIN, self.y - 8, label)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.6)
        c.line(MARGIN, self.y - 12, PAGE_W - MARGIN, self.y - 12)
        self.y -= 22

    def field_row(self, name, label_font=("Courier-Bold", 9.5), field_w=70 * mm):
        """Ligne : libellé (gauche) + champ AcroForm remplissable (droite)."""
        row_h = 13 * mm
        self.ensure(row_h)
        c = self.c
        # carte
        c.setFillColor(CARD)
        c.roundRect(MARGIN, self.y - row_h + 3, CONTENT_W, row_h - 3, 4, fill=1, stroke=0)
        # libellé
        c.setFillColor(TEXT)
        c.setFont(*label_font)
        c.drawString(MARGIN + 6, self.y - 8, name)
        # champ
        self.field_n += 1
        fx = PAGE_W - MARGIN - field_w - 5
        fy = self.y - row_h + 6
        c.acroForm.textfield(
            name="f%d_%s" % (self.field_n, _slug(name)),
            tooltip="Valeur : %s" % name,
            x=fx, y=fy, width=field_w, height=8.5 * mm,
            borderColor=FIELD_BORDER, fillColor=FIELD_BG,
            textColor=HexColor("#111111"), fontSize=9,
            borderWidth=0.8, forceBorder=True,
        )
        self.y -= row_h + 2

    def link_row(self, name, url, note):
        row_h = 17 * mm
        self.ensure(row_h)
        c = self.c
        c.setFillColor(CARD)
        c.roundRect(MARGIN, self.y - row_h + 3, CONTENT_W, row_h - 3, 4, fill=1, stroke=0)
        c.setFillColor(TEXT)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(MARGIN + 6, self.y - 9, name)
        # lien cliquable
        c.setFillColor(LINK)
        c.setFont("Helvetica", 8)
        url_disp = url if len(url) < 78 else url[:75] + "…"
        c.drawString(MARGIN + 6, self.y - 21, url_disp)
        c.linkURL(url, (MARGIN + 6, self.y - 24, PAGE_W - MARGIN - 6, self.y - 14), relative=0)
        if note:
            c.setFillColor(MUTED)
            c.setFont("Helvetica-Oblique", 7.5)
            c.drawRightString(PAGE_W - MARGIN - 8, self.y - 9, note)
        self.y -= row_h + 1.5

    def project_row(self, name, ver, repo, newaddr, old, extra):
        row_h = 34 * mm
        self.ensure(row_h)
        c = self.c
        c.setFillColor(CARD)
        c.roundRect(MARGIN, self.y - row_h + 3, CONTENT_W, row_h - 3, 5, fill=1, stroke=0)
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(MARGIN + 7, self.y - 10, name)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawRightString(PAGE_W - MARGIN - 8, self.y - 10, ver)
        # nouvelle adresse kd-mc.com (vedette)
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(MARGIN + 7, self.y - 22, "Adresse :")
        c.setFillColor(LINK if newaddr.startswith("http") else MUTED)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(MARGIN + 46, self.y - 22, newaddr)
        if newaddr.startswith("http"):
            c.linkURL(newaddr, (MARGIN + 46, self.y - 24.5, PAGE_W - MARGIN - 6, self.y - 19), relative=0)
        c.setFillColor(GOLD if LIVE else MUTED); c.setFont("Helvetica-Oblique", 6.5)
        c.drawRightString(PAGE_W - MARGIN - 8, self.y - 22, "en ligne" if LIVE else "bientôt en ligne")
        # ancienne adresse (valide)
        c.setFillColor(TEXT); c.setFont("Helvetica-Bold", 7)
        c.drawString(MARGIN + 7, self.y - 31, "Ancienne :" if LIVE else "Actuelle :")
        c.setFillColor(LINK if old.startswith("http") else MUTED); c.setFont("Helvetica", 6.8)
        c.drawString(MARGIN + 45, self.y - 31, old if len(old) < 86 else old[:83] + "…")
        if old.startswith("http"):
            c.linkURL(old, (MARGIN + 45, self.y - 33, PAGE_W - MARGIN - 6, self.y - 28), relative=0)
        # repo
        c.setFillColor(MUTED); c.setFont("Helvetica", 6.5)
        c.drawString(MARGIN + 7, self.y - 39.5, "Code: " + (repo[:92] if len(repo) < 92 else repo[:89] + "…"))
        c.linkURL(repo, (MARGIN + 7, self.y - 41.5, PAGE_W - MARGIN - 6, self.y - 36.5), relative=0)
        self.y -= row_h + 2

    def addr_row(self, addr, target):
        row_h = 14 * mm
        self.ensure(row_h)
        c = self.c
        c.setFillColor(CARD)
        c.roundRect(MARGIN, self.y - row_h + 3, CONTENT_W, row_h - 3, 4, fill=1, stroke=0)
        c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 9.5)
        c.drawString(MARGIN + 7, self.y - 9, addr)
        if addr.startswith("http"):
            c.linkURL(addr, (MARGIN + 7, self.y - 11.5, MARGIN + 240, self.y - 5), relative=0)
        c.setFillColor(MUTED); c.setFont("Helvetica", 7.5)
        c.drawString(MARGIN + 7, self.y - 19, "-> " + target)
        self.y -= row_h + 1.5

    def save(self):
        self._footer()
        self.c.save()


def _slug(s):
    return "".join(ch if ch.isalnum() else "_" for ch in s)[:40]


# ---------------------------------------------------------------- build
def build_secrets():
    d = Doc(os.path.join(OUT_DIR, "01-secrets-github.pdf"),
            "Secrets GitHub — mémo valeurs",
            "Colle la valeur de chaque secret à côté de son nom. Noms écrits à l'identique (typos incluses).")
    total = 0
    for cat, items in SECRETS:
        d.section(cat)
        for name in items:
            d.field_row(name)
            total += 1
    d.save()
    return total


def build_links():
    d = Doc(os.path.join(OUT_DIR, "02-liens-utiles.pdf"),
            "Liens utiles — tous projets",
            "Dashboards, consoles, billing. Liens cliquables. Note ton login/quota à droite.")
    d.section("Consoles & dashboards")
    for name, url, note in LINKS:
        d.link_row(name, url, note)
    d.save()
    return len(LINKS)


def build_projects():
    d = Doc(os.path.join(OUT_DIR, "03-liens-projets.pdf"),
            "Projets — adresses kd-mc.com & code",
            ("Adresses kd-mc.com EN LIGNE + ancienne (redirige) + dépôt. Liens cliquables." if LIVE
             else "Nouvelles belles adresses (kd-mc.com) + adresse actuelle (valide) + dépôt. Liens cliquables."))
    d.section("Projets actifs")
    for p in PROJECTS:
        d.project_row(*p)
    d.save()
    return len(PROJECTS)


def build_addresses():
    d = Doc(os.path.join(OUT_DIR, "04-adresses-kdmc.pdf"),
            "Adresses kd-mc.com — cartographie",
            ("Domaine kd-mc.com EN LIGNE (Cloudflare). 1 belle adresse par projet." if LIVE
             else "Domaine kd-mc.com (Cloudflare Registrar). 1 belle adresse par projet. Anciennes adresses encore valides."))
    d.section("Sites (une adresse par projet)")
    for a, t in KDMC_SITES:
        d.addr_row(a, t)
    d.section("Serveurs / API (coulisses, optionnel)")
    for a, t in KDMC_SERVERS:
        d.addr_row(a, t)
    return d.save() or (len(KDMC_SITES) + len(KDMC_SERVERS))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    n1 = build_secrets()
    n2 = build_links()
    n3 = build_projects()
    build_addresses()
    n4 = len(KDMC_SITES) + len(KDMC_SERVERS)
    print("OK -> %s" % OUT_DIR)
    print("  01-secrets-github.pdf : %d secrets" % n1)
    print("  02-liens-utiles.pdf   : %d liens" % n2)
    print("  03-liens-projets.pdf  : %d projets (adresses kd-mc.com)" % n3)
    print("  04-adresses-kdmc.pdf  : %d adresses" % n4)


if __name__ == "__main__":
    main()
