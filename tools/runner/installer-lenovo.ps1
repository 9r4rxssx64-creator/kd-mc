# =============================================================================
#  KDMC — Le Lenovo devient la machine qui fait tourner les automatisations
#  (Kevin 2026-09-24 : « Un Lenovo de 5 ans max »)
#
#  POURQUOI CE FICHIER EXISTE
#  --------------------------
#  Depuis que le dépôt est privé, GitHub compte les minutes de SES machines :
#  2 000 par mois offertes, brûlées en 2 jours (mesuré). Une machine À NOUS est
#  illimitée et gratuite, même sur un dépôt privé — et c'est la configuration
#  que GitHub recommande pour un dépôt privé. Ce script transforme le Lenovo en
#  cette machine, en UNE exécution, sans rien à comprendre.
#
#  CE QU'IL FAIT, DANS L'ORDRE
#  ---------------------------
#   1. Empêche le Lenovo de s'endormir (branché, capot fermé ou non).
#   2. Installe WSL + Ubuntu (un vrai Linux dans Windows : nos 159 workflows
#      sont écrits pour Linux, pas pour Windows).
#   3. À l'intérieur d'Ubuntu : crée un utilisateur « runner », installe Node,
#      télécharge le programme officiel GitHub « actions-runner », l'enrôle sur
#      le dépôt avec le jeton que tu colles, et l'installe comme service qui
#      redémarre tout seul.
#   4. Programme le réveil du runner à chaque ouverture de session Windows.
#
#  CE QU'IL NE FAIT PAS
#  --------------------
#   · Il n'enregistre PAS le jeton : il ne sert qu'une fois, à l'enrôlement,
#     et expire en 1 heure. Après, le runner possède ses propres identifiants,
#     rangés dans Ubuntu, comme pour tout runner GitHub.
#   · Il ne touche à aucun fichier personnel de Kevin.
#
#  COMMENT LE LANCER (Kevin, pas à pas)
#  ------------------------------------
#   LA VOIE SIMPLE (25.09.2026) : télécharge INSTALLER-LENOVO.cmd (même dossier
#   que ce fichier, sur GitHub) et DOUBLE-CLIQUE dessus. Rien à taper : il
#   demande lui-même les droits administrateur (fenêtre bleue → « Oui »).
#   Le .cmd est GÉNÉRÉ à partir de ce fichier (node tools/runner/construire-cmd.mjs),
#   un test empêche que les deux divergent.
#
#   L'ANCIENNE VOIE (marche toujours) :
#   1. Clic droit sur le menu Démarrer → « Terminal (administrateur) »
#      (ou « Windows PowerShell (administrateur) »). Accepte la fenêtre bleue.
#   2. Tape exactement, puis Entrée :
#        Set-ExecutionPolicy Bypass -Scope Process -Force
#   3. Tape ensuite (adapte le chemin si le fichier n'est pas dans Téléchargements) :
#        & "$env:USERPROFILE\Downloads\installer-lenovo.ps1"
#
#   DANS LES DEUX CAS :
#   4. Le script te dira s'il faut REDÉMARRER (WSL l'exige la première fois).
#      Après le redémarrage, relance-le de la même façon : il reprend là où il
#      s'est arrêté.
#   5. Quand il demande le jeton, colle celui que GitHub t'a montré
#      (page « New self-hosted runner »), puis Entrée.
#
#  FAUT-IL LAISSER LE LENOVO ALLUMÉ ? (Kevin 25.09 : « Il faudra laisser l'ordi tjs allumé ? »)
#  ---------------------------------------------------------------------------
#   Une tâche ne tourne que si la machine est allumée — mais elle ATTEND :
#   GitHub garde une tâche en file jusqu'à 24 h si aucun runner n'est là, et ne
#   l'annule qu'après. Donc : allumé au moins une fois par jour = rien n'est
#   perdu. Écran éteint et capot fermé, c'est très bien (réglé ci-dessous).
#   Après une mise à jour Windows, la machine rouvre ta session toute seule
#   (verrouillée) pour que le runner reparte sans toi (réglage ARSO ci-dessous).
# =============================================================================

$ErrorActionPreference = 'Stop'
$Depot   = 'https://github.com/9r4rxssx64-creator/CMCteams'
$Distro  = 'Ubuntu'
$Etiquette = 'kdmc-lenovo'      # la même que dans la variable KDMC_RUNNER du dépôt

