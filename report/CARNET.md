# Carnet de projet — Catenta

**Laurent Bonnet · RS6515 · Développer une application décentralisée avec les technologies blockchain**
Dépôt : https://github.com/laurentf/catenta

---

> **Comment utiliser ce fichier.** Une section par slide du carnet, dans l'ordre. Le canevas demande d'être « précis et concis » et de respecter l'espace disponible : le texte de chaque section est calibré pour tenir sur une slide. Les blocs **« Pour l'oral »** ne vont *pas* sur la slide — ce sont les arguments à avoir en tête quand le jury creuse.

> ### ⚠️ À faire avant le jury
>
> 1. **Redéployer.** Le déploiement Sepolia en ligne correspond à l'architecture précédente, et le jury doit pouvoir lire les contrats sur un explorateur (C8). Ajouter `--verify` pour les vérifier dans la foulée.
> 2. **Captures d'écran** du front (slides 13 et 14) et **schéma fonctionnel** (slide 7).
> 3. **Optionnel mais peu coûteux** : un workflow GitHub Actions qui rejoue les tests à chaque push, pour compléter la chaîne Ignition côté vérification automatique (voir slide 11).

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
| **Fabricant** | déclare ses lots de matière (matière, unité, certificat CE/ISO) et les expédie |
| **Distributeur** | réceptionne, revend au laboratoire ou directement au cabinet |
| **Laboratoire** | reçoit une prescription, consomme la matière, **crée le passeport de la prothèse** |
| **Praticien** | prescrit, réceptionne, atteste la conformité, pose et enregistre la dent |
| **Ordre / ARS** | lit l'intégralité du registre, déclarera les rappels de lot |

Fonctionnalités livrées : catalogue et déclaration de lots, **chaîne de responsabilité continue** sur la matière, en deux temps, **commande de matière** avec cascade vers le fabricant, **prescription de prothèse**, émission du passeport avec consommation de matière dans la même transaction, remise de dossier en deux temps, attestation de conformité, pose avec numéro de dent et empreinte anonyme du patient, QR code par prothèse, registre d'identité des acteurs, crédit d'usage `$CATENTA`.

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

**Dans le MVP :** toute la chaîne fabricant → distributeur → laboratoire → praticien → patient. Déclaration et circulation de la matière, commandes, prescription, fabrication du passeport, remise, conformité, pose avec dent et empreinte patient, crédit d'usage, agrément et identité des acteurs, QR code.

**Hors MVP, et pourquoi :**

| Écarté | Raison |
|---|---|
| **`RecallModule`** (rappel de lot) | c'est le point le plus distinctif du projet, et il **manque** — arbitrage de temps assumé. Entièrement additif : il ne touchera aucun contrat existant |
| **Caution qualité** (`BondModule`) | ajoute un enjeu économique réel, mais suppose un stablecoin et une logique de *slashing* qui doublerait la surface de sécurité |
| **Statut « déposée » + successeur** | le remplacement d'une prothèse cassée (scénario 2 du doc fonctionnel) |
| **IPFS** | les empreintes sont ancrées, les documents ne sont pas encore stockés |
| **Meta-transactions** | les cabinets n'ont pas d'ETH — condition d'adoption réelle, pas de démonstration |

**Pour l'oral.** Ne pas présenter le rappel comme « fait ». Le présenter comme **spécifié, chiffré et additif** — et expliquer que la chaîne de responsabilité livrée est précisément ce qui le rendra traçable jusqu'au détenteur courant.

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
- **1** — le praticien prescrit : matière, dent (FDI), teinte, description
- **2** — le laboratoire commande sa matière ; en rupture, le distributeur remonte au fabricant, le lien entre les deux commandes est conservé
- **3** — le laboratoire consomme la matière et émet le passeport, dans la même transaction
- **4** — remise du dossier, acceptée par le praticien
- **5** — conformité, pose, dent, empreinte anonyme du patient

**Les trois couches techniques :**

