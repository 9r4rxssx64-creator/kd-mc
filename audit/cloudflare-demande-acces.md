# Demande au support Cloudflare — récupérer l'accès au compte qui héberge kd-mc.com

**À n'envoyer que si l'attente ne suffit pas** (le blocage « trop de codes demandés »
retombe tout seul ; chaque nouvelle tentative le relance — cf. leçon #186).

**Où l'envoyer** : https://dash.cloudflare.com/?to=/:account/support
ou, sans être connecté : https://support.cloudflare.com → *Submit a request*.

---

## Ce que Cloudflare doit comprendre

| Élément | Valeur |
|---|---|
| Adresse du compte | `9r4rxssx64@privaterelay.appleid.com` |
| Méthode de connexion | **Sign in with GitHub** (OAuth) |
| Sous-domaine Workers | `9r4rxssx64.workers.dev` |
| Zone hébergée | `kd-mc.com` (18 custom domains) |
| Worker principal | `kdmc-router` |
| Blocage | le compte GitHub associé est **suspendu** → la connexion OAuth ne passe plus |
| Demande | pouvoir se connecter **sans GitHub** (mot de passe + code e-mail), et changer l'adresse du compte pour une adresse durable |

⚠️ **Ne PAS demander la suppression du compte ni son transfert** : les 18 sous-domaines
et le certificat SSL y sont provisionnés. On veut seulement **un second moyen d'entrer**.

---

## Texte à copier (anglais — support Cloudflare)

> **Subject: Locked out of my account — GitHub SSO no longer available**
>
> Hello,
>
> I own the Cloudflare account registered with the e-mail address
> `9r4rxssx64@privaterelay.appleid.com`. It hosts the zone **kd-mc.com** and its
> Workers subdomain is **9r4rxssx64.workers.dev** (main Worker: `kdmc-router`,
> serving 18 custom domains).
>
> The account was created using **Sign in with GitHub**. That GitHub account has
> since been suspended, so the OAuth sign-in no longer works and I cannot reach my
> dashboard. My websites are affected.
>
> I can receive e-mail at the account address (I received a Cloudflare verification
> code there today), so I can prove ownership.
>
> Could you please:
> 1. enable **e-mail + password** sign-in on this account, so it no longer depends
>    on GitHub, and
> 2. help me change the account e-mail to a permanent address I control.
>
> I am **not** asking to delete or transfer the account — the zone, the DNS records
> and the SSL certificates must stay exactly as they are.
>
> Thank you.

---

## Traduction (pour Kevin — ne pas envoyer)

> Bonjour,
>
> Je suis propriétaire du compte Cloudflare enregistré avec l'adresse
> `9r4rxssx64@privaterelay.appleid.com`. Il héberge le domaine **kd-mc.com** et son
> sous-domaine Workers est **9r4rxssx64.workers.dev** (Worker principal :
> `kdmc-router`, qui sert 18 sous-domaines).
>
> Le compte a été créé avec **« Se connecter avec GitHub »**. Ce compte GitHub est
> depuis suspendu : la connexion ne fonctionne plus et je n'accède plus à mon
> tableau de bord. Mes sites en sont affectés.
>
> Je reçois bien le courrier envoyé à l'adresse du compte (j'y ai reçu un code de
> vérification Cloudflare aujourd'hui), je peux donc prouver que le compte est à moi.
>
> Pourriez-vous : 1) activer la connexion **par mot de passe** sur ce compte pour
> qu'il ne dépende plus de GitHub, et 2) m'aider à changer l'adresse du compte pour
> une adresse permanente que je contrôle.
>
> Je ne demande **pas** la suppression ni le transfert du compte : le domaine, les
> enregistrements DNS et les certificats doivent rester tels quels.
>
> Merci.

---

## Si le support demande une preuve de propriété

Il demande en général **l'une** de ces choses — toutes sont à ta portée :

- l'**Account ID** (visible en bas de la page *Workers & Pages*, une fois connecté —
  donc pas disponible ici : le dire simplement) ;
- une **facture** ou un e-mail Cloudflare reçu à l'adresse du compte ;
- ajouter un **enregistrement DNS TXT** qu'ils dictent → impossible ici (le DNS est
  dans le compte bloqué) : le dire, ils passent alors au moyen suivant ;
- prouver le contrôle du **registrar** de `kd-mc.com` (là où le domaine a été acheté) —
  c'est la preuve la plus forte, et elle ne dépend ni de GitHub ni de Cloudflare.
