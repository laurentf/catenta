# Découpage et sécurité — état réel et pistes

Document d'architecture. Il dit ce qui est **vrai aujourd'hui**, ce qui a été **corrigé**, et ce qui reste **ouvert** — avec pour chaque point la gravité, l'effort, et le correctif concret.

> Rédigé après une revue du code contre les quinze familles de vulnérabilités de l'atelier Solidity Hacking, puis une relecture de la logique métier. Trois failles ont été trouvées, dont deux hors des familles classiques.

---

# Partie 1 — Le découpage

## 1.1 Ce qui est solide, et prouvé

Les stockages permanents **ne connaissent jamais** l'adresse d'un module. Ils demandent `ROLES.hasRole(...)`. C'est le seul point de couplage du système, et il est indirect.

Conséquence directe et testée (`lets a NEW module drive the SAME stores`) : déployer un module, lui accorder ses six rôles, les révoquer à l'ancien — le passeport existant est intact, le nouveau module écrit, l'ancien révoque.

**La revendication qui tient sans réserve : l'extension.** Le `RecallModule` se déploiera, recevra un rôle, lira les lots — et **aucune ligne des contrats existants ne bougera**. Idem pour la caution. C'est la moitié forte de l'argument, et elle est entière.

## 1.2 Ce que « remplaçable » coûte réellement

Inventaire exact de l'état détenu par `LifecycleModule` :

| Donnée | Ce qu'elle représente |
|---|---|
| `_status[tokenId]` | l'étape du cycle de vie d'une prothèse |
| `_commitment[tokenId]` | le lien au patient |
| `_placement[tokenId]` | praticien, date, dent |
| `_shipments` + `shipmentCount` | toute la chaîne de responsabilité |
| `_materialOrders` + `materialOrderCount` | les commandes et leur cascade |
| `_requests` + `prosthesisRequestCount` | les prescriptions |
| `actionCost` | le tarif courant |

Et ce que les stockages gardent : propriété du passeport, traits figés (lot, date, quantité consommée, empreinte de conformité), lots avec matière et unité, balances de matière, identités, crédits.

**Donc « les passeports survivent » est vrai mais trompeur.** Le jeton survit ; ce qui le rend *signifiant* — son statut, qui l'a posé, quand, sur quelle dent, le lien au patient — vit dans la partie remplaçable. Pour un registre de traçabilité, **l'acte clinique est du mauvais côté de la frontière.**

À dire tel quel : le découpage est **excellent pour l'extension, seulement acceptable pour le remplacement.** Confondre les deux, c'est ce qu'un lecteur attentif attrapera.

## 1.3 Ce n'est pas une perte de données

L'ancien contrat existe toujours et **ses lectures répondent pour toujours**. `statusOf`, `placementOf`, `patientCommitmentOf`, `shipmentOf` restent appelables. La donnée n'est pas détruite : la **lecture est scindée** entre deux adresses. C'est une charge de migration, pas une perte — et ça change la gravité du tout au tout.

## 1.4 Le motif à retenir : la migration paresseuse

À implémenter dans le prochain module, pas dans celui-ci.

```solidity
contract LifecycleModuleV2 {
    LifecycleModule public immutable PREVIOUS;
    mapping(uint256 tokenId => bool) private _owned;   // V2 a-t-il repris ce jeton ?

    function statusOf(uint256 id) external view returns (Status) {
        return _owned[id] ? _status[id] : PREVIOUS.statusOf(id);
    }

    function _adopt(uint256 id) private {
        if (_owned[id]) return;
        _status[id] = PREVIOUS.statusOf(id);      // on TIRE le vrai état ancien
        _commitment[id] = PREVIOUS.patientCommitmentOf(id);
        _placement[id] = PREVIOUS.placementOf(id);
        _owned[id] = true;
    }
}
```

Chaque écriture appelle `_adopt` d'abord. Le point qui compte : **la reprise lit le vrai état de l'ancien module**, elle n'est pas une copie fournie par un administrateur. Personne n'a à faire confiance à qui que ce soit, et l'immuabilité tient.

Même principe pour expéditions, commandes et prescriptions — en démarrant les compteurs de V2 **au-dessus** des derniers de V1, pour qu'un identifiant reste unique à travers les deux modules.

Coût : une lecture externe supplémentaire à la première écriture par jeton. Bénéfice : le remplacement devient transparent pour le front, qui continue de n'interroger qu'une adresse.

## 1.5 La découpe qui manque : par phase

`LifecycleModule` pèse **19,9 ko sur 24,6** et porte des préoccupations qui n'ont plus grand-chose en commun. L'argument « c'est un seul workflow » s'affaiblit à mesure qu'il grandit.

La découpe naturelle est **par phase du parcours**, et elle ne crée aucun couplage :