```
        CatentaRoles                    AUTORITÉ — « ai-je ce rôle ? »
             │
   ┌─────────┼─────────┬──────────┐
   ▼         ▼         ▼          ▼
PassportNFT  MaterialLots  ActorRegistry  CatentaCredit    STOCKAGES PERMANENTS
   │         │         │          │
   └─────────┴────┬────┴──────────┘
                  ▼
          LifecycleModule                MODULE REMPLAÇABLE
                  ┊
          Recall · Bond (v1)             MODULES ADDITIFS
```

---

## Slide 8 — Smart contracts *(C2)*

*Liens entre eux, librairies utilisées, fonctions principales.*

**Sept contrats, trois couches.** L'idée directrice : **ce qui doit survivre vit dans un stockage permanent, ce qui évoluera vit dans un module qu'on remplace.**

| Contrat | Rôle | Nature |
|---|---|---|
| `CatentaRoles` | l'autorité unique : rôles acteurs + rôles modules | permanent |
| `RoleAware` | base abstraite — donne accès à l'autorité | — |
| `PassportNFT` | un passeport = une prothèse, ERC-721 *soulbound* | permanent |
| `MaterialLots` | les lots, ERC-1155 ; **le lot porte sa matière et son unité** | permanent |
| `ActorRegistry` | raison sociale + SIREN des acteurs agréés | permanent |
| `CatentaCredit` | crédit d'usage `$CATENTA`, ERC-20 non transférable | permanent |
| `LifecycleModule` | toute la logique métier : lots, expéditions, commandes, prescriptions, cycle de vie | **remplaçable** |

**Aucun contrat ne connaît l'adresse d'un pair.** Chacun interroge `CatentaRoles`. Conséquence directe et démontrée par un test : **un nouveau module peut piloter les mêmes stockages** — on lui accorde les rôles, on les révoque à l'ancien, les passeports et les lots ne bougent pas.

**Fonctions principales :** `declareLot` · `declareShipment` / `acceptShipment` / `cancelShipment` · `placeMaterialOrder` / `escalateMaterialOrder` / `fulfilMaterialOrder` · `requestProsthesis` / `acceptProsthesisRequest` · `mintPassport` · `initiateHandoff` / `acceptHandoff` · `attestConformity` · `markPlaced`.

**OpenZeppelin, massivement** : `AccessControlEnumerable` (rôles **et** énumération des titulaires, ce qui évite un indexeur), `ERC721` + `ERC721Enumerable`, `ERC1155` + `ERC1155Supply` + `ERC1155Burnable`, `ERC20`. Version épinglée, imports nommés, et la suite de tests d'OpenZeppelin n'est pas rejouée.

**Pour l'oral — les trois décisions à défendre.**

1. **Le transfert en deux temps, partout.** Ni un passeport ni un lot ne peut être poussé sur un acteur : le destinataire accepte. Ce n'est pas du confort — c'est ce qui empêche de se débarrasser d'un lot rappelé chez un concurrent.
2. **Le lot se décrit lui-même.** Il porte sa matière *et son unité*. Un catalogue on-chain coûtait une transaction par produit et, republiable, aurait pu changer ce qu'un lot passé contenait. « 10 » ne veut rien dire ; « 10 lingotins » si.
3. **L'origine et la garde sont deux choses.** `LotInfo.manufacturer` ne bouge jamais ; la garde se lit dans les balances ERC-1155. C'est exactement ce qu'un rappel doit remonter.

---

## Slide 9 — Votre jeton *(C3)*

*Usage d'un jeton et choix de la norme.*

**Quatre standards, aucun jeton décoratif : chacun rend effective une fonctionnalité qui n'existerait pas sans lui.**

| Besoin | Standard | Pourquoi celui-là |
|---|---|---|
| Le passeport d'une prothèse | **ERC-721 *soulbound*** | un token = une prothèse. `_update` surchargé bloque tout transfert : une prothèse n'est pas un actif, elle appartient au patient. Le seul déplacement possible est la **remise de dossier acceptée**, autorisation à usage unique consommée par le transfert lui-même |
| Les lots de matière | **ERC-1155** | un lot **est** une quantité semi-fongible — « X g de zircone du lot N ». ERC-721 imposerait un token par gramme, ERC-20 un contrat par lot. `ERC1155Supply` donne gratuitement la quantité restante |
| Le crédit d'usage | **ERC-20 non transférable** | le modèle économique |
| La caution qualité (v1) | **ERC-20 externe** | jamais un jeton maison — voir ci-dessous |

