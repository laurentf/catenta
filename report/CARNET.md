# Carnet de projet — Catenta

**Laurent Bonnet · RS6515 · Développer une application décentralisée avec les technologies blockchain**
Dépôt : https://github.com/laurentf/catenta

---

> **Comment utiliser ce fichier.** Une section par slide du carnet PowerPoint, dans l'ordre et avec la même numérotation (slides 3 à 17). Le canevas demande d'être « précis et concis » et de respecter l'espace disponible : le corps de chaque section est calibré pour **1 200 à 1 800 caractères**, ce qui correspond à ce que tiennent les slides déjà remplies. Les blocs **« Pour l'oral »** ne vont *pas* sur la slide — ce sont les arguments à avoir en tête quand le jury creuse.

## État vérifié le 22 août 2026

Tout ce qui suit a été **re-mesuré sur le code du dépôt**, pas recopié d'une version précédente.

| Ce qui est mesuré | Valeur constatée | Comment la reproduire |
|---|---|---|
| Contrats Solidity écrits | **7** (6 déployés + 1 base abstraite) — 1 889 lignes | `find contracts -name '*.sol' ! -path 'contracts/test/*'` |
| Contrat d'attaque, réservé aux tests | `ReentrantLab.sol`, 78 lignes | — |
| Tests | **46 tests, 10 blocs**, tous verts | `npx hardhat test` |
| Couverture | **98,21 % des lignes** sur les contrats du registre — `LifecycleModule` à **100 %**. L'outil affiche 97,97 % car il compte aussi le contrat d'attaque | `npx hardhat test --coverage` puis `node scripts/check-coverage.mjs` |
| Lint | **0 erreur, 0 avertissement** — la CI bloque au premier | `npx solhint "contracts/**/*.sol" --max-warnings 0` |
| Taille du module, optimiseur **désactivé** | **30 235 octets** — au-delà de la limite EIP-170 | profil sans optimiseur |
| Taille du module, optimiseur **activé** | **20 117 octets** sur 24 576 (81,9 %) | `npx hardhat compile` |
| Front | 42 fichiers, 5 750 lignes + 2 × 361 clés de traduction | `web/src` |
| Déploiement Sepolia | en ligne — mais **en retard sur le source** depuis les correctifs d'audit : 20 021 octets en chaîne contre 20 117 compilés | `eth_getCode` |
| Registre Sepolia, état réel | 5 lots · 3 prothèses · 9 expéditions · 8 commandes · 3 prescriptions | `eth_call` sur les compteurs publics |

**Adresses en ligne (Sepolia, redéploiement du 14 août 2026)**

| Contrat | Adresse |
|---|---|
| `CatentaRoles` | `0x2044188f7912F4d85668D1Bb177471AFBd131dfb` |
| `ActorRegistry` | `0x44fDaBbEAE0711d3c62cFE5f232b05deB3e9c914` |
| `CatentaCredit` | `0x281F41640774c323cc89Be354D401d417422bccB` |
| `MaterialLots` | `0x05Bc23176bb88fbc503dd5864F5b086158990e6F` |
| `PassportNFT` | `0x5E1D6459924fA8FAFDBf6030AFc2f6d3c5F4493D` |
| `LifecycleModule` | `0x214040cEa7892cF3559925Fe589Cc62Eaff6eaD3` |

⚠️ **La pile en ligne est celle d'avant l'audit.** Les correctifs de sécurité ne sont pas déployés : `eth_getCode` renvoie 20 021 octets là où le source en compile 20 117. Un redéploiement est nécessaire, et il conditionne aussi la vérification Etherscan. Les six rôles modules sont bien accordés au `LifecycleModule`, et `defaultAdminDelay` vaut **259 200 secondes (3 jours)**.

---

> ### ⚠️ Ce qu'il reste à faire avant le jury
>
> 1. **Rien de bloquant côté front.** Le bundle servi par **catenta.onrender.com** utilise bien la pile courante — vérifié dans le JavaScript déployé : `0x214040cEa…` pour le module et `0x44fDaBbEA…` pour le registre d'acteurs. Seul le `web/.env` **local** est resté sur l'ancienne pile `0x9CF14d0E…` ; ça ne gêne qu'un `npm run dev` sur ta machine, à corriger par confort.
> 2. **🔴 Redéployer.** Les correctifs d'audit ne sont pas en ligne : `eth_getCode` renvoie 20 021 octets là où le source en compile 20 117. Toute modification du source — même un commentaire — change le hash des métadonnées, donc le bytecode. Redéployer d'abord, reporter l'adresse du module dans Render ensuite.
> 3. **Vérifier les contrats sur Etherscan.** C8 demande que le jury lise le code sur un explorateur. `npx hardhat verify --network sepolia <adresse> <args>`, ou `--verify` au prochain déploiement.
> 4. **Captures d'écran** du front (slides 13 et 14) et **schéma fonctionnel** Excalidraw (slide 7). Ce sont les deux seuls livrables visuels manquants.
> 5. **Rédiger la slide 17** (conclusion personnelle).
> 6. **Pousser sur GitHub pour voir la CI passer au vert.** Le workflow `.github/workflows/ci.yml` existe et chaque étape a été vérifiée en local, mais tant que rien n'est poussé, il n'y a pas de run à montrer.

## Ce qui a changé depuis la version précédente de ce carnet

À re-coller en priorité dans le PowerPoint :

