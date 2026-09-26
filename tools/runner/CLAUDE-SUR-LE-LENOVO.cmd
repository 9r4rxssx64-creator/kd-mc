@echo off
:: =====================================================================
::  KDMC - CLAUDE-SUR-LE-LENOVO.cmd : la porte pour que Claude travaille
::  SUR ce Lenovo, pilote depuis l'iPhone de Kevin (Remote Control).
::
::  Kevin, 25.09.2026 : "Il me semble que tu avais acces a mon Lenovo pour
::  faire seul." -> Non, jamais : une session cloud ne voit pas ton PC.
::  Ce fichier CREE cet acces, une fois pour toutes :
::   1. installe Claude Code (programme officiel Anthropic, sans admin) ;
::   2. te fait te connecter a TON compte claude.ai (navigateur, 1 clic) ;
::   3. lance "claude remote-control" : la session apparait dans l'app
::      Claude de ton iPhone (Code -> "Lenovo de Kevin", point vert) ;
::   4. programme le redemarrage automatique a chaque ouverture de session.
::  Rien n'est envoye a un tiers : Claude tourne ICI, sur ce Lenovo.
::  Aucun mot de passe, aucune cle n'est ecrit dans ce fichier.
::  Sans accents : cmd.exe lit ce fichier en ANSI.
::  Doc officielle : https://code.claude.com/docs/en/remote-control
:: =====================================================================
setlocal
set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
set "DOSSIER=%USERPROFILE%\kdmc"
if not exist "%DOSSIER%" mkdir "%DOSSIER%"
if exist "%CLAUDE%" goto :pret
echo.
echo   ==^> Installation de Claude Code (programme officiel, 1 a 2 minutes)
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"
if not exist "%CLAUDE%" (
  echo.
  echo   Claude Code n'est pas la ou il devrait etre. Fais une photo de cette fenetre et envoie-la a Claude.
  pause
  exit /b 1
)
:pret
cd /d "%DOSSIER%"
echo.
echo   ==^> PREMIERE FOIS : Claude va s'ouvrir. Connecte-toi a ton compte claude.ai
echo        dans le navigateur, accepte le dossier (trust), puis tape  /exit  et Entree.
echo.
pause
"%CLAUDE%"
echo.
echo   ==^> Reveil automatique a chaque ouverture de session Windows
> "%DOSSIER%\lancer-claude.cmd" echo @echo off
>> "%DOSSIER%\lancer-claude.cmd" echo if not "%%1"=="min" start /min "KDMC Claude" "%%~f0" min ^& exit /b
>> "%DOSSIER%\lancer-claude.cmd" echo cd /d "%DOSSIER%"
>> "%DOSSIER%\lancer-claude.cmd" echo "%CLAUDE%" remote-control --name "Lenovo de Kevin" --permission-mode acceptEdits
schtasks /create /f /tn "KDMC Claude" /sc onlogon /tr "\"%DOSSIER%\lancer-claude.cmd\"" >nul
if errorlevel 1 echo   (le reveil automatique n'a pas pu etre programme : Claude ne reviendra pas seul apres un redemarrage)
echo.
echo   ==^> Remote Control demarre. Reponds  y  a la question, puis LAISSE CETTE FENETRE OUVERTE.
echo        Sur ton iPhone : app Claude -^> Code -^> "Lenovo de Kevin" (icone ordinateur, point vert).
echo.
"%CLAUDE%" remote-control --name "Lenovo de Kevin" --permission-mode acceptEdits
pause