**`$CATENTA`, le crédit d'usage.** L'abonnement est encaissé **hors chaîne** ; l'admin émet des crédits ; **chaque action utile en brûle un** (`modifier costsCredit`). Trois propriétés en font un crédit et non une monnaie :

1. **Non transférable** — seuls le *mint* et le *burn* passent. Aucun carnet d'ordres, aucun cours : il ne peut être ni listé ni échangé, par construction.
2. **Aucun plafond** — les crédits sont brûlés en continu et réémis à chaque renouvellement ; un plafond finirait par figer le système.
3. **Brûlé, jamais recyclé** — l'argent a déjà changé de main hors chaîne. Recycler ferait du crédit une monnaie qui circule, avec le risque réglementaire que ce design évite.

Décimales = 0 : un crédit est une unité entière.

**Pour l'oral — le piège du jeton de caution.** Une caution libellée dans un jeton qu'on émet soi-même **ne vaut rien** : le laboratoire pourrait s'en émettre autant qu'il veut. Le `BondModule` acceptera donc n'importe quel `IERC20` externe, fixé à la construction. C'est la question que le jury pose systématiquement sur les projets à jeton.

---

## Slide 10 — Sécurité *(C4)*

*Méthode d'auto-audit, failles potentielles et résolutions.*

**Méthode.** Revue systématique du code contre les **quinze familles de vulnérabilités** de l'atelier Solidity Hacking, complétée d'une relecture fonction par fonction selon trois axes — **rôle, état, montant** — avec un test par garde qui vérifie qu'elle **révoque**, pas seulement qu'elle laisse passer.

| Famille (atelier) | Statut dans Catenta |
|---|---|
| **Réentrance** (ex. 4) | 🔴 **Faille trouvée, corrigée, testée** — voir ci-dessous |
| « private » lisible on-chain (ex. 3) | traité **par conception** : aucune identité patient, seulement un *commitment* salé |
| Arithmétique, précision, arrondi (2, 6, 7, 9, 12) | **sans objet** : aucune division de valeur, aucun partage, aucun prix. Le seul cast réduisant (`uint128`) est gardé par un `require` |
| Type signé, contrôle de solde absent (6) | tout est non signé ; les soldes matière et crédits sont vérifiés avant écriture |
| Réinitialisation d'état, sémantique de `delete` (8, 9, 15) | l'autorisation de remise est **consommée dans `_update`** — c'est exactement le booléen que personne ne remet à zéro de l'ex. 15, évité. Statuts monotones |
| DoS par boucle non bornée (1) | **aucune boucle dans les contrats**. Le rappel de lot sera O(1) : une écriture sur le lot, jamais un parcours des passeports |
| DoS par push-payment (10, 13) | **sans objet** : aucun paiement, aucun transfert de valeur |
| Force-feeding, dépendance au solde (14) | **immunisé** : aucun contrat n'est `payable`, aucune logique ne lit `address(this).balance` |
| Collision `abi.encodePacked` (11) | **aucun `encodePacked`**. Le seul hachage de chaîne porte sur une chaîne unique, jamais sur une concaténation |
| Commit-reveal (5, référence) | appliqué au patient : *commit* on-chain, sel conservé hors chaîne et **jamais révélé** |

### La faille trouvée : réentrance sur l'émission d'une prothèse

`PassportNFT.mint` passe par `_safeMint`, qui appelle `onERC721Received` **sur le laboratoire**. Or `mintPassport` ne marquait la prescription « honorée » qu'**après** le mint. Un laboratoire qui est un contrat pouvait donc rentrer à nouveau depuis ce callback, voir la demande encore « acceptée », et **obtenir plusieurs passeports pour une seule prescription**.