- **Slide 10** — `AccessControlDefaultAdminRules` **est implémenté et déployé** (l'ancien carnet le donnait comme « prévu, pas en place »). Un plafond `MAX_ACTION_COST` a également été ajouté contre un pouvoir administrateur non borné.
- **Slide 12** — **43 tests / 9 blocs** (et non 39 / 8), couverture **98,19 %** mesurée et rendue bloquante en CI (et non « ~95 % » affirmée).
- **Slide 15** — la pile est **redéployée et à jour** ; tailles corrigées : **30 235 → 20 021 octets**.
- **Slides 13 et 14** — les écrans de **commande de matière** et de **prescription** existent désormais, ainsi que l'affichage des raisons sociales, le lien prescription → prothèse, la navigation filtrée par rôle et la protection contre la redirection ouverte.
- **Slide 8** — deux fonctions de refus et deux d'annulation se sont ajoutées ; le module expose 19 écritures et 6 vues. La formule « aucun contrat ne connaît l'adresse d'un pair » est corrigée : c'est **des stockages vers les modules** que l'ignorance compte.
- **Slide 11** — la CI **existe** : un job GitHub Actions bloquant sur les contrats, un seuil de couverture bloquant, et un contrôle d'alignement de l'ABI du front sur les contrats compilés. Plus la livraison continue du front par **Render**. Ce n'est plus une lacune assumée.
- **Slide 13** — le front est **en ligne** : catenta.onrender.com, redéployé à chaque push.
- **Slide 10** — une **seconde relecture** a produit trois correctifs de plus (la garde qui frappait, la remise armée qui survivait à la pose, l'expédition morte) et deux limites assumées. Deux des trois répètent l'erreur de la réentrance : un contrôle fait à un instant, un effet appliqué plus tard.
- **Slide 12** — **46 tests / 10 blocs**, couverture **98,21 %**, lint à **zéro avertissement**.
- **Huit schémas** sont prêts dans `report/` (`schema-architecture`, `schema-architecture-choix`, `schema-jetons`, `schema-securite`, `schema-ci`, `schema-tests`, `schema-front`, `schema-deploiement`), en SVG vectoriel et en PNG.

---

## Slide 3 — Introduction

*Quel est votre background précédant la formation, et comment en êtes-vous arrivé à cette idée de projet ?*

**Ingénieur en informatique depuis 2010**, je suis toujours resté sur les aspects techniques et architecturaux des applications — startups, ESN, PME, avec des rôles de Lead. Curieux de nature, je me forme en continu sur ce qui touche au développement : IA, blockchain, jeux vidéo 2D/3D.

Mon terrain le plus solide est l'**IA** — utilisation et entraînement de modèles, conception de produits qui l'intègrent de manière pragmatique, automatisation des processus de développement par l'IA (revue de code, entre autres). C'est cette même curiosité qui m'a mené à la blockchain, où **je travaille déjà, mais pas sur les smart contracts.** D'où cette certification : combler l'écart entre un écosystème que je pratique et la couche que je ne développais pas.

**L'idée du projet, elle, ne vient pas de moi.** Elle vient d'un **consultant blockchain de ma promotion, ancien commercial du secteur dentaire**, qui a identifié le besoin depuis le terrain : il a vu comment circulent réellement les lots de matière et les prothèses entre fabricants, distributeurs, laboratoires et cabinets — et où la traçabilité se rompt.

Ce point d'origine compte pour tout le reste : le besoin a été **constaté avant** qu'on se demande quelle technologie y répondait, et non l'inverse. Il a été formalisé dans un document fonctionnel (`docs/Catenta Parcours Prothese Tracabilite.pdf`) qui a servi de référence tout au long du développement — au point que la moitié du travail a consisté à **réaligner le code sur ce document** quand les deux ont divergé.

**Pour l'oral.** Deux choses à assumer plutôt qu'à masquer. D'abord, le domaine métier n'est pas le mien : ma valeur ici est l'architecture et l'implémentation, l'expertise dentaire vient d'ailleurs, et le document fonctionnel est ce qui fait le pont. Ensuite, le fil conducteur du projet — trois couches, stockages permanents contre modules remplaçables, aucun contrat ne connaissant l'adresse d'un pair — n'est pas un exercice de style : c'est le réflexe de quinze ans d'architecture appliqué à un environnement où **on ne peut pas corriger après coup**. C'est précisément ce que la contrainte blockchain ajoute à ce que je savais déjà faire.

---

## Slide 4 — Cahier des charges *(C1)*

*Décrivez l'application que vous imaginez, ses fonctionnalités.*

**Catenta est le passeport numérique d'une prothèse dentaire sur mesure, de la matière première à la pose en bouche.**

Le parcours réel compte cinq acteurs, et l'application les suit tous :

| Acteur | Ce qu'il fait dans Catenta |
|---|---|
| **Fabricant** | déclare ses lots de matière (matière, unité, quantité, empreinte du certificat CE/ISO) et les expédie |
| **Distributeur** | réceptionne, revend au laboratoire ou directement au cabinet, remonte au fabricant en cas de rupture |
| **Laboratoire** | reçoit une prescription, consomme la matière, **crée le passeport de la prothèse** |
| **Praticien** | prescrit, réceptionne, atteste la conformité, pose et enregistre la dent |
| **Ordre / ARS** | lit l'intégralité du registre ; déclarera les rappels de lot |

**Fonctionnalités livrées et vérifiables en ligne :** déclaration de lots ; **chaîne de responsabilité continue** sur la matière, chaque changement de garde en deux temps ; **commande de matière** avec cascade tracée vers le fabricant, refus et annulation motivés ; **prescription de prothèse** (matière, dent, teinte, description), acceptée, refusée ou annulée avec motif ; émission du passeport **consommant la matière dans la même transaction** ; remise de dossier en deux temps ; attestation de conformité ; pose avec numéro de dent FDI et empreinte anonyme du patient ; QR code par prothèse ; registre d'identité des acteurs (raison sociale + SIREN) ; crédit d'usage `$CATENTA` brûlé à chaque action.

---

## Slide 5 — Compréhension de l'écosystème *(C1)*

*En quoi votre projet nécessite l'usage d'une blockchain, ainsi que sa pertinence dans l'écosystème.*

**Le problème.** Le passeport prothèse est aujourd'hui **un papier**. Trois conséquences : le rappel d'un lot défectueux se gère par téléphone sans preuve d'exécution ; le praticien porte la responsabilité en cas de contrôle sans documentation opposable ; et le règlement UDI **exclut explicitement les dispositifs sur mesure**, laissant un vide que personne ne comble.

**Pourquoi une blockchain et pas une base de données.** Les laboratoires sont **en concurrence directe**. Aucun n'acceptera de dépendre du serveur d'un autre, ni d'un tiers privé capable de réécrire l'historique après un incident. Trois propriétés sont ici irremplaçables :

- **Neutralité inter-acteurs** — aucun concurrent n'héberge la vérité des autres.
- **Immuabilité** — l'historique ne peut pas être modifié *après* le litige. C'est ce qui protège le praticien, pas le laboratoire.
- **Vérifiabilité par un tiers** — l'Ordre et l'ARS lisent l'état réel sans demander l'accès à quiconque.

L'apport est donc **la confiance entre parties non coopératives**, jamais la performance ni le coût.

**État de l'art.** Le comparable français le plus proche est Galeon (blockchain santé, dossier patient). Son étude est dans `docs/ETUDE_GALEON.md` : on en retient l'ancrage d'empreintes plutôt que de données, et on en écarte le modèle de jeton spéculatif — d'où un crédit d'usage non transférable et non coté (slide 9).

---

## Slide 6 — Périmètre du MVP *(C1)*

*Précisez le périmètre précis de votre MVP.*

**Dans le MVP, et en ligne sur Sepolia :** toute la chaîne fabricant → distributeur → laboratoire → praticien → patient. Déclaration et circulation de la matière, commandes avec cascade, prescription, fabrication du passeport, remise, conformité, pose avec dent et empreinte patient, crédit d'usage, agrément délégué, registre d'identité des acteurs, QR code.

**Hors MVP, et pourquoi :**

| Écarté | Raison |
|---|---|
| **`RecallModule`** (rappel de lot) | c'est le point le plus distinctif du projet, et il **manque** — arbitrage de temps assumé. Entièrement additif : il ne touche aucun contrat existant, on le déploie et on lui accorde un rôle |
| **Caution qualité** (`BondModule`) | ajoute un enjeu économique réel, mais suppose un stablecoin externe et une logique de *slashing* qui doublerait la surface de sécurité |
| **Statut « déposée » + successeur** | le remplacement d'une prothèse cassée (scénario 2 du doc fonctionnel) |
| **IPFS** | les empreintes sont ancrées dans des `bytes32`, les documents ne sont pas encore stockés |
| **Meta-transactions ERC-2771** | les cabinets n'ont pas d'ETH — condition d'adoption réelle, pas de démonstration |
| **Multisig sur l'administration** | la clé admin est protégée par le code (slide 10) mais reste une clé unique |

**Pour l'oral.** Ne pas présenter le rappel comme « fait ». Le présenter comme **spécifié, chiffré et additif** — et expliquer que la chaîne de responsabilité livrée est précisément ce qui le rendra traçable jusqu'au détenteur courant de la matière non consommée.

---

## Slide 7 — Schéma fonctionnel *(C1)*

> ⚠️ **À produire** : un schéma Excalidraw. Le parcours des pages 2 à 10 de `docs/Catenta Parcours Prothese Tracabilite.pdf` est directement réutilisable.

```
  ┌ pré-requis ┐
  FABRICANT ──▶ DISTRIBUTEUR ──2──▶ LABORATOIRE ──4──▶ PRATICIEN ──5──▶ PATIENT
  déclare les      détient           ▲     │            pose + dent
  lots : matière   le stock          │     └ 3 fabrique  empreinte anonyme
  unité, certificat                  └──1── prescription
```

- **Pré-requis** — les fabricants déclarent leurs lots ; les distributeurs s'approvisionnent. Chaque changement de main est **accepté** par celui qui reçoit
- **1** — le praticien prescrit : laboratoire, matière, dent (FDI), teinte, description
- **2** — le laboratoire commande sa matière ; en rupture, le distributeur remonte au fabricant et le lien entre les deux commandes est conservé (`parentOrderId`)
- **3** — le laboratoire consomme la matière et émet le passeport, dans la même transaction
- **4** — remise du dossier, acceptée par le praticien
- **5** — conformité, pose, dent, empreinte anonyme du patient

**Les trois couches techniques :**

```
        CatentaRoles                    AUTORITÉ — « ai-je ce rôle ? »
             │
   ┌────────┬┴────────┬──────────┬──────────────┐
   ▼        ▼         ▼          ▼              ▼
PassportNFT   MaterialLots   CatentaCredit           STOCKAGES PERMANENTS
   │              │               │
   └──────────────┴───────┬───────┘
                          ▼
   LifecycleModule · ActorRegistry            REMPLAÇABLES
                          ┊
        Recall · Bond (v1)                    ADDITIFS
```

---

## Slide 8 — Smart contracts *(C2)*

*Liens entre eux, librairies utilisées, fonctions principales.*

> 🖼️ **Deux schémas** : `report/schema-architecture.svg` (qui appelle qui) et `report/schema-architecture-choix.svg` (pourquoi ce découpage plutôt qu'un proxy). Le premier sur la slide, le second en réserve pour l'oral — c'est la question que le jury pose.

**Sept contrats, trois couches** — six déployés, plus la base abstraite `RoleAware` (38 lignes) dont héritent les cinq contrats qui interrogent l'autorité. **L'idée directrice** : **ce qui doit survivre vit dans un stockage permanent, ce qui évoluera vit dans un module qu'on remplace.**

| Contrat | Rôle | Nature | Taille déployée |
|---|---|---|---|
| `CatentaRoles` | l'autorité unique : rôles acteurs + rôles modules | permanent | 4 974 o |
| `RoleAware` | base abstraite — donne accès à l'autorité | — | — |
| `PassportNFT` | un passeport = une prothèse, ERC-721 *soulbound* | permanent | 7 268 o |
| `MaterialLots` | les lots, ERC-1155 ; **le lot porte sa matière et son unité** | permanent | 8 997 o |
| `ActorRegistry` | raison sociale + SIREN des acteurs agréés | **remplaçable** | 3 334 o |
| `CatentaCredit` | crédit d'usage `$CATENTA`, ERC-20 non transférable | permanent | 3 022 o |
| `LifecycleModule` | toute la logique métier — 19 écritures, 6 vues | **remplaçable** | 20 117 o |

**Les stockages ne connaissent aucun module.** Ils ne connaissent que l'autorité, et n'acceptent une écriture que si l'appelant porte le rôle — le module, lui, reçoit les adresses des stockages à la construction, ce qui est sans conséquence puisque c'est *lui* le remplaçable. Conséquence directe et démontrée par un test : **un nouveau module peut piloter les mêmes stockages** — on lui accorde les rôles, on les révoque à l'ancien, les passeports et les lots ne bougent pas.

**Fonctions principales :** `declareLot` · `declareShipment` / `acceptShipment` / `cancelShipment` · `placeMaterialOrder` / `escalateMaterialOrder` / `fulfilMaterialOrder` / `refuseMaterialOrder` / `cancelMaterialOrder` · `requestProsthesis` / `acceptProsthesisRequest` / `refuseProsthesisRequest` / `cancelProsthesisRequest` · `mintPassport` · `initiateHandoff` / `acceptHandoff` · `attestConformity` · `markPlaced` · `setActionCost`.

**OpenZeppelin, massivement** — **dix imports dans les contrats déployés** : `AccessControl` + `IAccessControl` + `AccessControlEnumerable` (rôles **et** énumération des titulaires, ce qui évite un indexeur) + `AccessControlDefaultAdminRules`, `ERC721` + `ERC721Enumerable`, `ERC1155` + `ERC1155Supply` + `ERC1155Burnable`, `ERC20`. Version épinglée (`5.6.1`), imports nommés, et la suite de tests d'OpenZeppelin n'est pas rejouée.

**`IERC721Receiver` ne fait pas partie de la pile** — c'est le onzième import, et il n'apparaît que dans `contracts/test/ReentrantLab.sol`. L'annoncer parmi les briques déployées laisserait croire que le registre l'implémente : c'est **l'attaquant** qui l'implémente, pour se faire rappeler par `_safeMint`. Sa place est sur la slide sécurité, pas ici.

**Pourquoi `ActorRegistry` est remplaçable et non permanent.** L'identité est la donnée la plus susceptible d'évoluer — SIREN aujourd'hui, RPPS ou pays demain — et personne n'en dépend : ni contrat, ni écriture métier. La loger dans `CatentaRoles`, le seul contrat véritablement irremplaçable, aurait gravé la partie la plus volatile du registre dans celle qu'on ne peut jamais changer. Perdre les libellés coûte une ressaisie ; perdre un passeport coûte la traçabilité. Ce n'est pas la même catégorie.

**Pour l'oral — les trois décisions à défendre.**

1. **Le transfert en deux temps, partout.** Ni un passeport ni un lot ne peut être poussé sur un acteur : le destinataire accepte. Ce n'est pas du confort — c'est ce qui empêche de se débarrasser d'un lot rappelé chez un concurrent.
2. **Le lot se décrit lui-même.** Il porte sa matière *et son unité*, en chaînes courtes (un slot chacune). Un catalogue on-chain coûtait une transaction par produit et, republiable, aurait pu changer ce qu'un lot passé contenait. « 10 » ne veut rien dire ; « 10 lingotins » si.
3. **L'origine et la garde sont deux choses.** `LotInfo.manufacturer` ne bouge jamais ; la garde se lit dans les balances ERC-1155. C'est exactement ce qu'un rappel doit remonter.

**Bonus si on demande la combinaison des deux extensions OZ.** `AccessControlEnumerable` et `AccessControlDefaultAdminRules` surchargent les mêmes fonctions : les combiner impose de réécrire `grantRole`, `revokeRole`, `renounceRole`, `_setRoleAdmin`, `_grantRole`, `_revokeRole` et `supportsInterface` pour fixer l'ordre de linéarisation. Les règles d'administration s'appliquent d'abord, l'index des titulaires est tenu à jour ensuite.

---

## Slide 9 — Votre jeton *(C3)*

*Usage d'un jeton et choix de la norme.*

> 🖼️ **Schéma prêt à insérer** : `report/schema-jetons.svg` (vectoriel, 16:9) et son rendu `report/schema-jetons.png`. Trois cartes — le besoin, la justification du standard, et ce qui a été écarté — plus le bandeau `_update`. Le jeton de caution en est volontairement absent : il n'est pas implémenté.

**Quatre standards, aucun jeton décoratif : chacun rend effective une fonctionnalité qui n'existerait pas sans lui.**

| Besoin | Standard | Pourquoi celui-là |
|---|---|---|
| Le passeport d'une prothèse | **ERC-721 *soulbound*** | un token = une prothèse. `_update` surchargé bloque tout transfert : une prothèse n'est pas un actif, elle appartient au patient. Le seul déplacement possible est la **remise de dossier acceptée**, autorisation à usage unique consommée par le transfert lui-même |
| Les lots de matière | **ERC-1155** | un lot **est** une quantité semi-fongible — « X g de zircone du lot N ». ERC-721 imposerait un token par gramme, ERC-20 un contrat par lot. `ERC1155Supply` donne gratuitement la quantité restante |
| Le crédit d'usage | **ERC-20 non transférable** | le modèle économique |
| La caution qualité (v1) | **ERC-20 externe** | jamais un jeton maison — voir ci-dessous |

**`$CATENTA`, le crédit d'usage.** L'abonnement est encaissé **hors chaîne** ; l'admin émet des crédits ; **chaque action utile en brûle un** (`modifier costsCredit`, `actionCost = 1` en ligne aujourd'hui). Trois propriétés en font un crédit et non une monnaie :

1. **Non transférable** — seuls le *mint* et le *burn* passent. Aucun carnet d'ordres, aucun cours : il ne peut être ni listé ni échangé, par construction.
2. **Aucun plafond d'émission** — les crédits sont brûlés en continu et réémis à chaque renouvellement ; un plafond finirait par figer le système.
3. **Brûlé, jamais recyclé** — l'argent a déjà changé de main hors chaîne. Recycler ferait du crédit une monnaie qui circule, avec le risque réglementaire que ce design évite.

Décimales = 0 : un crédit est une unité entière. `actionCost` est réglable par l'admin — **0 désactive la facturation** (phase pilote gratuite), et un plafond `MAX_ACTION_COST = 100` empêche l'admin de geler le registre en rendant chaque action inabordable.

**Pour l'oral — le piège du jeton de caution.** Une caution libellée dans un jeton qu'on émet soi-même **ne vaut rien** : le laboratoire pourrait s'en émettre autant qu'il veut. Le `BondModule` acceptera donc n'importe quel `IERC20` externe, fixé à la construction. C'est la question que le jury pose systématiquement sur les projets à jeton.

---

## Slide 10 — Sécurité *(C4)*

*Méthode d'auto-audit, failles potentielles et résolutions.*

**Méthode.** Revue systématique du code contre les **quinze familles de vulnérabilités** de l'atelier Solidity Hacking, complétée d'une relecture fonction par fonction selon trois axes — **rôle, état, montant** — avec un test par garde qui vérifie qu'elle **révoque**, pas seulement qu'elle laisse passer.

| Famille (atelier) | Statut dans Catenta |
|---|---|
| **Réentrance** (ex. 4) | 🔴 **Faille trouvée, corrigée, testée** — voir ci-dessous |
| **Pouvoir administrateur** (ex. 13) | 🟠 **Fermé par le code** — `AccessControlDefaultAdminRules` + plafond `MAX_ACTION_COST` |
| « private » lisible on-chain (ex. 3) | traité **par conception** : aucune identité patient, seulement un *commitment* salé |
| Arithmétique, précision, arrondi (2, 6, 7, 9, 12) | **sans objet** : aucune division de valeur, aucun partage, aucun prix. Le seul cast réduisant (`uint128`) est gardé par un `require` |
| Type signé, contrôle de solde absent (6) | tout est non signé ; les soldes matière et crédits sont vérifiés avant écriture |
| Réinitialisation d'état, sémantique de `delete` (8, 9, 15) | l'autorisation de remise est **consommée dans `_update`** — c'est exactement le booléen que personne ne remet à zéro de l'ex. 15, évité. Statuts monotones |
| DoS par boucle non bornée (1) | **aucune boucle dans les contrats** (vérifié : zéro `for`, zéro `while`). Le rappel de lot sera O(1) : une écriture sur le lot, jamais un parcours des passeports |
| DoS par push-payment (10, 13) | **sans objet** : aucun paiement, aucun transfert de valeur |
| Force-feeding, dépendance au solde (14) | **immunisé** : **aucun contrat n'est `payable`**, aucune logique ne lit `address(this).balance` |
| Collision `abi.encodePacked` (11) | **aucun `encodePacked`** dans le dépôt. Le seul hachage de chaîne (`keccak256(bytes(material))`, comparaison de matière sur commande) porte sur une chaîne unique, jamais sur une concaténation |
| Commit-reveal (5, référence) | appliqué au patient : *commit* on-chain, sel conservé hors chaîne et **jamais révélé** |

### La faille trouvée : réentrance sur l'émission d'une prothèse

`PassportNFT.mint` passe par `_safeMint`, qui appelle `onERC721Received` **sur le laboratoire**. Or `mintPassport` ne marquait la prescription « honorée » qu'**après** le mint. Un laboratoire qui est un contrat pouvait donc rentrer à nouveau depuis ce callback, voir la demande encore « acceptée », et **obtenir plusieurs passeports pour une seule prescription**.

Pas un vol de fonds — l'attaquant paie ses crédits et sa matière. Mais une **rupture de l'invariant central** du registre : une prescription, une prothèse. Et `request.tokenId` n'aurait gardé que le dernier, faussant le lien.

**Correction** : checks-effects-interactions. La demande est consommée **avant** le mint, seul le `tokenId` s'écrit après. Coût : zéro gas, aucun `ReentrancyGuard` — l'ordre suffit.

**Test de non-régression** : `contracts/test/ReentrantLab.sol` — un laboratoire-contrat qui tente réellement la réentrance. Le test vérifie que la seconde émission révoque et qu'**un seul passeport existe**. Réordonner le module dans le mauvais sens fait échouer le test.

### Le pouvoir de l'administrateur, fermé par le code

Deux angles, tous deux traités **dans les contrats déployés** :

1. **`AccessControlDefaultAdminRules`** (OpenZeppelin) impose un **titulaire unique** de `DEFAULT_ADMIN_ROLE`, un transfert en **deux temps** — annonce puis acceptation — séparés par un **délai obligatoire de 3 jours** (`defaultAdminDelay = 259 200`, valeur lisible on-chain), et l'impossibilité d'accorder ou révoquer ce rôle par `grantRole`. Une prise de contrôle devient donc **visible on-chain avant d'être effective**, et le consortium a le temps de réagir.
2. **`MAX_ACTION_COST = 100`.** Sans ce plafond, l'admin pouvait porter `actionCost` à `type(uint256).max` et **geler le registre entier** : plus personne n'aurait eu de quoi payer la moindre action. Ce n'était pas une faille de code mais un **pouvoir non plafonné** — et sur un registre partagé entre concurrents, un pouvoir non plafonné est une prise.

**Alternative étudiée et écartée** : `AccessManager`. Il offre le ciblage par fonction et des délais intégrés, mais déplace les règles d'accès des contrats vers des identifiants numériques — le code cesse de documenter ses propres règles. Les rôles sémantiques restent, `AccessManager` reste la porte de sortie si des permissions à délai deviennent une exigence.

### La deuxième relecture, et ses trois correctifs

La revue a été rejouée en fin de projet sur les contrats devenus plus gros. Elle a produit trois correctifs, chacun accompagné du test qui échoue sans lui.

| Trouvaille | Ce qui n'allait pas | Correctif |
|---|---|---|
| **La garde pouvait frapper** | `MaterialLots.transferCustody` appelait `_update` sans vérifier ses extrémités. Or `_update` est l'entrée **brute** d'ERC-1155 : `from == 0` vaut frappe, `to == 0` vaut destruction. Un module ne portant que `LOT_CUSTODIAN_ROLE` créait donc de la matière sans `LOT_MINTER_ROLE`, y compris sur un lot jamais déclaré — la séparation des rôles ne séparait rien | deux extrémités exigées non nulles |
| **Une remise armée survivait à la pose** | `initiateHandoff` refuse un passeport `Placed`, mais l'autorisation déjà armée n'était effacée nulle part et `acceptHandoff` ne regardait pas le statut. Armer en `Certified`, poser, puis accepter faisait changer de mains un dispositif **en bouche** | le statut est revérifié à l'acceptation |
| **Une expédition pouvait rester morte** | Le solde est vérifié à la déclaration, jamais immobilisé. La seconde acceptation révoque à jamais, et seul l'expéditeur pouvait annuler : le destinataire restait bloqué, avec une commande marquée « honorée » que rien ne livrerait | `cancelShipment` ouverte aux deux parties |

**Pour l'oral — ce que ces trois-là ont en commun avec la réentrance.** Deux d'entre elles sont la **même erreur de raisonnement** : un contrôle fait à un instant, un effet appliqué plus tard. La réentrance consommait la prescription après le mint ; la remise vérifiait le statut à l'armement et non à l'acceptation. C'est la leçon à formuler : *une garde ne vaut qu'au moment où elle produit son effet.*

### Autres points d'attention propres au métier

| Risque | Parade dans le code |
|---|---|
| Se débarrasser d'un lot rappelé chez un tiers | transfert direct refusé ; la garde ne bouge qu'au bout d'une expédition **acceptée** |
| Passeport traité comme un actif | *soulbound* par `_update` — tous les chemins de transfert y passent |
| Crédit brûlé sur une action qui échoue | `costsCredit` placé **après** les gardes ; la transaction étant atomique, un revert plus loin annule le burn |
| Rôle technique donné à un humain | rôles modules séparés des rôles acteurs ; la vue `/admin` marque toute adresse non reconnue |
| Redirection ouverte via le QR patient | le QR pointe vers une route profonde ; `safeRedirect` rejette tout ce qui ne commence pas par `/` (et rejette `//hôte`), sinon `?redirect=` devenait un vecteur d'hameçonnage |
| Dépassement de la limite EIP-170 | détecté par les tests eux-mêmes (« code too large ») ; optimiseur activé dans les deux profils |

### Le risque qui reste, et il est nommé

`DEFAULT_ADMIN_ROLE` est détenu par **une clé unique** (`0x1726fa20…`). Le code la protège désormais contre un transfert silencieux, mais **pas contre sa compromission** : l'attaquant garderait la main pendant les trois jours du délai. La parade est **un multisig (Safe)** comme titulaire, prévue et non mise en place — le module Ignition accepte déjà l'adresse admin en paramètre, il n'y a rien à recoder.

**Pour l'oral.** Ce qui n'a pas été fait : ni analyse statique automatisée, ni *fuzzing*, ni audit externe. La méthode est une revue structurée par familles connues, doublée de tests — pas un audit. Le dire vaut mieux que le laisser découvrir. Ce qui a été fait mérite en revanche d'être montré : **la revue a trouvé une vraie faille dans mon propre code, le contrat attaquant est resté dans la suite de tests, et le deuxième point (le pouvoir admin non plafonné) n'était même pas une faille de code — c'était une faille de gouvernance.**

---

## Slide 11 — Intégration continue *(C5)*

*Descriptif de l'ensemble des outils utilisés pour votre intégration continue.*

> 🖼️ **Schéma** : `report/schema-ci.svg`

**Trois boucles, trois rôles qu'il ne faut pas confondre.** L'intégration protège ce qui entre dans `main`. La livraison met le front en ligne. Le déploiement met les contrats en chaîne.

| Boucle | Outil | Déclencheur | Ce qu'elle garantit |
|---|---|---|---|
| **1 · Intégration** | GitHub Actions | push et pull request | le code qui entre dans `main` compile, passe les tests, et reste couvert |
| **2 · Livraison du front** | **Render** | push sur `main` | le front en ligne sur **catenta.onrender.com**, exécutable par un tiers avec un wallet |
| **3 · Déploiement des contrats** | Hardhat Ignition | à la main | la pile en chaîne, reprenable et réconciliée |

**Boucle 1 — un seul job bloquant, et il porte sur les contrats.**
`solhint --max-warnings 0` → `hardhat compile` → **`check-abi.mjs`** → `hardhat test` → `test --coverage` → **`check-coverage 90`**. Six étapes, toutes bloquantes.

**Pas de job « front », et c'est délibéré.** Render construit et déploie le front à chaque push : un `vue-tsc` de plus dans la CI n'apprendrait rien que le build de Render n'apprenne déjà, puisqu'un build cassé ne part pas en ligne. Ce qui manquerait vraiment — le lien entre les deux moitiés du dépôt — est couvert par `check-abi.mjs`, dans le job contrats.

**Deux garde-fous écrits pour ce projet, et c'est là qu'est la vraie valeur.**

1. **`scripts/check-coverage.mjs`** — Hardhat affiche un tableau de couverture mais ne sait pas échouer sous un seuil. Le script lit `lcov.info`, exclut le contrat d'attaque et sort en erreur sous 90 %. **La couverture cesse d'être une affirmation de slide pour devenir une contrainte** : 98,19 % aujourd'hui.
2. **`scripts/check-abi.mjs`** — **le seul contrôle qui relie les deux moitiés du dépôt.** L'ABI du front est écrite à la main dans `web/src/lib/contracts.ts` ; `vue-tsc` valide du TypeScript, pas des signatures Solidity. Le script compare les 136 fragments aux sélecteurs des artefacts compilés. Sans lui, changer un type de paramètre compile des deux côtés et casse le front **à l'exécution, devant le jury**.

**Le lint est plafonné à zéro.** La dette NatSpec des contrats a été soldée pendant l'audit, et le seul écart d'ordre qui reste porte un `solhint-disable-next-line` avec sa raison écrite au-dessus : le module est groupé **par domaine métier** — expéditions, commandes, prescriptions — plutôt que par catégorie de déclaration. Sur mille lignes, lire une règle d'un seul tenant vaut mieux qu'un ordre canonique qui l'éparpille.

**Gestion des versions.** Compilateur **épinglé** (`0.8.34`, pas de caret) : la version fait partie de l'artefact déployé pour un registre non upgradable. OpenZeppelin épinglé de même (`5.6.1`). Secrets dans le **keystore chiffré** de Hardhat, jamais un `.env`. Messages de commit conventionnels, conventions figées dans `docs/CONVENTIONS.md`.

**Ce que la CI ne fait pas.** Pas d'analyse statique automatisée : une étape non bloquante qui n'a jamais tourné n'aurait rien protégé. Les deux garde-fous en place — l'ABI et le seuil de couverture — sont écrits pour ce projet et échouent pour de vrai.

**Pour l'oral.** Le workflow est **écrit et vérifié étape par étape en local**, mais il ne deviendra vert sur GitHub qu'au premier push — le dire avant qu'on le demande.

**Si on demande pourquoi le front n'est pas dans la CI**, la réponse est qu'il a sa propre boucle : Render le reconstruit et le redéploie à chaque push. Le doublonner coûterait du temps de CI sans rien attraper de neuf.

**Le test qui prouve que le garde-fou garde.** `scripts/check-abi.mjs` a été éprouvé en changeant un `uint8` en `uint16` dans l'ABI du front : le script sort en erreur et nomme le fragment fautif. Même doctrine que les contrats — une garde qui n'a jamais révoqué n'est pas une garde.

---

## Slide 12 — Testing *(C6)*

*Logique et résumé des tests.*

> 🖼️ **Schéma** : `report/schema-tests.svg`

**46 tests, dix blocs, 993 lignes** en TypeScript / Mocha / ethers v6. La logique : **un test par garde**, et chaque test raconte une phrase métier plutôt qu'un appel de fonction.

| Bloc | Tests | Ce qu'il démontre |
|---|---:|---|
| `smoke` | 6 | le parcours complet fabricant → distributeur → laboratoire → praticien → patient, en une seule lecture ; le soulbound ; **le remplacement de module** |
| `usage credit` | 6 | un crédit brûlé par action utile, l'action bloquée à zéro crédit, la non-transférabilité, la phase pilote gratuite, le mint réservé au rôle |
| `un lot se décrit lui-même` | 3 | matière et unité lisibles sans fichier annexe, deux unités différentes coexistent, chaînes bornées |
| `material custody chain` | 10 | transfert direct refusé, garde impossible sans le rôle, destinataire non éligible, quantité insuffisante, annulation, double acceptation, vente directe au cabinet, flux inverse |
| `actor registry` | 5 | un fabricant ne peut pas être nommé, SIREN à neuf chiffres, effacement, perte du nom quand l'acteur devient fabricant |
| `material orders` | 5 | commande → livraison, cascade tracée, refus et annulation motivés, réouverture si le fournisseur annule, matière livrée conforme à la commande |
| `prosthesis requests` | 4 | prescription → passeport, fabrication refusée si la demande n'est pas acceptée, refus et annulation motivés, textes bornés et dent validée |
| `réentrance sur l'émission` | 1 | un laboratoire-contrat n'obtient **pas** deux prothèses pour une prescription |
| `delegated onboarding` | 3 | un agent d'agrément agrée sans être administrateur, et ne peut pas s'auto-promouvoir |
| `correctifs d'audit` | 3 | la garde ne frappe pas, une remise armée ne survit pas à la pose, le destinataire peut refuser |

**Couverture réelle, mesurée** — `npx hardhat test --coverage` :

| Fichier | Lignes | Instructions |
|---|---:|---:|
| `LifecycleModule.sol` | **100 %** | 100 % |
| `ActorRegistry.sol` · `RoleAware.sol` | 100 % | 100 % |
| `MaterialLots.sol` | 96,43 % | 94,44 % |
| `PassportNFT.sol` | 92,59 % | 90,00 % |
| `CatentaCredit.sol` | 88,89 % | 88,89 % |
| `CatentaRoles.sol` | 83,33 % | 83,33 % |
| **Contrats du registre**, hors contrat d'attaque — le chiffre que la CI bloque | **98,21 %** | — |

**Trois tests que je montrerais en priorité :**

1. **« un nouveau module pilote les mêmes stockages »** — la revendication de modularité, prouvée : on déplace les rôles, le passeport existant survit, l'ancien module devient impuissant.
2. **« l'historique de garde est lisible depuis le storage seul »** — trois expéditions, trois issues distinctes (acceptée, annulée, acceptée), **sans lire un seul event**.
3. **« un crédit exactement par action utile »** — la comptabilité du modèle économique, décrément par décrément le long de la chaîne.

**Limite honnête** : les lignes non couvertes sont des surcharges de linéarisation d'OpenZeppelin (`CatentaRoles`) et des branches de garde des stores. Pas de tests de propriétés ni de *fuzzing* — c'est la prochaine marche, pas un oubli.

---

## Slide 13 — Front 1/2 *(C7)*

*Technologies et description des pages.*

> 🖼️ **Schéma** : `report/schema-front.svg`

**En ligne : [catenta.onrender.com](https://catenta.onrender.com)** — déployé automatiquement par Render à chaque push sur `main`. Le parcours complet est exécutable par un tiers avec un wallet Sepolia.

**Stack** : Vue 3 (Composition API) · Vite · TypeScript · Pinia · vue-i18n (FR/EN, **361 clés dans chaque langue**) · Tailwind · **ethers v6** · **Reown AppKit** (ex-WalletConnect) pour la connexion. 42 fichiers, 5 750 lignes hors traductions.

**Le principe qui structure tout le front : il n'a aucune autorité.** Le rôle est lu on-chain via `CatentaRoles.hasRole` ; l'interface ne fait que refléter ce que le contrat accepterait. **Un bouton absent n'est jamais une sécurité** — le contrat reste seul juge. Une personne sans rôle voit l'application en lecture seule plutôt qu'un mur.

**Deux adresses à configurer, et une seule qui compte.** `VITE_LIFECYCLE_ADDRESS` : le module expose `ROLES`, `PASSPORTS`, `LOTS` et `CREDIT` en `public immutable`, donc le front **découvre quatre contrats sur six** au démarrage. Le jour où un module en remplace un autre, une seule valeur change. `VITE_ACTOR_REGISTRY_ADDRESS` fait exception, et pour une raison assumée : **aucun contrat ne le référence, donc aucun ne peut l'exposer.** C'est le prix de son isolement — et son absence ne dégrade que l'affichage, jamais une écriture.

**Sept pages :**

| Page | Contenu |
|---|---|
| `/` connexion | rôles expliqués, réseau attendu, accès lecture seule |
| `/architecture` | la pédagogie de l'architecture, accessible **sans wallet** |
| `/lots` matière | déclaration (fabricant), **commandes à honorer et mes commandes**, réceptions à confirmer, expéditions en attente, cartes de lot filtrées par garde |
| `/lots/:id` parcours | la vie d'un lot reconstituée **depuis le storage**, garde actuelle, prothèses issues |
| `/passports` prothèses | **prescriptions reçues et envoyées**, émission consommant un lot, onglets « les miennes / à accepter / toutes » |
| `/passports/:id` fiche | cycle de vie, traits figés, dent et date de pose, **QR code**, actions selon rôle et statut |
| `/admin` | agrément + identité des acteurs, opérateurs et régulateur, crédits, pile déployée — en quatre onglets déverrouillés par le rôle réel |

> ⚠️ **À ajouter** : captures d'écran.

---

## Slide 14 — Front 2/2 *(C7)*

**Quatre partis pris qui méritent d'être défendus.**

**1. Aucun indexeur, et aucune lecture de logs.** Toutes les listes se lisent par index borné : `tokenOfOwnerByIndex` pour les prothèses d'un cabinet, `lotCount()`, `shipmentCount()`, `materialOrderCount()`, `prosthesisRequestCount()`, et `getRoleMember` pour les titulaires. C'est précisément pour ça qu'`ERC721Enumerable` et `AccessControlEnumerable` ont été retenus malgré leur coût à l'écriture (de l'ordre de 50 000 gas au mint) : **payer au mint pour supprimer une dépendance d'infrastructure entière** est le bon échange tant que l'indexeur n'existe pas. Conséquence : aucun `getLogs`, donc aucune dépendance à la générosité d'un RPC public.

**2. L'affichage suit le rôle, et les rôles se cumulent.** Un fabricant ne voit pas les prothèses — elles ne le concernent pas. Un praticien seul ne voit pas l'écran Matière : `mintPassport` est réservé au laboratoire, il pourrait commander de la matière et n'en rien faire. Un laboratoire ne voit que la matière dont il a la garde, et **avec sa quantité à lui** (« 200 g en votre garde ») plutôt que le total du lot. **Administrer n'est pas un droit de lecture** : un administrateur ou un agent d'agrément ne voit qu'Administration. Une adresse à la fois laboratoire et praticien — l'usinage au fauteuil — garde les deux vues, parce que ce sont des `||` et non un aiguillage sur un rôle principal.

**3. Le QR n'encode rien.** Seulement l'adresse de la fiche. Tout est relu on-chain à l'ouverture, donc **un QR imprimé ne périme jamais** et ne peut pas porter d'information fausse. Comme il pointe vers une route profonde, la destination est mémorisée pendant que le wallet restaure sa session — et filtrée par `safeRedirect`, sinon le paramètre serait une redirection ouverte.

**4. L'identité du patient ne quitte pas le navigateur.** `CommitmentBuilder` calcule `keccak256(sel ‖ identité)` côté client, propose de **télécharger le sel** à conserver avec la fiche patient, et n'envoie que l'empreinte. Effacer la fiche patient rompt définitivement le lien — c'est ce qui rend l'effacement RGPD possible sur une chaîne qui, elle, ne s'efface pas.

**Soin apporté aux erreurs.** Les 36 *custom errors* des contrats sont traduites en **39 messages** français et anglais (les trois derniers couvrant le refus de signature, les frais insuffisants et l'inconnu). L'utilisateur ne voit jamais « execution reverted (unknown custom error) ».

> ⚠️ **À ajouter** : captures d'écran (commande de matière, parcours du lot, fiche prothèse avec QR, agrément).

---

## Slide 15 — Déploiement *(C8)*

*Tooling et procédures particulières.*

> 🖼️ **Schéma** : `report/schema-deploiement.svg` — avec les six adresses en ligne.

**Hardhat 3** · **Ignition** (déploiement déclaratif et reprenable) · **keystore chiffré** pour les secrets — jamais un `.env`, jamais l'historique shell.

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/Catenta.ts --network sepolia --verify
```

**La pile est en ligne sur Sepolia et à jour** (redéploiement du 14 août 2026) : **6 contrats déployés, 7 attributions de rôles, 13 transactions, toutes confirmées.** Sans ces attributions les stockages refusent toute écriture, et c'est voulu : c'est aussi ce qui rend un module remplaçable. Le registre porte déjà de l'activité réelle — **5 lots, 9 expéditions, 8 commandes, 3 prescriptions, 3 prothèses**.

**Trois particularités apprises en le faisant.**

1. **L'optimiseur est obligatoire, pas préférentiel.** Avec les commandes et les prescriptions, `LifecycleModule` compile à plus de **30 000 octets** sans lui — bien au-delà de la limite EIP-170 de 24 576 octets, que le réseau de test applique exactement comme Sepolia. Aucun test ne passait. Optimisé : **20 117 octets**, soit 81,9 % de la limite. C'est mesuré, pas estimé.
2. **L'endpoint RPC d'un wallet ne tient pas un déploiement.** Ignition envoie chaque *batch* en parallèle ; `rpc.walletconnect.org` étrangle la rafale et répond `403` en plein milieu. Un fournisseur classique (Infura, Alchemy) encaisse.
3. **Le `--deployment-id` explicite.** Sans lui, un module dont la forme a changé déclenche une erreur de réconciliation — Ignition refuse de mélanger deux architectures dans un même déploiement. Avec, le journal de la pile précédente reste intact et ses adresses restent retrouvables.

> ⚠️ **À faire** : (a) `hardhat verify` sur les 6 adresses — le jury doit lire le code sur l'explorateur ; (b) reporter l'adresse du `LifecycleModule` dans `web/.env`, qui pointe encore sur la pile précédente.

---

## Slide 16 — Bilan de projet et améliorations

**Ce qui a le mieux fonctionné.** L'architecture à trois couches a tenu ses promesses : au fil du projet, le module de cycle de vie a été **profondément remanié quatre fois** — ajout d'un fabricant, circulation de la matière, commandes de matière, prescriptions — sans jamais toucher aux stockages permanents. La revendication de modularité n'est pas théorique, elle a été vécue. Et l'auto-audit a produit deux corrections réelles : une réentrance et un pouvoir administrateur non plafonné.

**Ce que je referais autrement.**

- **Écrire le document fonctionnel avant le code.** Il est arrivé en cours de route, et la moitié du travail a consisté à réaligner un code qui décrivait un parcours plus court que le vrai — un laboratoire y déclarait la matière qu'il aurait dû recevoir.
- **Décider tôt de ce qui est on-chain.** J'ai fait l'aller-retour : catalogue matière hors chaîne, puis on-chain, puis supprimé au profit d'un lot qui se décrit lui-même. La bonne question n'était pas « où stocker le nom » mais **« qu'est-ce qui doit rester lisible dans dix ans sans fichier annexe »**.
- **Monter la CI dès le premier commit**, quand elle coûte cinq minutes.

**Améliorations, par ordre de valeur.**

1. **`RecallModule`** — le rappel de lot en une écriture, statut « rappelé » **dérivé** à la lecture, accusés de réception on-chain. C'est la preuve d'exécution qui manque au processus papier.
2. **Statut « déposée » et lien successeur** — la prothèse qui casse et se remplace, avec un historique qui conserve les deux.
3. **Analyse statique automatisée et tests de propriétés** — la CI et le seuil de couverture bloquant sont désormais en place ; c'est la marche suivante.
4. **Multisig (Safe)** comme titulaire de l'administration — le seul maillon de gouvernance encore hors du code.
5. **IPFS** — les empreintes sont déjà ancrées dans des `bytes32` : un CIDv1 sha2-256 y tient, presque rien à changer côté contrat.
6. **Meta-transactions ERC-2771 et déploiement L2** — les cabinets n'ont pas d'ETH ; c'est une condition d'adoption, pas un raffinement.

**Deux limites assumées, découvertes par l'audit et non corrigées.**

- **Un détenteur peut brûler sa propre matière.** `ERC1155Burnable` est hérité et son `burn` public passe par `_update` avec `to == 0`, que la garde autorise. La chaîne de responsabilité empêche de *refiler* un lot rappelé à un concurrent ; elle n'empêche pas de le faire *disparaître des soldes*. Le bloquer sans condition casserait la mise au rebut légitime d'une matière abîmée — la vraie parade suppose de savoir ce qui est rappelé, donc **le `RecallModule`**. Et là se cache une tension d'architecture qu'il faudra trancher : pour refuser le mouvement d'un lot rappelé, le stockage devrait interroger le module de rappel, ce que la règle « un stockage ne connaît que l'autorité » interdit aujourd'hui. Soit le rappel reste **dérivé à la lecture** et n'empêche rien, soit l'autorité gagne un annuaire d'adresses.
- **Une expédition reste sur-déclarable.** On peut déclarer deux expéditions de 400 avec 400 en garde. Le refus par le destinataire débloque le cas, mais réserver vraiment la quantité demanderait de la comptabilité dans trois chemins d'écriture — arbitrage de temps assumé.

**Limites connues.**

- **L'état du module est perdu s'il est remplacé.** Statuts, commandes et prescriptions y vivent. Les passeports et les lots survivent — c'est le prix assumé de ne pas utiliser de proxy.
- **Pseudonymité, pas anonymat.** Un fabricant n'est jamais nommé, mais lots, destinataires et horodatages restent publics : il reste identifiable par recoupement.
- **Les matières se comparent comme des chaînes de caractères.** « Zircone A2 » et « zircone a2 » sont deux matières distinctes pour le contrat — y compris quand une commande vérifie que le lot livré correspond. Le sélecteur partagé le mitige, rien ne l'impose.
- **Le maillon faible reste humain** : rien ne garantit que la prothèse physiquement posée est celle que le registre désigne. La co-signature EIP-712 au moment de la remise est la parade envisagée.

---

## Slide 17 — Conclusion

> ⚠️ **À écrire par toi** — c'est un retour personnel sur la formation, ton apprentissage, tes motivations et tes regrets. Personne ne peut l'écrire à ta place, et un jury sent immédiatement un texte qui n'est pas vécu.

**Quelques angles honnêtes si tu bloques :**

- Ce que la contrainte du gas t'a appris sur la conception — le *packing*, la limite EIP-170 découverte par un test qui échoue (30 235 octets, puis 20 021), l'arbitrage « payer au mint pour supprimer un indexeur ».
- Ce que l'immuabilité change dans la manière de décider : impossible de « corriger plus tard », donc chaque champ stocké est un engagement.
- Le RGPD comme contrainte de conception et non comme case à cocher : c'est lui qui impose le *commitment* salé, l'absence de nom de personne, et la doctrine « l'empreinte on-chain, le document dehors ».
- Ce que tu aurais voulu avoir le temps de faire — le rappel de lot, surtout — et pourquoi tu as arbitré autrement.

---

## Annexe — commandes pour rejouer les chiffres

```bash
# tests et couverture
npx hardhat test                       # 43 passing
npx hardhat test --coverage            # tableau par fichier
node scripts/check-coverage.mjs 90     # 98,19 % — échoue sous le seuil
npx solhint "contracts/**/*.sol"       # 0 erreur, 20 avertissements

# taille des contrats (optimiseur activé)
npx hardhat compile                    # LifecycleModule : 20 021 octets

# état réel du registre en ligne (Sepolia)
cast call 0x214040cEa7892cF3559925Fe589Cc62Eaff6eaD3 "materialOrderCount()(uint256)"
cast call 0x2044188f7912F4d85668D1Bb177471AFBd131dfb "defaultAdminDelay()(uint48)"
```

**Couverture du référentiel**

| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|
| slides 4-7 | slide 8 | slide 9 | slide 10 | slide 11 | slide 12 | slides 13-14 | slide 15 |
| ✅ | ✅ | ✅ | ✅ | ⚠️ pas de CI automatique | ✅ | ⚠️ captures manquantes | ⚠️ vérification Etherscan à faire |
