/* CONSTRUIRE INSTALLER-LENOVO.cmd À PARTIR DE installer-lenovo.ps1 (25.09.2026)
 *
 * Kevin : « Trouve des solutions, crée » — après « Redonne-moi les tâches Lenovo ».
 * L'ancienne voie lui demandait d'ouvrir un Terminal administrateur et de TAPER deux
 * commandes. Un fichier .cmd se lance au DOUBLE-CLIC, et le script PowerShell qu'il
 * contient demande lui-même les droits administrateur : zéro chose à taper.
 *
 * Un seul fichier source (le .ps1) ; le .cmd est GÉNÉRÉ ici. La garde
 * tests/verify-runner-interrupteur.mjs échoue si les deux divergent — on ne peut
 * donc pas corriger l'un en oubliant l'autre (leçon #142 : une règle sans garde saute).
 *
 * Comment le .cmd marche (uniquement des mécanismes documentés, rien d'exotique) :
 *   1. cmd.exe lit l'en-tête (ASCII, fins de ligne CRLF — cmd est fragile avec LF seul) ;
 *   2. PowerShell recopie tout ce qui suit la ligne « :: PS1-DEBUT » dans un vrai .ps1
 *      (UTF-8 AVEC BOM : sans BOM, PowerShell 5.1 lit le français en ANSI → accents cassés) ;
 *   3. il lance ce .ps1 ; le .ps1 se relance lui-même en administrateur (fenêtre bleue) ;
 *   4. « exit /b » avant le marqueur : cmd ne lit JAMAIS la partie PowerShell.
 *
 * Usage : node tools/runner/construire-cmd.mjs   (puis commit des deux fichiers)
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const SOURCE = 'tools/runner/installer-lenovo.ps1';
export const CIBLE = 'tools/runner/INSTALLER-LENOVO.cmd';
export const MARQUEUR = ':: PS1-DEBUT';

const ENTETE = [
  '@echo off',
  ':: =====================================================================',
  '::  KDMC - INSTALLER-LENOVO.cmd : DOUBLE-CLIC, et c\'est tout.',
  '::',
  '::  Fichier GENERE par  node tools/runner/construire-cmd.mjs  a partir de',
  '::  tools/runner/installer-lenovo.ps1 (la source). Ne pas editer a la main :',
  '::  un test du depot echoue si les deux fichiers divergent.',
  '::',
  '::  Ce qu\'il fait : recopie la partie PowerShell (tout ce qui suit la ligne',
  '::  "' + MARQUEUR + '") dans un vrai fichier .ps1, puis le lance. Le script',
  '::  demande lui-meme les droits administrateur (fenetre bleue -> Oui).',
  '::  En-tete volontairement SANS accents : cmd.exe lit ce fichier en ANSI.',
  ':: =====================================================================',
  'setlocal',
  'set "PS=%PUBLIC%\\kdmc-installer-lenovo.ps1"',
  'if not defined PUBLIC set "PS=%TEMP%\\kdmc-installer-lenovo.ps1"',
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$l=[IO.File]::ReadAllLines(\'%~f0\');$i=[Array]::IndexOf($l,\'' + MARQUEUR + '\');if($i -lt 0){exit 2};[IO.File]::WriteAllLines(\'%PS%\',$l[($i+1)..($l.Length-1)],(New-Object Text.UTF8Encoding($true)))"',
  'if errorlevel 1 (',
  '  echo.',
  '  echo   Impossible de preparer le script ^(code %errorlevel%^). Fais une photo de cette fenetre et envoie-la a Claude.',
  '  pause',
  '  exit /b 1',
  ')',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"',
  'exit /b',
  MARQUEUR,
];

/** Le corps PowerShell tel qu'il doit apparaître dans le .cmd : sans BOM, lignes CRLF. */
export function corpsAttendu(ps1Texte) {
  return ps1Texte.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n').join('\r\n');
}

export function construire(ps1Texte) {
  return ENTETE.join('\r\n') + '\r\n' + corpsAttendu(ps1Texte);
}

if (process.argv[1] && process.argv[1].endsWith('construire-cmd.mjs')) {
  const ps1 = readFileSync(SOURCE, 'utf8');
  const cmd = construire(ps1);
  writeFileSync(CIBLE, cmd, 'utf8');
  console.log(`${CIBLE} écrit : ${Buffer.byteLength(cmd)} octets, ${cmd.split('\r\n').length} lignes CRLF`);
}