Pas un vol de fonds — l'attaquant paie ses crédits et sa matière. Mais une **rupture de l'invariant central** du registre : une prescription, une prothèse. Et `request.tokenId` n'aurait gardé que le dernier, faussant le lien.

**Correction** : checks-effects-interactions. La demande est consommée **avant** le mint, seul le `tokenId` s'écrit après. Coût : zéro gas.

**Test de non-régression** : `contracts/test/ReentrantLab.sol` — un laboratoire-contrat qui tente réellement la réentrance. Le test vérifie que la seconde émission révoque et qu'**un seul passeport existe**. Réordonner le module dans le mauvais sens fait échouer le test.

### Autres points d'attention propres au métier

| Risque | Parade dans le code |
|---|---|
| Se débarrasser d'un lot rappelé chez un tiers | transfert direct refusé ; la garde ne bouge qu'au bout d'une expédition **acceptée** |
| Passeport traité comme un actif | *soulbound* par `_update` — tous les chemins de transfert y passent |
| Crédit brûlé sur une action qui échoue | `costsCredit` placé **après** les gardes ; la transaction étant atomique, un revert plus loin annule le burn |
| Rôle technique donné à un humain | rôles modules séparés des rôles acteurs ; la vue `/admin` marque toute adresse non reconnue |
| Dépassement de la limite EIP-170 | détecté par les tests eux-mêmes (« code too large ») ; optimiseur activé dans les deux profils |

### Le risque identifié et **non corrigé** : la clé d'administration

Aujourd'hui `DEFAULT_ADMIN_ROLE` est détenu par une seule clé, et sa compromission est totale : l'attaquant s'accorde instantanément n'importe quel rôle, y compris les rôles modules, et prend la main sur le registre.

**`AccessControlDefaultAdminRules`** (OpenZeppelin) ferme cette porte par le code. Cette extension d'`AccessControl` impose trois choses : un **titulaire unique** de `DEFAULT_ADMIN_ROLE`, un transfert de ce rôle en **deux temps** — annonce puis acceptation — séparés par un **délai obligatoire** inscrit dans le contrat, et l'impossibilité de l'accorder ou le révoquer directement par `grantRole`. Conséquence : une prise de contrôle devient **visible on-chain avant d'être effective**, et le consortium a le temps de réagir.

À combiner avec un **multisig (Safe)** sur l'admin. Les deux sont prévus, aucun n'est en place.

**Pour l'oral.** Ce qui n'a pas été fait : ni Slither, ni *fuzzing*, ni audit externe. La méthode est une revue structurée par familles connues, doublée de tests — pas un audit. Le dire vaut mieux que le laisser découvrir. Ce qui a été fait mérite en revanche d'être montré : **la revue a trouvé une vraie faille dans mon propre code, et le contrat attaquant est resté dans la suite de tests.**

---

## Slide 11 — Intégration continue *(C5)*

*Descriptif de l'ensemble des outils utilisés pour votre intégration continue.*

**Le déploiement des contrats est déclaratif, versionné et reprenable — c'est Hardhat Ignition.** Ce n'est pas un script : `ignition/modules/Catenta.ts` décrit la pile *et* le câblage des rôles, il vit dans le dépôt, et il apporte quatre propriétés qu'un script n'a pas.

| Propriété | Ce qu'elle garantit |
|---|---|
| **Déploiement comme code** | la pile et ses 7 attributions de rôles sont décrites dans un fichier versionné, relu en diff comme n'importe quel code |
| **Journal + reprise idempotente** | un déploiement interrompu — RPC qui coupe, `429`, timeout — **reprend où il s'est arrêté** et ne redéploie rien de déjà passé |
| **Réconciliation** | Ignition **refuse** de déployer un module devenu incompatible avec ce qui est déjà en ligne (« a dependency has been added »). C'est un garde-fou automatique contre le mélange de deux architectures dans une même pile |
| **Environnements** | `--deployment-id` isole les piles ; le journal de la précédente reste intact et ses adresses restent retrouvables |

