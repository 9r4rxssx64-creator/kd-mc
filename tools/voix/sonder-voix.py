#!/usr/bin/env python3
"""SONDER LES VOIX GRATUITES — chaque moteur, la même phrase, en vrai (Kevin 1.10.2026 : « améliore toutes les voix en
permanence en gratuit, niveau commercial professionnel »). Pour chaque moteur : statut HTTP, message d'erreur exact,
taille du son, temps de réponse ; le son est gardé dans voix-echantillons/ pour être écouté. N'appelle AUCUN moteur payant
au-delà de son palier gratuit (Chirp 3 HD : 1 M caractères/mois offerts ; Gemini TTS : palier gratuit ; MeloTTS : Workers AI
gratuit). Clés lues dans l'environnement, jamais écrites.  python3 tools/voix/sonder-voix.py"""
import base64, json, os, time, urllib.request, urllib.error, struct
PHRASE = ("Bonjour Kevin, ici Javis. Ta journée commence à quatorze heures, table trois. "
          "Ton équipe miroir est en repos demain : profite bien de ta soirée.")
OUT = "voix-echantillons"; os.makedirs(OUT, exist_ok=True)
G = os.environ.get("GEMINI_API_KEY", ""); CF = os.environ.get("CLOUDFLARE_API_TOKEN", ""); ACC = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")

def post(url, corps, entetes=None):
    req = urllib.request.Request(url, data=json.dumps(corps).encode(), headers={"content-type": "application/json", **(entetes or {})})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, r.read(), time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.read(), time.time() - t0
    except Exception as e: return 0, str(e).encode(), time.time() - t0

def wav_depuis_pcm(pcm, freq=24000):
    return b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, freq, freq * 2, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm

res = []
def note(nom, code, brut, dt, son=None, ext="mp3", detail=""):
    if son:
        open(f"{OUT}/{nom}.{ext}", "wb").write(son)
        res.append(f"{nom} : ✅ {len(son)//1024} Ko en {dt:.1f} s {detail}")
    else:
        msg = brut.decode("utf-8", "replace")
        try: msg = json.loads(msg).get("error", {}).get("message", msg)
        except Exception: pass
        res.append(f"{nom} : ❌ HTTP {code} — {str(msg)[:220]}")

# 1. Google Cloud Text-to-Speech (Chirp 3 HD, Neural2) avec la clé Google existante
for nom, voix in [("google-chirp3hd-homme", "fr-FR-Chirp3-HD-Charon"), ("google-chirp3hd-femme", "fr-FR-Chirp3-HD-Aoede"), ("google-neural2-femme", "fr-FR-Neural2-F")]:
    if not G: res.append(f"{nom} : clé absente"); continue
    c, b, dt = post("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + G,
                    {"input": {"text": PHRASE}, "voice": {"languageCode": "fr-FR", "name": voix}, "audioConfig": {"audioEncoding": "MP3"}})
    son = base64.b64decode(json.loads(b)["audioContent"]) if c == 200 else None
    note(nom, c, b, dt, son)
# 2. Gemini TTS (palier gratuit AI Studio)
for nom, voix in [("gemini-tts-kore", "Kore"), ("gemini-tts-charon", "Charon")]:
    if not G: res.append(f"{nom} : clé absente"); continue
    c, b, dt = post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=" + G,
                    {"contents": [{"parts": [{"text": "Dis chaleureusement, avec un ton professionnel : " + PHRASE}]}],
                     "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voix}}}}})
    son = None
    if c == 200:
        try: son = wav_depuis_pcm(base64.b64decode(json.loads(b)["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]))
        except Exception: son = None
    note(nom, c, b, dt, son, "wav")
# 3. MeloTTS (Cloudflare Workers AI, gratuit 10 000 neurones/jour) — la voix gratuite actuelle de secours
if CF and ACC:
    c, b, dt = post(f"https://api.cloudflare.com/client/v4/accounts/{ACC}/ai/run/@cf/myshell-ai/melotts", {"prompt": PHRASE, "lang": "fr"}, {"authorization": "Bearer " + CF})
    son = None
    if c == 200:
        try: son = base64.b64decode(json.loads(b)["result"]["audio"])
        except Exception: son = None
    note("cloudflare-melotts", c, b, dt, son)
else: res.append("cloudflare-melotts : jeton absent")
# 4. PAR LE ROUTEUR DU DOMAINE (la voix que les apps entendent vraiment) : MeloTTS par la liaison AI (`m=gratuite`),
#    Chirp 3 HD par le routeur (`m=chirp`). Le routeur n'accepte que les pages du domaine → Referer du domaine.
import urllib.parse
for nom, extra in [("routeur-voix-gratuite-melotts", "m=gratuite"), ("routeur-chirp3hd-homme", "m=chirp&v=onyx"), ("routeur-chirp3hd-femme", "m=chirp&v=nova")]:
    url = "https://lingua.kd-mc.com/__lingua/tts?" + extra + "&t=" + urllib.parse.quote(PHRASE)
    req = urllib.request.Request(url, headers={"Referer": "https://lingua.kd-mc.com/", "User-Agent": "Mozilla/5.0 sonde-voix"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            corps, ct, xv = r.read(), r.headers.get("content-type", ""), r.headers.get("x-voix", "")
            note(nom, r.status, corps, time.time() - t0, corps if ct.startswith("audio/") else None, "wav" if "wav" in ct else "mp3", "(x-voix " + xv + ")")
    except urllib.error.HTTPError as e: note(nom, e.code, e.read(), time.time() - t0)
    except Exception as e: note(nom, 0, str(e).encode(), time.time() - t0)
for l in res: print(l)
if os.environ.get("GITHUB_ACTIONS"): print("::notice title=Voix gratuites — sonde réelle::" + " ⏎ ".join(res))
