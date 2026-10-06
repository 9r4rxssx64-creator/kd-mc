/* « CETTE PERSONNE EST-ELLE DANS LA BANQUE OU LES IMPORTS ? » — même règle que le domaine
 * (services/kdmc-router/membre-planning.js), recopiée ici : chaque worker se déploie seul.
 * Parité verrouillée par test (test/cmc-recreer.test.mjs). Noms au format SBM : « NOM I » ou « NOM IJ »
 * (initiale du prénom), ou nom seul. Accents, tirets et casse ignorés. Fonction pure. */
const normal = (s) => String(s || "").normalize("NFD").replaceAll(/\p{M}/gu, "").toUpperCase().replaceAll(/[^A-Z]+/g, " ").trim();

/* 6.10 (Kevin : « un collègue n'arrive pas à se connecter, vérifie pour tout le monde ») — MESURÉ sur les 254 personnes du
   planning : (1) les prénoms composés sont notés par LEURS INITIALES (« DUPONT JP » = Jean-Pierre, exemple fictif) : 6 personnes
   (JP, PJ, JC, JF, JL, GM) étaient refusées, « JEANPIERRE » ne commençant pas par « JP » ; (2) prénom et nom tapés dans les
   mauvaises cases (un nom de famille tapé dans Prénom) étaient refusés — la règle est : l'ordre ne compte jamais. */
const initialesDe = (p) => normal(p).split(" ").filter(Boolean).map((m) => m[0]).join("");
function memeIdentiteDansCetOrdre(mots, nom, prenom) {
  const n = normal(nom), p = normal(prenom).replaceAll(" ", "");
  if (n.length < 2 || p.length < 2) return false;
  const dernier = mots.length > 1 ? mots.at(-1) : "";
  const initiale = dernier.length <= 3 ? dernier : "";
  const famille = (initiale ? mots.slice(0, -1) : mots).join("");
  if (famille !== n.replaceAll(" ", "")) return false;
  return !initiale || p.startsWith(initiale) || initialesDe(prenom).startsWith(initiale);
}
export function memeIdentite(nomSbm, nom, prenom) {
  const mots = normal(nomSbm).split(" ").filter(Boolean);
  if (!mots.length) return false;
  return memeIdentiteDansCetOrdre(mots, nom, prenom) || memeIdentiteDansCetOrdre(mots, prenom, nom);
}

/* La banque des employés (cmcteams/cmc_e : tableau ou objet) contient-elle ce matricule avec ce nom ? */
/* 6.10 soir : la banque range les gens sous un numéro INTERNE (U00…), pas sous leur vrai matricule SBM → c'est le NOM qui
   identifie (même règle que le domaine) ; le matricule tapé, bien écrit, devient celui du compte. */
export function dansLaBanque(employes, matricule, nom, prenom) {
  const liste = Array.isArray(employes) ? employes : Object.values(employes || {});
  if (!/^U\d{3,6}$/.test(String(matricule || ""))) return false;
  return liste.some((e) => e && memeIdentite(e.name, nom, prenom));
}