**Vérification intégrée** : `--verify` enchaîne la vérification sur l'explorateur dans la même commande — le code source publié provient donc exactement de l'artefact déployé.

**Gestion des versions.** Version du compilateur **épinglée** (`0.8.34`, pas de caret) : elle fait partie de l'artefact déployé pour un registre non upgradable. Dépendances OpenZeppelin épinglées de même. Messages de commit conventionnels expliquant le *pourquoi* plutôt que le *quoi*. Conventions figées dans `docs/CONVENTIONS.md`.

**Le complément qui manque, et je le dis franchement.** Rien ne se déclenche **automatiquement à chaque commit** : si un contrat cassé est poussé, c'est un `npx hardhat test` manuel qui l'attrape. Un workflow GitHub Actions de vingt lignes — `lint → compile → test → coverage (seuil bloquant) → slither` — fermerait la boucle, et transformerait la couverture en chiffre opposable plutôt qu'en affirmation.

**Pour l'oral.** Si on demande « et si vous poussez un commit qui casse un test ? », répondre sans détour : aujourd'hui rien ne l'attrape avant l'exécution manuelle des tests ; Ignition protège le **déploiement**, pas l'**intégration**. C'est une lacune identifiée, pas une lacune ignorée.

---

## Slide 12 — Testing *(C6)*

*Logique et résumé des tests.*

**39 tests, huit blocs**, en TypeScript / Mocha / ethers v6. La logique : **un test par garde**, et chaque test raconte une phrase métier plutôt qu'un appel de fonction.

| Bloc | Ce qu'il démontre |
|---|---|
| `smoke` | le parcours complet fabricant → distributeur → laboratoire → praticien → patient, en une seule lecture |
| `usage credit` | un crédit brûlé par action utile, l'action bloquée à zéro crédit, la non-transférabilité, la phase pilote gratuite |
| `un lot se décrit lui-même` | matière et unité lisibles sans fichier annexe, deux unités différentes coexistent |
| `material custody chain` | transfert direct refusé, garde impossible sans le rôle, destinataire non éligible, quantité insuffisante, annulation, double acceptation |
| `actor registry` | un fabricant ne peut pas être nommé, SIREN à neuf chiffres, effacement |
| `material orders` | commande → livraison, cascade tracée, refus et annulation motivés, matière livrée conforme à la commande |
| `prosthesis requests` | prescription → passeport, fabrication refusée si la demande n'est pas acceptée |
| `delegated onboarding` | un agent d'agrément agrée sans être administrateur, et ne peut pas s'auto-promouvoir |

**Trois tests que je montrerais en priorité :**

1. **« un nouveau module pilote les mêmes stockages »** — la revendication de modularité, prouvée : on déplace les rôles, le passeport existant survit, l'ancien module devient impuissant.
2. **« l'historique de garde est lisible depuis le storage seul »** — trois expéditions, trois issues distinctes (acceptée, annulée, acceptée), **sans lire un seul event**.
3. **« un crédit exactement par action utile »** — la comptabilité du modèle économique, décrément par décrément le long de la chaîne.

**Limite honnête** : ~95 % des *lignes*, mais les chemins d'erreur restent moins couverts que les chemins nominaux. Pas de tests de propriétés ni de *fuzzing*.

---

## Slide 13 — Front 1/2 *(C7)*

*Technologies et description des pages.*

**Stack** : Vue 3 (Composition API) · Vite · TypeScript · Pinia · vue-i18n (FR/EN) · Tailwind · **ethers v6** · **Reown AppKit** (ex-WalletConnect) pour la connexion.

**Le principe qui structure tout le front : il n'a aucune autorité.** Le rôle est lu on-chain via `CatentaRoles.hasRole` ; l'interface ne fait que refléter ce que le contrat accepterait. **Un bouton absent n'est jamais une sécurité** — le contrat reste seul juge. Une personne sans rôle voit l'application en lecture seule plutôt qu'un mur.

