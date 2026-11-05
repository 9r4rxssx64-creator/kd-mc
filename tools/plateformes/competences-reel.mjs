/* LES COMPÉTENCES DU ROBOT « VÉRIFIER EN RÉEL » — un seul registre (Kevin 5.11.2026 : « Intègre toutes les compétences au robot pour faire toutes les vérifications réelles qu'on lui demande »).
 *
 * Avant : une dizaine de robots séparés (tests/verif-live-*.mjs, verifier-servi.mjs…), chacun avec son workflow ; une vérification demandée par Kevin pouvait
 * rester dans une branche sans jamais être relancée. Maintenant : UNE liste. Toute vérification réelle demandée par Kevin y a sa ligne (qui l'a demandée, quand,
 * ce qu'elle regarde, où elle tourne). Le lanceur (verifier-reel.mjs) les enchaîne ; le garde (tests/verify-verifier-reel.mjs) REFUSE qu'un nouveau
 * tests/verif-live-*.mjs existe sans sa ligne ici : on ne peut plus « oublier » une compétence.
 *
 * Champs :
 *   id        nom court, celui qu'on tape (--verifs departs-equipes,liens) ;
 *   titre     ce que Kevin comprend ;
 *   demande   la phrase de Kevin (ou son sens) et la date : POURQUOI cette compétence existe ;
 *   workflow  nom du workflow GitHub de cette vérification quand il n'est pas « verif-live-<id> » (departs-equipes → verif-live-equipes, servi → verifier-servi) ;
 *   script    le fichier lancé (node <script>) ; args = arguments facultatifs (fonction, résolue au lancement) ;
 *   lieu      'public' = dépôt kd-mc (gratuit, illimité, journal lu par tous : nombres seulement) · 'coffre' = dépôt privé (ration d'Actions, captures, données privées) ;
 *   essaiLocal  le script sait tourner sans réseau avec ESSAI_LOCAL=1 (domaine simulé) : sert à prouver le robot avant de le lancer pour de vrai ;
 *   noms      le script peut écrire un nom de collègue dans son détail d'échec : le lanceur masque « NOM I » dans tout journal (un dépôt public se lit par tous) ;
 *   minutes   délai maximal ; passé ce délai le lanceur coupe et note ❌ (jamais un robot suspendu) ;
 *   env       variables posées par le lanceur (SANS_NOMS=1 est toujours posé en plus). */