function Dire($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Bien($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Stop-Ici($t) { Write-Host ""; Write-Host "!!  $t" -ForegroundColor Yellow; Write-Host ""; exit 1 }

# ── 0. Administrateur ? Sinon on se relance soi-même avec la fenêtre bleue ──
$estAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
            ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $estAdmin) {
  # $PSCommandPath = le chemin de CE fichier quand il est lancé comme fichier (.cmd ou -File).
  # Vide si le texte a été collé dans une console : là, seule l'ancienne voie marche.
  if (-not $PSCommandPath) { Stop-Ici "Ouvre le Terminal en ADMINISTRATEUR (clic droit sur Démarrer) et relance." }
  Write-Host ""
  Write-Host "==> Il faut les droits administrateur : accepte la fenêtre bleue (« Oui »)." -ForegroundColor Cyan
  try {
    # -NoExit : la nouvelle fenêtre reste ouverte à la fin, pour que Kevin lise le résultat.
    Start-Process -FilePath 'powershell.exe' -Verb RunAs `
      -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -NoExit -File "{0}"' -f $PSCommandPath)
    exit 0
  } catch {
    Stop-Ici "La fenêtre bleue a été refusée : sans « Oui », rien ne peut être installé. Relance le fichier."
  }
}

# ── 1. Ne jamais s'endormir ─────────────────────────────────────────────────
Dire "Le Lenovo ne doit plus s'endormir quand il est branché"
powercfg /change standby-timeout-ac 0      | Out-Null
powercfg /change hibernate-timeout-ac 0    | Out-Null
powercfg /change monitor-timeout-ac 10     | Out-Null   # l'écran peut s'éteindre, pas la machine
# Capot fermé sur secteur = ne rien faire (0). Sur batterie on ne touche pas.
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null
Bien "veille désactivée sur secteur, capot fermé = la machine continue"

# ARSO (« Automatic Restart Sign-On », Microsoft) : après un redémarrage (mise à jour Windows,
# ou redémarrage tout court), Windows rouvre la dernière session TOUT SEUL, verrouillée. Sans ça,
# après une mise à jour nocturne, le Lenovo attendrait sur l'écran de connexion et le runner
# resterait éteint jusqu'à ce que quelqu'un tape le mot de passe.
#   DisableAutomaticRestartSignOn = 0 → ARSO actif ;
#   AutomaticRestartSignOnConfig  = 1 → « toujours », y compris sans BitLocker (un portable de
#   5 ans en a rarement ; sinon ARSO ne ferait rien). La session rouverte est VERROUILLÉE :
#   personne n'y entre sans le mot de passe. Aucun mot de passe n'est écrit nulle part.
# Source : learn.microsoft.com → « Winlogon automatic restart sign-on (ARSO) », clés vérifiées le 25.09.2026.
$pol = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
New-Item -Path $pol -Force | Out-Null
New-ItemProperty -Path $pol -Name DisableAutomaticRestartSignOn -PropertyType DWord -Value 0 -Force | Out-Null
New-ItemProperty -Path $pol -Name AutomaticRestartSignOnConfig  -PropertyType DWord -Value 1 -Force | Out-Null
Bien "après une mise à jour Windows, la session se rouvre toute seule (verrouillée) → le runner repart"

# ── 2. WSL + Ubuntu ─────────────────────────────────────────────────────────
Dire "Installation de WSL (Linux dans Windows)"
$wslOk = $false
try { $null = wsl.exe --status 2>&1; if ($LASTEXITCODE -eq 0) { $wslOk = $true } } catch {}
if (-not $wslOk) {
  # « --no-distribution » n'existe pas sur les Windows 10 les plus anciens : on retombe
  # alors sur l'installation simple (qui pose Ubuntu par défaut — ce qu'on veut de toute façon).
  wsl.exe --install --no-distribution
  if ($LASTEXITCODE -ne 0) { wsl.exe --install }
  Stop-Ici "WSL vient d'être installé : REDÉMARRE le Lenovo, puis relance ce script (étapes 1 à 3). Il reprendra ici."
}
Bien "WSL présent"

$distros = (wsl.exe --list --quiet 2>$null) -replace "`0",'' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($distros -notcontains $Distro) {
  Dire "Installation d'Ubuntu (quelques minutes, une seule fois)"
  wsl.exe --install -d $Distro --no-launch
  # Première initialisation sans question : on crée le compte root, le reste est fait plus bas.
  wsl.exe -d $Distro -u root -- true 2>$null
  if ($LASTEXITCODE -ne 0) { Stop-Ici "Ubuntu est installé mais pas encore prêt : REDÉMARRE, puis relance ce script." }
}
Bien "Ubuntu présent"

# systemd = le service du runner redémarre tout seul à l'intérieur d'Ubuntu
# Écrit avec des « \n » interprétés par printf : aucun vrai saut de ligne ne traverse la
# ligne de commande Windows → WSL (un saut de ligne dans un argument casse l'appel).
wsl.exe -d $Distro -u root -- bash -c "printf '[boot]\nsystemd=true\n' > /etc/wsl.conf"
wsl.exe --shutdown
Start-Sleep -Seconds 3
Bien "systemd activé dans Ubuntu"

# ── 3. Le jeton, une seule fois ─────────────────────────────────────────────
Dire "Le jeton d'enrôlement"
Write-Host "    Sur GitHub : Settings du dépôt → Actions → Runners → « New self-hosted runner »"
Write-Host "    Dans la page, repère la ligne qui commence par  ./config.sh --url ... --token"
Write-Host "    Colle ici UNIQUEMENT ce qui suit --token (ça commence par A, une trentaine de lettres) :"
$token = (Read-Host "    jeton").Trim()
if ($token.Length -lt 20) { Stop-Ici "Le jeton semble trop court. Recommence en copiant tout ce qui suit --token." }

# ── 4. Tout le travail Linux, embarqué ici pour n'avoir qu'UN fichier ───────
$linux = @'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
DEPOT="$1"; TOKEN="$2"; ETIQUETTE="$3"; NOM="$4"

echo "==> Paquets de base"
apt-get update -qq
apt-get install -y -qq curl git sudo ca-certificates unzip jq tar >/dev/null

echo "==> Utilisateur runner (sudo sans mot de passe : 5 workflows installent des paquets)"
id runner >/dev/null 2>&1 || useradd -m -s /bin/bash runner
echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner
chmod 440 /etc/sudoers.d/runner

echo "==> Node 20 (certains workflows appellent node sans setup-node)"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

echo "==> Programme officiel GitHub actions-runner (dernière version)"
VER=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')
# Sans version lisible (API muette, quota), l'adresse de téléchargement serait fausse :
# on s'arrête avec la cause, on ne télécharge pas « null ».
case "$VER" in ""|null) echo "ERREUR : impossible de lire la dernière version de actions-runner (réponse vide de api.github.com). Réessaie dans quelques minutes."; exit 1;; esac
ARCH=$(uname -m); case "$ARCH" in x86_64) A=x64;; aarch64) A=arm64;; *) echo "architecture inconnue $ARCH"; exit 1;; esac
D=/home/runner/actions-runner
if [ -f "$D/.runner" ]; then
  echo "    un runner est déjà enrôlé ici : on le retire proprement avant de ré-enrôler"
  (cd "$D" && ./svc.sh stop >/dev/null 2>&1 || true; ./svc.sh uninstall >/dev/null 2>&1 || true
   sudo -u runner ./config.sh remove --token "$TOKEN" >/dev/null 2>&1 || true)