**Une seule adresse à configurer.** `VITE_LIFECYCLE_ADDRESS` : le module expose `ROLES`, `PASSPORTS`, `LOTS` et `CREDIT` en `public immutable`, donc le front découvre le reste de la pile au démarrage. Le jour où un module en remplace un autre, **une seule valeur change**.

**Pages :**

| Page | Contenu |
|---|---|
| `/` connexion | rôles expliqués, réseau attendu, accès lecture seule |
| `/lots` matière | déclaration (fabricant), réceptions à confirmer, expéditions en attente, cartes de lot filtrées par garde |
| `/lots/:id` parcours | la vie d'un lot reconstituée **depuis le storage**, garde actuelle, prothèses issues |
| `/passports` prothèses | émission, onglets « les miennes / à accepter / toutes » |
| `/passports/:id` fiche | cycle de vie, traits figés, dent et date de pose, **QR code**, actions selon rôle et statut |
| `/admin` | agrément + identité des acteurs, opérateurs, crédits, pile déployée |
| `/architecture` | la pédagogie de l'architecture, pour le lecteur non technique |

> ⚠️ **À ajouter** : captures d'écran.

---

## Slide 14 — Front 2/2 *(C7)*

**Trois partis pris qui méritent d'être défendus.**

**1. Aucun indexeur, et aucune lecture de logs.** Toutes les listes se lisent par index borné : `tokenOfOwnerByIndex` pour les prothèses d'un cabinet, `lotCount()`, `shipmentCount()`. C'est précisément pour ça qu'`ERC721Enumerable` a été retenu malgré son coût au mint (~50 000 gas) : **payer au mint pour supprimer une dépendance d'infrastructure entière** est le bon échange tant que l'indexeur n'existe pas. Conséquence : aucun `getLogs`, donc aucune dépendance à la générosité d'un RPC public.

**2. L'affichage suit le rôle.** Un fabricant ne voit pas les prothèses — elles ne le concernent pas. Un laboratoire ne voit que la matière dont il a la garde, et **avec sa quantité à lui** (« 200 g en votre garde ») plutôt que le total du lot. **Administrer n'est pas un droit de lecture** : un administrateur ou un agent d'agrément ne voit qu'Administration. Les rôles se cumulent : une adresse à la fois laboratoire et praticien garde les deux vues.

**3. Le QR n'encode rien.** Seulement l'adresse de la fiche. Tout est relu on-chain à l'ouverture, donc **un QR imprimé ne périme jamais** et ne peut pas porter d'information fausse.

**Soin apporté aux erreurs.** Chaque *custom error* du contrat est traduite en une phrase en français ou en anglais. L'utilisateur ne voit jamais « execution reverted (unknown custom error) ».

> ⚠️ **À ajouter** : captures d'écran (parcours du lot, fiche prothèse avec QR, agrément).

---

## Slide 15 — Déploiement *(C8)*

*Tooling et procédures particulières.*

**Hardhat 3** · **Ignition** (déploiement déclaratif et reprenable) · **keystore chiffré** pour les secrets — jamais un `.env`, jamais l'historique shell.

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/Catenta.ts --network sepolia \
  --deployment-id catenta-v2