| Module | Fonctions | Rôles nécessaires | État |
|---|---|---|---|
| **SupplyModule** | `declareLot`, expéditions, commandes de matière | `LOT_MINTER`, `LOT_CUSTODIAN`, `CREDIT_SPENDER` | expéditions, commandes |
| **ClinicalModule** | prescriptions, `mintPassport`, remise, conformité, pose | `LOT_BURNER`, `PASSPORT_MINTER`, `PASSPORT_CONTROLLER`, `CREDIT_SPENDER` | prescriptions, statuts, commitments, poses |

**Les deux ne s'appellent jamais.** Le module clinique brûle de la matière en lisant `MaterialLots` directement, avec son propre rôle — il n'a aucun besoin du module amont. C'est ce qui rend cette découpe fidèle à l'architecture, là où une découpe par « couche technique » aurait créé des appels inter-modules.

**Bénéfices** : chaque module tombe autour de 8–10 ko, avec de la marge ; on peut remplacer la logique clinique sans toucher à la logistique, et inversement ; et la surface qu'un remplacement met en jeu est divisée par deux.

**Coût** : le front découvre deux adresses au lieu d'une, et `actionCost` est dupliqué (ou extrait dans une configuration partagée).

## 1.6 Ce qu'il ne faut pas faire

- **Un proxy.** Il rendrait le code mutable, ce qui détruit l'argument central du projet : l'historique ne peut pas être réécrit *après* l'incident. Le prix payé — l'état du module perdu au remplacement — est le prix de cette garantie.
- **Coupler les modules entre eux.** Un module qui en appelle un autre recrée exactement la dépendance d'adresse que `CatentaRoles` a supprimée. Les modules parlent aux **stockages**, jamais entre eux.

---

# Partie 2 — La sécurité

## 2.1 Corrigé

### 🔴 Réentrance sur l'émission d'une prothèse

`PassportNFT.mint` passe par `_safeMint`, qui appelle `onERC721Received` **sur le laboratoire**. Or `mintPassport` ne marquait la prescription honorée qu'**après** le mint. Un laboratoire-contrat pouvait rentrer à nouveau depuis ce callback, voir la demande encore acceptée, et obtenir **plusieurs passeports pour une seule prescription**.

Pas un vol : l'attaquant paie ses crédits et sa matière. Mais une rupture de l'invariant central du registre — une prescription, une prothèse — et un `request.tokenId` qui n'aurait gardé que le dernier.

**Correctif** : checks-effects-interactions. La demande est consommée **avant** le mint, seul le `tokenId` s'écrit après. Coût zéro.
**Test** : `contracts/test/ReentrantLab.sol`, un laboratoire-contrat qui tente réellement l'attaque. Réordonner le module dans le mauvais sens fait échouer le test.

### 🟠 Une commande « honorée » que rien ne livre

Le fournisseur honore une commande — l'ordre passe à `Fulfilled`, une expédition est créée — puis annule cette expédition. La commande restait marquée honorée alors que **rien n'était livré**.

Pour un registre de traçabilité, c'est plus grave qu'un vol : c'est une **affirmation fausse**, du genre qu'un tribunal irait lire.

**Cause** : la commande connaissait son expédition, jamais l'inverse.
**Correctif** : un lien retour dans un mapping séparé — seules les expéditions nées d'une commande paient ce slot. Annuler une telle expédition **rouvre la commande**.

### 🟠 Un fabricant qui garde son nom

La règle « un fabricant n'est jamais nommé » n'était vérifiée qu'**à l'écriture**. Si l'agent d'agrément nommait un laboratoire, puis que la racine lui accordait `MANUFACTURER_ROLE`, **le nom survivait**. La neutralité concurrentielle dépendait de l'ordre des deux actes.

**Correctif** : la règle est aussi vérifiée **à la lecture** — `actorOf` renvoie vide pour toute adresse portant le rôle fabricant.

> **La leçon générale, et elle vaut au-delà de ce cas** : une garantie posée à l'écriture n'en est pas une si l'état qu'elle contrôle peut changer après. Quand l'invariant porte sur une donnée mutable, il faut le vérifier là où on l'affirme.

## 2.2 Ouvert, par gravité

### 🔴 La clé d'administration est un point de défaillance unique

`DEFAULT_ADMIN_ROLE` est détenu par une clé. Sa compromission est **totale** : l'attaquant s'accorde n'importe quel rôle et prend la main sur le registre entier.

Et il faut voir jusqu'où ça va. Les rôles modules ne sont pas des permissions modestes :

| Rôle | Ce qu'il permet |
|---|---|
| `LOT_CUSTODIAN` | déplacer la garde de **n'importe quelle matière de n'importe qui** |
| `LOT_BURNER` | **détruire** la matière de n'importe qui |
| `PASSPORT_CONTROLLER` | déplacer le passeport de n'importe qui |
| `PASSPORT_MINTER` | créer des passeports au nom de n'importe qui |
| `CREDIT_SPENDER` | brûler les crédits de n'importe qui |