export const COMPETENCES = [
  { id: 'departs-equipes', titre: 'Toutes les équipes, chaque personne, chaque jour : départs affichés (light + CMCteams), décalages, collègue non-admin',
    demande: 'Kevin 7.10 « connecte-toi en admin comme moi, vérifie toutes les équipes, chaque personne » · 5.11 « il faut que ça décale… l\'algorithme n\'est pas bon » · 5.11 « retire Salomé Panidji des départs… horaires aménagés »',
    workflow: 'verif-live-equipes', script: 'tests/verif-live-equipes.mjs', lieu: 'public', essaiLocal: true, noms: true, minutes: 25 },
  { id: 'cadres', titre: 'Plannings des cadres (Pit Boss, Superviseurs) identiques au PDF, octobre et novembre',
    demande: 'Kevin 12.10 « intègre les plannings cadres… vérifie tout réellement ensuite »',
    script: 'tests/verif-live-cadres.mjs', lieu: 'coffre', essaiLocal: false, noms: true, minutes: 15 },
  { id: 'formats', titre: 'Les 5 formats d\'écran, la vitesse et le hors-ligne — CMCteams et light',
    demande: 'Kevin 22.10 « audit réel +++ team et light, ordinateur, iPhone, Android »',
    script: 'tests/verif-live-formats.mjs', lieu: 'public', essaiLocal: true, noms: false, minutes: 20 },
  { id: 'liens', titre: 'Tout est cliquable, on atterrit au bon endroit, chaque app a son bouton installer / notifications',
    demande: 'Kevin 22.10 « toutes les informations cliquables, au bon endroit » · « un bouton pour installer l\'application »',
    script: 'tests/verif-live-liens.mjs', lieu: 'public', essaiLocal: false, noms: false, minutes: 20 },
  { id: 'messages', titre: 'La boîte unique des messages (atterrissage, tri, aucune alerte dans « Tous »)',
    demande: 'Kevin 17.10 « connecte-toi réel comme moi » · 3.10 « la boîte unique »',
    script: 'tests/verif-live-messages.mjs', lieu: 'public', essaiLocal: true, noms: false, minutes: 10 },
  { id: 'admin-sans-code', titre: 'Connecté en admin : aucun code à retaper dans tout le domaine',
    demande: 'Kevin 21.10 « quand je me connecte avec Face ID, je n\'ai besoin d\'aucun code sur tout mon domaine »',
    script: 'tests/verif-live-admin-sans-code.mjs', lieu: 'public', essaiLocal: false, noms: false, minutes: 20 },
  { id: 'avatars', titre: 'Studio « Avatars & marionnettes » avec le vrai service d\'IA (visage fictif)',
    demande: 'Kevin 29.10 « réel toujours » sur le Studio Avatars',
    script: 'tests/verif-live-avatars.mjs', lieu: 'public', essaiLocal: true, noms: false, minutes: 20 },
  { id: 'studio-ia', titre: 'L\'IA du Studio Créa : vraies images rendues (cartoon, anime, instants)',
    demande: 'Kevin 25.10 « le rendu est vraiment dégueulasse… qualité professionnelle commerciale »',
    script: 'tests/verif-live-studio-ia.mjs', lieu: 'public', essaiLocal: true, noms: false, minutes: 15 },
  { id: 'servi', titre: 'Ce qui est SERVI sur toutes les adresses du domaine : version, Bee, pastille « ← Portail », débordement, petites cibles',
    demande: 'Kevin 25.10 « ne jamais être bloqué par la porte du domaine » · 29.10 « portrait ET paysage sur tous les appareils »',
    workflow: 'verifier-servi', script: 'tools/plateformes/verifier-servi.mjs', lieu: 'public', essaiLocal: false, noms: false, minutes: 40,
    env: { WEBKIT: '1', SERVI_ECRANS: 'portable,iphone-13' }, args: async () => (await import('./verif-affichage-domaine.mjs')).ADRESSES },
  { id: 'bee', titre: 'Bee : le test du domaine, « montre-moi l\'arbre de… », le bouton Ouvrir, l\'arbre qui s\'ouvre sur la bonne personne',
    demande: 'Kevin 17.10 « Javis ne peut pas me montrer l\'arbre… vérifie réel comme moi »',
    script: 'tests/verif-live-bee.mjs', lieu: 'coffre', essaiLocal: true, noms: true, minutes: 20 },
  { id: 'bee-partout', titre: 'Bee est présente dans TOUTES les apps et sait travailler sur n\'importe quel sujet',
    demande: 'Kevin 17.10 « vérifie que Bee est présente dans toutes mes applications, qu\'elle peut faire n\'importe quelle tâche »',
    script: 'tests/verif-live-bee-partout.mjs', lieu: 'coffre', essaiLocal: true, noms: true, minutes: 30 },
  { id: 'apex', titre: 'Apex connecté en admin : ouvre le chat tout seul, bonne version, rien ne se chevauche, le « Test » répond',
    demande: 'Kevin 16.10 « trouve une solution pour te connecter comme moi et vérifier à la place »',
    script: 'tests/verif-live-apex.mjs', lieu: 'coffre', essaiLocal: true, noms: true, minutes: 20 },
];

/* Fichiers tests/verif-live-*.mjs qui ne sont PAS des compétences, avec la raison (le garde refuse tout autre fichier absent du registre). */
export const EXCLUS = {
  'verif-live-rapport.mjs': 'ancien canal (rapport écrit dans le dépôt, 5.09) remplacé par les annotations ; plus lancé par aucun robot',
};

/* Groupes pratiques : --verifs departs | rapides | toutes */
export const GROUPES = {
  departs: ['departs-equipes'],
  rapides: ['messages', 'admin-sans-code', 'liens'],
};

export function nomWorkflow(c) { return c.workflow || 'verif-live-' + c.id; }
export function trouver(id) { return COMPETENCES.find((c) => c.id === id) || null; }