```

Le module déploie **6 contrats** et enchaîne **7 attributions de rôles** — sans elles les stockages refusent toute écriture, et c'est voulu : c'est aussi ce qui rend un module remplaçable.

**Trois particularités apprises en le faisant.**

1. **L'optimiseur est obligatoire, pas préférentiel.** Avec les commandes, `LifecycleModule` compile à **27 kB** sans lui — au-delà de la limite EIP-170 de 24 576 octets, que le réseau de test applique exactement comme Sepolia. Aucun test ne passait. Optimisé : **19,9 kB**.
2. **L'endpoint RPC d'un wallet ne tient pas un déploiement.** Ignition envoie chaque *batch* en parallèle ; `rpc.walletconnect.org` étrangle la rafale et répond `403` en plein milieu. Un fournisseur classique (Infura, Alchemy) encaisse.
3. **Un `--deployment-id` explicite.** Sans lui, un module dont la forme a changé déclenche une erreur de réconciliation — Ignition refuse de mélanger deux architectures dans un même déploiement. Avec, le journal de la pile précédente reste intact.

> ⚠️ **À faire** : redéployer l'architecture actuelle et reporter les adresses. La vérification Etherscan (`hardhat verify`) n'est pas encore automatisée.

---

## Slide 16 — Bilan de projet et améliorations

**Ce qui a le mieux fonctionné.** L'architecture à trois couches a tenu ses promesses : au fil du projet, le module de cycle de vie a été **profondément remanié quatre fois** — ajout d'un fabricant, circulation de la matière, commandes, prescriptions — sans jamais toucher aux stockages permanents. La revendication de modularité n'est pas théorique, elle a été vécue.

**Ce que je referais autrement.**

- **Écrire le document fonctionnel avant le code.** Il est arrivé en cours de route, et la moitié du travail a consisté à réaligner un code qui décrivait un parcours plus court que le vrai — un laboratoire y déclarait la matière qu'il aurait dû recevoir.
- **Décider tôt de ce qui est on-chain.** J'ai fait l'aller-retour : catalogue matière hors chaîne, puis on-chain, puis supprimé au profit d'un lot qui se décrit lui-même. La bonne question n'était pas « où stocker le nom » mais **« qu'est-ce qui doit rester lisible dans dix ans sans fichier annexe »**.
- **Monter la CI dès le premier commit**, quand elle coûte cinq minutes.

**Améliorations, par ordre de valeur.**

1. **`RecallModule`** — le rappel de lot en une écriture, statut « rappelé » **dérivé** à la lecture, accusés de réception on-chain. C'est la preuve d'exécution qui manque au processus papier.
2. **Statut « déposée » et lien successeur** — la prothèse qui casse et se remplace, avec un historique qui conserve les deux.
3. **CI, couverture bloquante, Slither, tests de propriétés.**
4. **Multisig sur l'admin** et `AccessControlDefaultAdminRules`.
5. **IPFS** — les empreintes sont déjà ancrées dans des `bytes32` : un CIDv1 sha2-256 y tient, presque rien à changer côté contrat.
6. **Meta-transactions ERC-2771 et déploiement L2** — les cabinets n'ont pas d'ETH ; c'est une condition d'adoption, pas un raffinement.

**Limites à énoncer avant qu'on les trouve.**

- **L'état du module est perdu s'il est remplacé.** Statuts, commandes et prescriptions y vivent. Les passeports et les lots survivent — c'est le prix assumé de ne pas utiliser de proxy.
- **Pseudonymité, pas anonymat.** Un fabricant n'est jamais nommé, mais lots, destinataires et horodatages restent publics : il reste identifiable par recoupement.
- **Les matières se comparent comme des chaînes de caractères.** « Zircone A2 » et « zircone a2 » sont deux matières distinctes pour le contrat. Le sélecteur partagé le mitige, rien ne l'impose.
- **Le maillon faible reste humain** : rien ne garantit que la prothèse physiquement posée est celle que le registre désigne. La co-signature EIP-712 au moment de la remise est la parade envisagée.

---

## Slide 17 — Conclusion

> ⚠️ **À écrire par toi** — c'est un retour personnel sur la formation, ton apprentissage, tes motivations et tes regrets. Personne ne peut l'écrire à ta place, et un jury sent immédiatement un texte qui n'est pas vécu.

**Quelques angles honnêtes si tu bloques :**

- Ce que la contrainte du gas t'a appris sur la conception — le *packing*, la limite EIP-170 découverte par un test qui échoue, l'arbitrage « payer au mint pour supprimer un indexeur ».
- Ce que l'immuabilité change dans la manière de décider : impossible de « corriger plus tard », donc chaque champ stocké est un engagement.
- Le RGPD comme contrainte de conception et non comme case à cocher : c'est lui qui impose le *commitment* salé, l'absence de nom de personne, et la doctrine « l'empreinte on-chain, le document dehors ».
- Ce que tu aurais voulu avoir le temps de faire, et pourquoi tu as arbitré autrement.