**La sécurité de tout le système se réduit donc à une seule question : qui peut accorder un rôle ?** La flexibilité de l'architecture **est** sa surface d'attaque — c'est le prix du découplage, et il faut le dire.

**Correctifs, à faire ensemble :**
1. **Multisig (Safe)** sur `DEFAULT_ADMIN_ROLE` — rend la compromission difficile.
2. **`AccessControlDefaultAdminRules`** (OpenZeppelin) — rend la prise de contrôle **détectable**. Cette extension impose un titulaire unique, un transfert en deux temps (annonce puis acceptation) séparés par un **délai inscrit dans le contrat**, et interdit d'accorder ou révoquer ce rôle par `grantRole`. Une prise de contrôle devient **visible on-chain avant d'être effective**.
3. **`TimelockController`** sur les attributions de rôles modules, en v2.

*Effort : faible (extension OZ + configuration du Safe). Impact : le plus élevé du document.*

### 🟠 `setActionCost` n'est pas borné

L'administrateur peut fixer le coût par action à `type(uint256).max` et **geler le registre entier** : plus personne ne peut agir. Ce n'est pas une faille de code, c'est un pouvoir d'admin non plafonné.

**Correctif** : `require(_cost <= MAX_ACTION_COST)` — une ligne. À combiner avec le timelock, qui rendrait le changement visible avant d'être effectif.

*Effort : trivial.*

### 🟠 Ni Slither, ni fuzzing, ni audit externe

La méthode est une revue structurée par familles connues, doublée de tests. **Ce n'est pas un audit**, et il faut le dire plutôt que le laisser découvrir.

**Correctifs** : `slither` dans la CI avec un `slither.config.json` justifié (sinon rouge permanent sur OpenZeppelin) ; tests de propriétés `forge-std` sur les invariants qui comptent — verrou soulbound, conservation des quantités le long de la chaîne, comptabilité du crédit.

### 🟡 Le front scanne sans borne

Les listes du front itèrent sur `lotCount()`, `mintedCount()`, `shipmentCount()`. C'est un choix assumé — aucun indexeur, aucune lecture de logs, donc aucune dépendance à la générosité d'un RPC. Mais ça ne passe pas l'échelle : à quelques milliers de passeports, il faut un indexeur.

Ce n'est **pas une faille de sécurité** : aucun contrat ne boucle, donc aucun DoS par le gas. C'est une limite de montée en charge, à ne pas confondre.

### 🟡 Le maillon humain

Rien ne garantit que la prothèse **physiquement** posée est celle que le registre désigne. Un praticien peut scanner un passeport et poser autre chose. C'est le problème de l'oracle, et aucune blockchain ne le résout seule.

**Piste** : co-signature EIP-712 au moment de la remise — le laboratoire et le praticien signent le même acte, ce qui ne prouve pas l'objet mais engage les deux parties dessus.

## 2.3 Immunisé par conception — et pourquoi le dire

Ces familles sont **sans objet**, et c'est le résultat de choix, pas de chance :

| Famille | Pourquoi elle ne s'applique pas |
|---|---|
| Réentrance sur retrait de fonds | **aucun contrat n'est `payable`**, aucune valeur ne transite |
| Force-feeding, dépendance au solde | aucune logique ne lit `address(this).balance` |
| DoS par push-payment | aucun paiement |
| DoS par boucle non bornée | **aucune boucle dans les contrats** ; le rappel sera O(1) — une écriture sur le lot, jamais un parcours des passeports |
| Arithmétique, précision, arrondi | aucune division de valeur, aucun partage, aucun prix. Le seul cast réduisant (`uint128`) est gardé par un `require` |
| Collision `abi.encodePacked` | aucun `encodePacked` ; le seul hachage de chaîne porte sur une chaîne unique |
| « private » lisible on-chain | traité de front : aucune identité patient, seulement un *commitment* **salé** |
| Sémantique de `delete`, état non réinitialisé | l'autorisation de remise est **consommée dans `_update`** — précisément le booléen que personne ne remet à zéro, évité |

## 2.4 Ordre d'attaque recommandé

| # | Action | Effort | Impact |
|---|---|---|---|
| 1 | Plafonner `setActionCost` | trivial | 🟠 |
| 2 | `AccessControlDefaultAdminRules` + multisig | faible | 🔴 |
| 3 | Slither dans la CI | faible | 🟠 |
| 4 | Tests de propriétés sur les invariants | moyen | 🟠 |
| 5 | Découpe SupplyModule / ClinicalModule | moyen | découplage |
| 6 | Migration paresseuse dans le prochain module | moyen | continuité |
| 7 | Co-signature EIP-712 à la remise | élevé | 🟡 |