fi
mkdir -p "$D"; chown runner:runner "$D"
cd "$D"
sudo -u runner curl -fsSL -o runner.tgz "https://github.com/actions/runner/releases/download/v${VER}/actions-runner-linux-${A}-${VER}.tar.gz"
sudo -u runner tar xzf runner.tgz && rm -f runner.tgz
./bin/installdependencies.sh >/dev/null 2>&1 || true

echo "==> Enrôlement sur $DEPOT"
sudo -u runner ./config.sh --unattended --replace \
  --url "$DEPOT" --token "$TOKEN" \
  --name "$NOM" --labels "$ETIQUETTE" --work _work

echo "==> Service (redémarre tout seul)"
./svc.sh install runner >/dev/null
./svc.sh start >/dev/null
sleep 3; ./svc.sh status | head -5 || true

echo "==> Navigateurs des tests (Playwright) — pré-installés pour gagner du temps"
sudo -u runner bash -lc 'cd ~ && npx --yes playwright@1.50.0 install-deps chromium >/dev/null 2>&1 && npx --yes playwright@1.50.0 install chromium >/dev/null 2>&1' || echo "    (facultatif, sera fait au premier besoin)"

echo "TERMINE_OK"
'@

Dire "Installation dans Ubuntu (5 à 15 minutes selon la connexion)"
$tmp = [IO.Path]::GetTempFileName()
[IO.File]::WriteAllText($tmp, ($linux -replace "`r`n","`n"), (New-Object Text.UTF8Encoding($false)))
$wslPath = (wsl.exe -d $Distro -u root -- wslpath -a ($tmp -replace '\\','/')).Trim()
$nom = "lenovo-" + ($env:COMPUTERNAME.ToLower())
$sortie = wsl.exe -d $Distro -u root -- bash "$wslPath" "$Depot" "$token" "$Etiquette" "$nom" 2>&1 | Tee-Object -Variable log
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
$token = $null
if (-not ($log -join "`n").Contains('TERMINE_OK')) {
  Stop-Ici "L'installation Linux n'est pas allée au bout. Copie les 30 dernières lignes ci-dessus et envoie-les à Claude."
}
Bien "runner enrôlé et démarré dans Ubuntu"

# ── 5. Réveil automatique à l'ouverture de session ──────────────────────────
Dire "Réveil automatique"
# « --exec sleep infinity » : pas de guillemets imbriqués à faire passer par schtasks,
# et un processus qui ne finit jamais = Ubuntu (donc le service du runner) reste debout.
$action  = "wsl.exe -d $Distro --exec sleep infinity"
schtasks.exe /create /f /tn "KDMC runner" /sc onlogon /rl highest /ru "$env:USERNAME" /tr $action | Out-Null
schtasks.exe /run /tn "KDMC runner" | Out-Null
Bien "à chaque ouverture de session Windows, Ubuntu (et donc le runner) se réveille"

Write-Host ""
Write-Host "  ✅ C'EST FAIT." -ForegroundColor Green
Write-Host "  Vérification : sur GitHub → Settings → Actions → Runners, la ligne « $nom » doit être « Idle » (vert)."
Write-Host "  Dernière chose : Settings → Secrets and variables → Actions → Variables → New repository variable :"
Write-Host "     Nom   : KDMC_RUNNER"
Write-Host "     Valeur: $Etiquette"
Write-Host "  À partir de là, les automatisations tournent sur ce Lenovo, gratuitement, dépôt privé."
Write-Host ""
