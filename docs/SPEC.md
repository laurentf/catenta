# Catenta — Spécification fonctionnelle et technique

Document de référence du projet. Il tient lieu de **cahier des charges (C1)** et de spécification d'implémentation.
Il précise, complète et parfois **corrige** le [dossier technique de cadrage](Passeport_Dentaire_dossier_technique.md) : les écarts sont signalés explicitement (§13).

---

## 1. Besoin, objectifs et périmètre (C1)

### 1.1 Le besoin

Le passeport d'un dispositif médical sur mesure est aujourd'hui un document papier remis par le laboratoire au cabinet. Il est perdable, falsifiable et non interopérable. Trois défaillances en découlent :

1. **Le rappel de lot n'a pas de preuve d'exécution.** Un lot de matériau défectueux se signale par téléphone, fax ou e-mail. Personne ne peut démontrer *a posteriori* qu'un cabinet donné a été prévenu, ni quand.
2. **Le praticien est exposé sans documentation opposable.** En cas de contrôle ARS/Ordre ou de litige patient, la charge de la preuve de conformité lui revient, sur la base de documents qu'il ne produit pas lui-même.
3. **Le sur-mesure est hors du cadre UDI.** Le système d'identification unique des dispositifs médicaux exclut explicitement les dispositifs sur mesure : le vide n'est comblé par aucun registre.

### 1.2 L'apport de la blockchain (à démontrer, C1)

Le point à défendre n'est **pas** la performance ou le coût — une base de données serait meilleure sur les deux. C'est la **confiance entre parties non coopératives** :

- Les laboratoires sont en concurrence directe. Aucun n'hébergera la vérité des autres, et aucun n'acceptera qu'un concurrent puisse la modifier.
- L'immuabilité a une valeur *juridique* précise : elle rend impossible la réécriture de l'historique **après** l'incident. C'est exactement ce qui protège le praticien.
- L'Ordre et l'ARS obtiennent une lecture directe et vérifiable, sans dépendre de l'accès qu'un acteur privé voudrait bien leur consentir.

> **Honnêteté intellectuelle attendue à l'oral.** La blockchain ne garantit pas la véracité de la donnée *à la source* (problème de l'oracle physique↔numérique). Elle garantit qu'une fois inscrite, elle est horodatée, attribuée à un signataire identifié et non réécrivable. La parade partielle retenue est la **co-signature** (§6.4).

### 1.3 Objectifs

**Qualitatifs** — un dispositif = un enregistrement infalsifiable, du lot de matière jusqu'à la pose ; un rappel prouvable ; une lecture régulateur sans intermédiaire.

**Quantitatifs (cibles de la démo Sepolia)** — un rappel de lot en **une transaction** quel que soit le nombre de passeports concernés ; le statut d'un passeport lisible en **une lecture** ; couverture de tests **> 80 %** ; toutes les interactions du contrat exécutables depuis le front public.

**Cible** — laboratoires de prothèse, cabinets dentaires, distributeurs/dépôts dentaires, Ordre national des chirurgiens-dentistes et ARS.

**Périmètre** — la France, les dispositifs sur mesure fixes et amovibles.

### 1.4 Hors périmètre (assumé)

| Exclu | Raison |
|---|---|
| Portefeuille patient | le patient n'a pas de wallet ; le passeport est **détenu par le cabinet**, le patient est lié par un engagement salé (§9) |
| Paiement / facturation | sans rapport avec la traçabilité |
| Gouvernance décentralisée (DAO) | le régulateur est une autorité **désignée**, pas élue |
| Upgradeabilité (proxy) | refusée : un registre de preuve dont le code peut changer perd sa valeur probante (§10) |
| Intégration réelle Julie/Logos | v2, hors scope certification |

---

## 2. Acteurs et rôles (RBAC)

| Rôle (`AccessControl`) | Acteur | Droits |
|---|---|---|
| `LAB_ROLE` | laboratoire de prothèse | déclarer un lot, minter un passeport (consomme le lot), staker et retirer la caution |
| `PRACTITIONER_ROLE` | praticien / cabinet | attester la conformité, marquer la pose, signaler un incident, accuser réception d'un rappel |
| `DISTRIBUTOR_ROLE` | dépôt dentaire | accuser réception d'un rappel et le relayer (preuve de diffusion) |
| `REGULATOR_ROLE` | Ordre + ARS | lecture totale, déclarer un rappel, *slasher* une caution, autoriser un transfert de dossier, mettre en pause |
| `REGISTRAR_ROLE` | opérateur d'agrément | **agréer les acteurs** (LAB / PRACTITIONER / DISTRIBUTOR) — sans être la racine |
| `DEFAULT_ADMIN_ROLE` | consortium (racine) | gérer les rôles sensibles (registrar, régulateur, modules, crédits) — **derrière un multisig** (v2 : + timelock) |

**Agrément délégué — plusieurs opérateurs sans multiplier la racine.** `LAB_ROLE`, `PRACTITIONER_ROLE` et `DISTRIBUTOR_ROLE` ont pour **admin-role** `REGISTRAR_ROLE` (posé par `_setRoleAdmin` au constructeur), pas `DEFAULT_ADMIN_ROLE`. Un agent d'agrément peut donc inscrire des acteurs **sans détenir la racine**. C'est la réponse propre à « il faut plusieurs administrateurs » : on multiplie l'**opérateur**, pas la **super-racine** (attaque n°13). `REGISTRAR_ROLE` est lui-même administré par la seule racine, tout comme `REGULATOR_ROLE`, les rôles modules et `CREDIT_MINTER_ROLE`. Ce découpage est aussi celui qui **survit à `AccessControlDefaultAdminRules`** (v1/v2), lequel force `DEFAULT_ADMIN_ROLE` à un unique détenteur. Sans rôle, pas de mint : c'est la parade au **faux passeport**.

**Le distributeur a une fonction on-chain réelle.** Le dossier de cadrage lui prêtait un rôle purement narratif (« relai d'alerte »). Ici il **accuse réception** du rappel (`acknowledgeRecall`) : c'est précisément la preuve d'exécution qui manque au processus papier. Un rôle sans fonction on-chain aurait été un rôle décoratif — c'est le genre de détail qu'un jury relève.

---

## 3. Schéma fonctionnel et arborescence (livrable C1)

### 3.1 Schéma fonctionnel

```
  LABORATOIRE                PRATICIEN              RÉGULATEUR (Ordre/ARS)      DISTRIBUTEUR
      │                          │                           │                       │
 stakeBond ─────────────┐        │                           │                       │
      │                 │        │                           │                       │
 declareLot(certHash)   │        │                           │                       │
      │  └─► mint ERC-1155 (quantité)                        │                       │
      │                 │        │                           │                       │
 mintPassport(lot, qty, conformityHash)                      │                       │
      │  └─► burn ERC-1155 · mint ERC-721 · statut = Manufactured │                      │
      │                 │        │                           │                       │
      ├── initiateHandoff(id, praticien) ──► acceptHandoff ──┤                       │
      │                          │  (transfert 2 temps)      │                       │
      │              attestConformity(id) ──► statut = Certified                      │
      │                          │                           │                       │
      │              markPlaced(id, patientCommitment) ──► statut = Placed             │
      │                          │                           │                       │
      │              reportIncident(id, evidenceHash) ──────►│                       │
      │                          │                           │                       │
      │                          │      declareRecall(lotId, evidenceHash)           │
      │                          │           │  1 écriture, O(1)                     │
      │                          │           ├──► statut dérivé = Recalled            │
      │                          │           │    pour TOUS les passeports du lot    │
      │                          │◄──────────┴──────── event RecallDeclared ────────►│
      │                          │                           │                       │
      │                    acknowledgeRecall(lotId) ─────────►│◄── acknowledgeRecall │
      │                          │      (preuve d'exécution horodatée, par acteur)   │
      │                          │                           │                       │
      │◄─────────────────────── slash(lab, montant, lotId) ───┤                      │
 requestBondWithdrawal ─► (délai) ─► withdrawBond            │                       │
```

### 3.2 Arborescence de l'application web

```
/                        connexion wallet — détection du rôle on-chain
├── /passports           liste des passeports, filtrée par rôle
│   └── /passports/:id   fiche : timeline, lot d'origine, statut (dérivé), documents
├── /lots                lots de matériaux — déclaration (labo), consultation (tous)
│   └── /lots/:id        fiche lot : certificat, quantité restante, passeports issus
├── /recalls             rappels en cours — déclaration (régulateur),
│                        accusés de réception (praticien / distributeur),
│                        tableau de suivi « X/Y acteurs ont accusé réception »
├── /bond                caution — stake & retrait (labo), slashing (régulateur)
└── /admin               attribution des rôles (admin)
```

**Une vue, des panneaux selon le rôle.** Le rôle est lu on-chain (`hasRole`) et détermine les panneaux affichés, pas des routes distinctes. Un visiteur sans rôle a un accès **lecture seule** — cohérent avec une chaîne publique où « cacher » n'a aucun sens (§9.3).

---

## 4. Contrats — trois couches

> **Révision d'architecture.** Une version antérieure de ce document décrivait un **hub orchestrateur** unique (`DentalRegistry`) portant toute la logique et tout l'état, les contrats de jetons n'obéissant qu'à lui via `onlyRegistry`. Cette conception a été abandonnée : figer une adresse dans un stockage permanent obligeait à **redéployer les jetons — donc à perdre tous les passeports — pour changer une simple règle métier**. `DentalRegistry` n'existe plus ; il est scindé en une autorité et un module.

| Couche | Contrat | Rôle | Durée de vie |
|---|---|---|---|
| **Autorité** | `CatentaRoles` | tous les rôles : acteurs agréés + contrats autorisés à écrire | permanent |
| **Stockage** | `PassportNFT` (ERC-721) | le passeport et ses traits figés à la fabrication | **permanent** |
| **Stockage** | `MaterialLots` (ERC-1155) | les lots et leurs quantités | **permanent** |
| **Stockage** | `CatentaCredit` (ERC-20) | le crédit d'usage `$CATENTA`, soldes par acteur (§8.9) | **permanent** |
| **Module** | `LifecycleModule` | machine à états, handoff, orchestration du mint, **facturation en crédits** | remplaçable |
| **Module** | `RecallModule` *(v1)* | rappel de lot, statut dérivé, accusés de réception | remplaçable |
| **Module** | `BondModule` *(v1)* | caution qualité : stake, délai de retrait, slashing | remplaçable |
| **Jeton externe** | caution `IERC20` | **non émis par le projet** (§8.3) — mock sur testnet | tiers |

### 4.1 La règle de placement

> *Ce qui doit survivre vit dans un stockage permanent. Ce qui est susceptible d'évoluer vit dans un module qu'on peut remplacer. Aucun contrat ne connaît l'adresse d'un pair : tout passe par un rôle demandé à `CatentaRoles`.*

- Les **stores** ne portent que l'immuable — traits de fabrication, soldes de lots — et n'appliquent qu'une règle : *l'appelant a-t-il le rôle ?* Aucune logique métier.
- Le **module** porte le mutable — statut, engagement patient — et toutes les règles.
- **Ajouter** un module (rappel, caution) ne touche aucun contrat existant : on déploie, on accorde un rôle. **Remplacer** le module de cycle de vie exigerait en revanche de migrer les statuts : la donnée permanente survit, l'état local d'un module non. Limite assumée, et c'est le prix à payer pour ne pas recourir à des proxies.

### 4.2 Deux familles de rôles

`LAB_ROLE`, `PRACTITIONER_ROLE`, `DISTRIBUTOR_ROLE`, `REGULATOR_ROLE` et `REGISTRAR_ROLE` (l'opérateur d'agrément) sont accordés à des **humains et organisations** (§2). Les trois premiers sont administrés par `REGISTRAR_ROLE`, les autres par la racine. `PASSPORT_MINTER_ROLE`, `PASSPORT_CONTROLLER_ROLE`, `LOT_MINTER_ROLE`, `LOT_BURNER_ROLE`, `CREDIT_SPENDER_ROLE` ne sont accordés qu'à des **contrats**. Cas particulier : `CREDIT_MINTER_ROLE` est accordé à l'**admin** (émission des crédits contre un abonnement hors chaîne — un acte humain tant que le pont fiat→crédit reste manuel).

> **La vraie faiblesse du modèle, à énoncer avant qu'on l'oppose :** accorder un rôle module à une adresse externe court-circuite entièrement la logique métier, et **rien dans le code ne l'empêche**. C'est une erreur de niveau administrateur, à couvrir par le multisig et la checklist de déploiement — pas par le contrat (attaque n°13).

### 4.3 L'architecture remplace l'upgradeabilité

Un contrat non upgradeable ne se corrige pas. Le mécanisme de correction du système, c'est **révoquer le rôle d'un module défaillant et en déployer un autre** — les passeports, les lots et les rôles restent intacts. C'est ce qui rend le refus des proxies (§1.4) tenable plutôt que dogmatique.

---

## 5. Modèle de données on-chain

Le modèle suit la règle de placement du §4.1 : **l'immuable dans le store, le mutable dans le module.**

```solidity
// ---- PassportNFT (store permanent) : figé au mint, aucun setter ----
struct Traits {
    uint64  lotId;             // ┐ 1 slot (13 octets sur 32)
    uint40  mintedAt;          // ┘
    bytes32 conformityHash;    // empreinte du dossier de conformité off-chain
}                              // 2 slots

// ---- MaterialLots (store permanent) ----
struct LotInfo {
    address lab;               // ┐ 1 slot
    uint40  declaredAt;        // ┘
    bytes32 certHash;          // certificat matière (CE / ISO), off-chain
}                              // 2 slots
// la quantité restante n'est PAS un champ : c'est totalSupply(lotId),
// fourni gratuitement par ERC1155Supply (§8.4)

// ---- LifecycleModule (remplaçable) ----
enum Status { Manufactured, Certified, Placed }  // Recalled est dérivé (§6.3)
mapping(uint256 => Status)  _status;
mapping(uint256 => bytes32) _commitment;         // keccak256(sel ‖ identité) (§9.2)

// ---- RecallModule (v1) ----
struct Recall { uint40 declaredAt; bool active; bytes32 evidenceHash; }

// ---- BondModule (v1) ----
struct BondAccount {
    uint128 staked;            // ┐ 1 slot
    uint40  withdrawableAt;    // ┘ 0 = aucun retrait demandé
}
```

**Le *packing* n'est pas cosmétique.** `Traits` tient en 2 slots là où une déclaration naïve en `uint256` en prendrait 3. Sur le mint — l'opération la plus fréquente de l'application — un slot vaut ~20 000 gas.

**Ce que la séparation apporte en plus.** Le statut n'est plus un champ de la struct du passeport mais un mapping du module : le remplacer ne demande pas de toucher au store. En contrepartie, lire l'état complet d'un passeport demande deux appels au lieu d'un — ce que la couche de lecture (§7.3) résout côté front.

---

## 6. Cycle de vie et règles métier

### 6.1 Machine à états

| État | Déclencheur | Acteur | Effet |
|---|---|---|---|
| `Manufactured` | `mintPassport` | Laboratoire | burn des lots consommés + mint du passeport |
| `Certified` | `attestConformity` | Praticien | contrôle validé, horodaté, attribué |
| `Placed` | `markPlaced` | Praticien | verrou du passeport + engagement patient |
| *`Recalled`* | `declareRecall` **au niveau lot** | Ordre / ARS | **statut dérivé**, jamais écrit sur le passeport |

Transitions **à sens unique**, chacune gardée par l'état exact précédent (modifier `onlyStatus`) : aucune étape ne peut être sautée, rejouée ou inversée. C'est ce qui rend la logique finiment testable (§C6).

### 6.2 Le handoff en deux temps

Le passeport est *soulbound* : `_update` est surchargé pour rejeter tout transfert. Deux exceptions, et deux seulement :

1. **Le mint** (`from == address(0)`).
2. **Le handoff validé** : le détenteur appelle `initiateHandoff(tokenId, to)`, puis `to` appelle `acceptHandoff(tokenId)` — qui exécute le transfert **et consomme l'autorisation dans la même transaction**.

> **Piège évité.** Un simple booléen `authorizedHandoff[tokenId]` posé par un tiers, comme esquissé dans le dossier de cadrage, laisse le token transférable **indéfiniment** si personne ne pense à le remettre à zéro : le soulbound se désactive silencieusement. Le schéma en deux temps (inspiré d'`Ownable2Step`) rend l'autorisation **atomique et à usage unique**, et impose que le destinataire soit un acteur agréé, pas une adresse arbitraire.

Après `markPlaced`, un handoff supplémentaire (patient qui change de cabinet) exige en plus l'accord du `REGULATOR_ROLE`.

### 6.3 Le rappel : une écriture, un statut dérivé

C'est le **point d'architecture central** de l'application.

Le `LifecycleModule` expose le statut **brut** ; le `RecallModule` détient le drapeau du lot. Composer les deux est le rôle de la couche de lecture (§7.3) — c'est ce qui garde les deux modules indépendants l'un de l'autre :

```solidity
// CatentaLens (vue pure, sans état, redéployable à volonté)
function statusOf(uint256 tokenId) public view returns (Status) {
    uint64 lotId = PASSPORTS.traitsOf(tokenId).lotId;
    if (RECALLS.isRecalled(lotId)) return Status.Recalled;
    return LIFECYCLE.statusOf(tokenId);
}
```

- `declareRecall(lotId, evidenceHash)` écrit **un seul flag**, sur le lot. Coût constant, que le lot ait produit 3 ou 30 000 passeports.
- Le statut « rappelé » d'un passeport est **calculé à la lecture**. Aucune boucle on-chain n'existe, donc aucun **DoS par gas** n'est possible sur le chemin critique.
- Un unique event `RecallDeclared` est émis ; le fan-out de notification est la responsabilité du front / de l'indexeur, **hors chaîne**.

C'est ce qui rend l'« alerte nationale instantanée » des slides techniquement honnête : la chaîne ne *pousse* rien — elle rend l'information disponible en O(1) et prouve qui l'a lue.

### 6.4 Accusés de réception — la preuve d'exécution

`acknowledgeRecall(lotId)`, ouvert aux `PRACTITIONER_ROLE` et `DISTRIBUTOR_ROLE`, inscrit `(acteur, lotId, timestamp)`. Le régulateur dispose alors d'un tableau de diffusion vérifiable : *qui* a pris connaissance du rappel, et *quand*.

C'est la réponse directe au problème n°1 du terrain (§1.1). Le processus papier n'a jamais pu le produire.

### 6.5 Caution qualité et délai de retrait

| Étape | Fonction | Garde |
|---|---|---|
| Dépôt | `stakeBond(amount)` | `LAB_ROLE`, `safeTransferFrom` |
| Demande de retrait | `requestBondWithdrawal()` | pose `withdrawableAt = now + COOLDOWN` |
| Retrait | `withdrawBond()` | `now >= withdrawableAt`, **checks-effects-interactions** + `nonReentrant` |
| Sanction | `slash(lab, amount, lotId)` | `REGULATOR_ROLE`, plafonnée, preuve requise, journalisée |

> **Le délai de retrait n'est pas décoratif.** Sans lui, un laboratoire qui pressent un rappel retire sa caution avant la déclaration : le mécanisme de sanction devient inopérant. Le *cooldown* (cible : 30 jours) est ce qui donne au régulateur une fenêtre pour agir — et il fournit au passage la dimension temporelle qui justifie les helpers `time.increase` en test (§C6).

---

## 7. Interfaces, par couche

Les signatures marquées ✅ sont **implémentées et testées** ; les autres sont spécifiées.

### 7.1 Stockages permanents

```solidity
// ---- PassportNFT (ERC-721) : n'obéit qu'à un rôle, jamais à une adresse ----
function mint(address to, uint64 lotId, bytes32 conformityHash)          // ✅ PASSPORT_MINTER_ROLE
    external returns (uint256 tokenId);
function armHandoff(uint256 tokenId, address to) external;               // ✅ PASSPORT_CONTROLLER_ROLE
function executeHandoff(uint256 tokenId, address to) external;           // ✅ PASSPORT_CONTROLLER_ROLE
function traitsOf(uint256 tokenId) external view returns (Traits memory);// ✅
function pendingHandoff(uint256 tokenId) external view returns (address);// ✅

// ---- MaterialLots (ERC-1155) ----
function declareLot(address lab, bytes32 certHash, uint256 quantity)     // ✅ LOT_MINTER_ROLE
    external returns (uint64 lotId);
function burnForManufacturing(address from, uint64 lotId, uint256 qty)   // ✅ LOT_BURNER_ROLE
    external;
function lotOf(uint64 lotId) external view returns (LotInfo memory);     // ✅
function totalSupply(uint256 lotId) external view returns (uint256);     // ✅ = quantité restante
```

### 7.2 Modules

```solidity
// ---- LifecycleModule ----
function declareLot(bytes32 certHash, uint256 quantity)                  // ✅ LAB_ROLE
    external returns (uint64 lotId);
function mintPassport(uint64 lotId, uint256 quantity, bytes32 conformityHash) // ✅ LAB_ROLE
    external returns (uint256 tokenId);
function attestConformity(uint256 tokenId) external;                     // ✅ PRACTITIONER_ROLE
function markPlaced(uint256 tokenId, bytes32 patientCommitment) external;// ✅ PRACTITIONER_ROLE
function initiateHandoff(uint256 tokenId, address to) external;          // ✅ détenteur
function acceptHandoff(uint256 tokenId) external;                        // ✅ destinataire armé
function statusOf(uint256 tokenId) external view returns (Status);       // ✅ statut brut
function reportIncident(uint256 tokenId, bytes32 evidenceHash) external;

// ---- RecallModule (v1) ----
function declareRecall(uint64 lotId, bytes32 evidenceHash) external;     // REGULATOR_ROLE
function liftRecall(uint64 lotId, bytes32 evidenceHash) external;        // REGULATOR_ROLE
function acknowledgeRecall(uint64 lotId) external;                       // PRACTITIONER / DISTRIBUTOR
function isRecalled(uint64 lotId) external view returns (bool);
function acknowledgersOf(uint64 lotId) external view returns (address[] memory);

// ---- BondModule (v1) ----
function stakeBond(uint256 amount) external;                             // LAB_ROLE
function requestBondWithdrawal() external;                               // LAB_ROLE
function withdrawBond() external;                                        // LAB_ROLE, après délai
function slash(address lab, uint256 amount, uint64 lotId) external;      // REGULATOR_ROLE
```

### 7.3 La couche de lecture

Composer plusieurs modules est le travail d'un contrat de **vue pure, sans état** (`CatentaLens`, v1) : les modules restent ainsi indépendants les uns des autres, et cette couche est redéployable à volonté puisqu'elle ne détient rien.

```solidity
function statusOf(uint256 tokenId) external view returns (Status);       // compose Lifecycle + Recall
function passportView(uint256 tokenId) external view returns (PassportView memory);
```

C'est aussi ce qui règle le coût de la séparation immuable/mutable (§5) : le front fait **un appel**, la composition se fait on-chain en lecture, donc gratuitement.

### 7.4 Événements

Placement selon la règle de [CONVENTIONS §1.8](CONVENTIONS.md) : *le store émet ce qui touche à son état, le module le seul fait métier qu'il possède en propre, et on ne duplique jamais un événement OpenZeppelin.*

```solidity
// ---- PassportNFT ----                                    (+ Transfer d'ERC-721)
event PassportIssued(                                                    // ✅
    uint256 indexed tokenId, address indexed lab,
    uint64 indexed lotId, bytes32 conformityHash);
event HandoffArmed(                                                      // ✅
    uint256 indexed tokenId, address indexed from, address indexed to);

// ---- MaterialLots ----                                    (+ TransferSingle d'ERC-1155)
event LotDeclared(                                                       // ✅
    uint64 indexed lotId, address indexed lab, bytes32 certHash, uint256 quantity);

// ---- LifecycleModule ----
event MaterialConsumed(uint256 indexed tokenId, uint64 indexed lotId, uint256 quantity); // ✅
event ConformityAttested(uint256 indexed tokenId, address indexed practitioner);         // ✅
event PlacedInMouth(                                                                     // ✅
    uint256 indexed tokenId, address indexed practitioner, bytes32 patientCommitment);
event IncidentReported(uint256 indexed tokenId, address indexed practitioner, bytes32 evidenceHash);

// ---- RecallModule (v1) ----
event RecallDeclared(uint64 indexed lotId, bytes32 evidenceHash);
event RecallLifted(uint64 indexed lotId, bytes32 evidenceHash);
event RecallAcknowledged(uint64 indexed lotId, address indexed actor);

// ---- BondModule (v1) ----                                 (+ Transfer d'ERC-20)
event BondStaked(address indexed lab, uint256 amount);
event BondWithdrawalRequested(address indexed lab, uint40 withdrawableAt);
event BondSlashed(address indexed lab, uint256 amount, uint64 indexed lotId);
```

**Ce qui a été retiré, et pourquoi.** `PassportMinted` (renommé `MaterialConsumed` : le store annonce l'émission, le module la matière consommée), `HandoffInitiated` (doublon de `HandoffArmed`, émis par le store qui est permanent), `HandoffAccepted` et `BondWithdrawn` (doublons du `Transfer` d'OpenZeppelin). Un indexeur qui suit les stores continue de fonctionner **après un remplacement de module** — c'est ce qui décide du placement.

---

## 8. Jetons et librairies OpenZeppelin (C3)

> **Principe.** Tout ce qu'OpenZeppelin fournit est pris chez OpenZeppelin. Le code écrit à la main se limite à la **logique métier dentaire** — le reste (standards de jetons, contrôle d'accès, réentrance, pause, signatures, ensembles, preuves de Merkle) provient de contrats audités, testés par l'écosystème entier et attendus par le référentiel.
>
> Corollaire, et il compte autant : **aucun module n'est importé pour faire nombre.** Chaque ligne de l'inventaire §8.4 dit ce que le module remplace concrètement. Les modules écartés (§8.7) sont documentés avec leur raison — c'est cette liste-là qu'un jury utilise pour vérifier qu'on a choisi plutôt que copié.

### 8.1 ERC-721 *soulbound* — le passeport

Un token = un dispositif. Le transfert libre n'a aucun sens métier : un dispositif médical est lié à un patient, pas échangeable. Le verrou passe par la surcharge de `_update` (OpenZeppelin v5), pas par la désactivation de `transferFrom` — ce qui fermerait la porte principale en laissant `safeTransferFrom` et les chemins internes ouverts.

```solidity
function _update(address to, uint256 tokenId, address auth)
    internal override returns (address)
{
    address from = _ownerOf(tokenId);
    if (from != address(0) && _pendingHandoff[tokenId] != to) revert Soulbound(tokenId);
    delete _pendingHandoff[tokenId];   // usage unique, dans la même transaction
    return super._update(to, tokenId, auth);
}
```

### 8.2 ERC-1155 — les lots de matériaux

Un lot est une **quantité semi-fongible** : *X grammes de zircone du lot N*. Un `id` par lot, un `amount` consommable — l'ERC-1155 modélise cela exactement, là où l'ERC-721 imposerait un token par gramme et l'ERC-20 un contrat par lot. La quantité utilisée est **brûlée au mint du passeport** : le lien matière → prothèse est établi dans la transaction même qui crée le passeport, et la quantité restante d'un lot est vérifiable.

### 8.3 ERC-20 — la caution qualité

Le laboratoire immobilise une valeur, *slashable* sur preuve.

> **Arbitrage à assumer, et à défendre.** Une caution libellée dans un jeton que le projet **émet lui-même** ne vaut rien économiquement : le laboratoire pourrait s'en émettre autant qu'il veut, ou le régulateur en imprimer pour le sanctionner. Le registre est donc conçu pour accepter **n'importe quel `IERC20`**, fixé à la construction. Sur Sepolia, on déploie un `MockEUR` (stablecoin factice, mint ouvert) ; en production, l'adresse pointerait vers un stablecoin réel ou un jeton de consortium adossé.
>
> C'est plus honnête que de présenter un jeton maison comme une garantie financière, et cela ne coûte rien en implémentation : `SafeERC20` et une adresse en `immutable`.
>
> **Démonstration empirique** : le projet français Galeon paie des rendements de staking de +60 % sur 5 ans en émettant ses propres jetons depuis une allocation dédiée de 920 millions — sur un actif à −87,6 % de son plus haut, dont le volume quotidien est de 3 036 $. Une valeur qu'on émet soi-même n'est pas une garantie, c'est une écriture. Voir [ETUDE_GALEON.md §4.2 et §7](ETUDE_GALEON.md).

**Aucun jeton décoratif.** Chacun des quatre standards rend effective une fonctionnalité métier qui ne pourrait pas exister sans lui — y compris le crédit d'usage ci-dessous, qui porte le **modèle économique** du projet.

### 8.3bis Le crédit d'usage `$CATENTA` (ERC-20) — le modèle économique

> **Statut : implémenté (v0).** C'est le quatrième jeton, et le seul lié à la façon dont le projet gagne sa vie. Il n'est **ni vendu, ni coté, ni transférable** : ce n'est pas un actif financier, c'est un compteur d'usage prépayé.

#### Le principe

L'accès au registre se paie par un **abonnement hors chaîne** (euros, facturation classique). À la réception du paiement, l'admin **émet** des crédits `$CATENTA` sur le compte de l'acteur. **Chaque action utile en consomme (brûle) un.** Quand le solde tombe à zéro, l'acteur renouvelle son abonnement. C'est un **forfait prépayé, comme des timbres.**

```
  abonnement (€, hors chaîne)
          │
          ▼  mintCredits(acteur, X)          ← admin, CREDIT_MINTER_ROLE
   [ solde de crédits ]
          │  costsCredit  → CREDIT.spend(acteur, 1) → _burn   ← le module, à chaque action
          ▼
     action exécutée (déclarer un lot, émettre un passeport, …)
```

#### Les cinq choix de conception, et leur raison

| Choix | Décision | Pourquoi |
|---|---|---|
| **Consommation** | **burn** (détruit), jamais recyclé vers un pot | l'argent a déjà changé de main hors chaîne à l'émission ; recycler ferait du crédit une **monnaie qui circule** → mini-économie interne, gouvernance à définir, et surtout un risque réglementaire que ce design évite (§9). Décision **D8** |
| **Transférable ?** | **non** — `_update` n'autorise que mint (`from==0`) et burn (`to==0`) | pas de transfert entre acteurs ⇒ **pas de carnet d'ordres, pas de cours, pas de marché**. Le jeton ne *peut pas* être coté, par construction. C'est ce qui le tient hors du champ d'un actif spéculatif |
| **Supply** | **pas de plafond, entièrement contrôlé** | les crédits se brûlent en continu et doivent être ré-émis à chaque renouvellement ; un `ERC20Capped` finirait par geler le système. Le supply en circulation = **crédits prépayés non encore utilisés** |
| **Décimales** | **0** | un crédit est une unité entière : les soldes se lisent « 100 », « 99 »…, et « 1 crédit » vaut littéralement 1. Pas de `formatUnits` côté front |
| **Récompenses** | **plus tard, par mint bonus** (jamais par recyclage) | récompenser = émettre des crédits offerts (`RewardGranted`, une remise sur l'usage futur) — sain ; faire circuler de la valeur entre porteurs serait le piège de dilution de Galeon (§7 ETUDE_GALEON) |

#### Émission et facturation

| Fonction | Qui | Effet |
|---|---|---|
| `grantInitialCredits(addr)` | admin | attribue **100 crédits** une seule fois par adresse (garde anti-rejeu) — la dotation d'accueil |
| `mintCredits(addr, x)` | admin | recharge libre contre paiement (manuel pour l'instant ; automatisable via un module d'onboarding) |
| `spend(addr, x)` | `CREDIT_SPENDER_ROLE` (le module) | brûle `x` crédits de `addr` dans la transaction de l'action ; erreur claire `InsufficientCredits` si le solde manque |

Le module facture via un modifier `costsCredit`, placé **après** les gardes de rôle et de statut : un crédit n'est jamais brûlé pour une action qui échouerait, et l'atomicité de la transaction garantit qu'un revert du corps annule le brûlage. Fonctions facturées : `declareLot`, `mintPassport`, `attestConformity`, `markPlaced`, `initiateHandoff`. **`acceptHandoff` est gratuit** — on ne paie pas pour *recevoir* un dispositif. Le coût (`actionCost`, défaut 1) est réglable par l'admin ; **0 désactive la facturation** (phase pilote gratuite).

#### Pourquoi c'est prudent côté RGPD *et* réglementation financière

- **Financier** : non transférable + jamais vendu + émis par l'admin ⇒ ce n'est pas un instrument négociable. Aucune offre au public, aucune cotation → hors du régime d'offre de MiCA. C'est l'inverse exact de la trajectoire Galeon (jeton vendu → financement → cours effondré, [ETUDE_GALEON](ETUDE_GALEON.md)).
- **Frugalité** : le crédit ne stocke **aucune donnée métier** — juste des soldes. Il est un stockage permanent (comme les jetons), mais orthogonal au cycle de vie : le remplacer ou changer la politique de prix ne touche ni les passeports ni les lots.

### 8.4 Inventaire OpenZeppelin — module par module

Version : **`@openzeppelin/contracts` v5.x**, branche non-upgradeable (§8.7). Les modules cochés *v0* sont dans le socle certifiable ; les autres arrivent avec le jalon indiqué.

#### Jetons

| Module | Où | Ce qu'il apporte concrètement | Jalon |
|---|---|---|---|
| `ERC721` | `PassportNFT` | le passeport ; `_update` surchargé pour le soulbound (§8.1) | v0 ✅ |
| `ERC721Enumerable` | `PassportNFT` | `tokenOfOwnerByIndex` — le front liste les passeports d'un cabinet **sans indexeur** ni scan de logs | v0 |
| `ERC1155` | `MaterialLots` | un `id` par lot, une quantité par lot (§8.2) | v1 |
| `ERC1155Supply` | `MaterialLots` | `totalSupply(lotId)` = **quantité de matière restante**, gratuitement — sinon c'est un compteur à maintenir à la main | v1 |
| `ERC1155Burnable` | `MaterialLots` | le burn de la quantité consommée au mint du passeport, avec les contrôles d'autorisation déjà écrits | v1 |
| `ERC20` | `MockEUR` | le jeton de caution de démonstration (§8.3) | v1 |
| `ERC20Permit` (EIP-2612) | `MockEUR` | `stakeBondWithPermit()` : le labo dépose sa caution **en une transaction** au lieu de `approve` puis `stake` | v1 |
| `IERC20` + `SafeERC20` | `BondModule` | la caution accepte n'importe quel ERC-20 ; `safeTransferFrom` gère les jetons non conformes (retour vide) | v1 |
| `ERC1155Holder` | `LifecycleModule` | rend le module capable de recevoir des lots si un flux le nécessite — sans lui, un `safeTransferFrom` vers le module revert | v1 |

**`ERC721Enumerable` : un arbitrage à assumer.** L'extension coûte de l'ordre de **+50 000 gas au mint** (trois écritures d'index). C'est en apparence contradictoire avec le *packing* de `Passport` qui en économise 40 000 (§11). Le raisonnement : sans elle, lister les passeports d'un cabinet exige un indexeur d'events — qui n'existe qu'en v2. Payer 50 k gas au mint pour supprimer une dépendance d'infrastructure entière est le bon échange **tant que l'indexeur n'existe pas**. Le rapport de gas mesurera le surcoût réel, et la décision sera réexaminée en v2. Ce genre d'arbitrage chiffré vaut mieux qu'un choix par défaut dans les deux sens.

#### Contrôle d'accès et gouvernance

| Module | Où | Ce qu'il apporte concrètement | Jalon |
|---|---|---|---|
| `AccessControl` | `CatentaRoles` | les 5 rôles du §2, `onlyRole` sur chaque écriture | v0 |
| `AccessControlEnumerable` | `CatentaRoles` | `getRoleMember` — la vue `/admin` affiche **la liste des labos et praticiens agréés** sans indexer | v0 |
| `AccessControlDefaultAdminRules` | `CatentaRoles` | transfert d'admin **en deux étapes avec délai imposé**, renoncement volontairement pénible | v1 |
| `TimelockController` | admin | délai obligatoire sur toute attribution de rôle sensible | v2 |
| `ERC2771Context` | modules | meta-transactions : les cabinets n'ont pas d'ETH (décision D4) | v2 |

**`AccessControlDefaultAdminRules` ferme l'attaque n°13 avec du code audité.** L'attaque « centralisation admin » se traitait jusqu'ici par une promesse (« mettre un multisig »). Cette extension impose par le code un transfert d'admin en deux temps avec délai, et rend le renoncement explicitement dangereux — la protection devient structurelle, pas procédurale.

> **Point d'intégration à ne pas découvrir en cours de route.** `AccessControlEnumerable` et `AccessControlDefaultAdminRules` surchargent toutes deux `_grantRole` / `_revokeRole` / `supportsInterface`. Les combiner demande des `override(A, B)` explicites. C'est faisable et c'est du Solidity standard, mais ce n'est **pas gratuit** : compter une demi-journée, et le couvrir par un test qui vérifie que les deux comportements coexistent réellement.

#### Sécurité

| Module | Où | Ce qu'il apporte concrètement | Jalon |
|---|---|---|---|
| `ReentrancyGuardTransient` | `BondModule` | protection de réentrance en **stockage transitoire** (EIP-1153) : même garantie que `ReentrancyGuard`, ~2 000 gas au lieu de ~20 000 par appel gardé | v1 |
| `Pausable` | `LifecycleModule` · `RecallModule` | frein d'urgence, **limité au mint et au rappel** — jamais sur les lectures ni sur `acknowledgeRecall` (attaque n°15) | v1 |
| `EIP712` + `ECDSA` + `SignatureChecker` + `Nonces` | `LifecycleModule` | la co-signature labo + praticien au handoff — la parade au problème de l'oracle (attaque n°9) ; `SignatureChecker` accepte aussi les **signatures ERC-1271**, donc les wallets-contrats des laboratoires | v2 |

`ReentrancyGuardTransient` est disponible parce que le pragma est en `0.8.34` : le stockage transitoire (EIP-1153) exige `>= 0.8.24`. C'est un cas où le choix de version du compilateur se traduit directement en gas économisé.

#### Utilitaires

| Module | Où | Ce qu'il apporte concrètement | Jalon |
|---|---|---|---|
| `EnumerableSet.AddressSet` | `RecallModule` | les accusés de réception par lot : appartenance en O(1) **et** énumération — le tableau « X/Y acteurs ont accusé réception » (§6.4) sans indexeur | v1 |
| `MerkleProof` | `CatentaRoles` | `claimRole(proof)` : le régulateur publie **une racine** de l'annuaire des agréés, chaque acteur réclame son rôle lui-même | v1 |
| `Multicall` | `LifecycleModule` | un laboratoire déclare 10 lots ou atteste 10 conformités en **une transaction** | v1 |
| `Strings` | `PassportNFT` | construction du `tokenURI` | v1 |
| `Math` | `BondModule` | plafonnement du montant de *slashing* (`Math.min`) | v1 |

**`MerkleProof` n'est pas un exercice de style ici.** La France compte de l'ordre de 44 000 chirurgiens-dentistes. Attribuer les rôles par `grantRole` un par un est irréaliste : c'est 44 000 transactions payées par le régulateur. Publier la racine de l'annuaire de l'Ordre en une écriture, et laisser chaque praticien prouver son inscription et payer sa propre transaction, est **la** manière de passer à l'échelle. La racine est révocable et remplaçable à chaque mise à jour de l'annuaire. Ce mécanisme porte aussi la **doctrine RGPD appliquée aux acteurs** (aucun nom ni RPPS en clair on-chain) — détaillé en §9.4, où il est retenu comme la façon d'identifier un praticien.

### 8.5 Ce que cela laisse à écrire à la main

Une fois l'inventaire posé, le code spécifique au projet se réduit à :

- la machine à états du passeport et ses gardes (§6.1) ;
- le handoff en deux temps et la surcharge de `_update` (§6.2) ;
- le rappel au niveau lot et le statut dérivé `statusOf` (§6.3) ;
- la comptabilité de la caution et son délai de retrait (§6.5) ;
- l'orchestration entre les modules et les stockages permanents ;
- la couche d'autorité (`CatentaRoles`, `RoleAware`) — une trentaine de lignes.

C'est exactement ce qu'on veut : **la surface de code non auditée est réduite à ce qui est propre au métier**, et c'est aussi sur cette surface que se concentre l'effort de test.

### 8.6 Conséquence sur les tests

Ce qui vient d'OpenZeppelin est déjà testé par OpenZeppelin. Les tests du projet **ne rejouent pas** la suite de tests d'`ERC721` — ils vérifient les **points de couture** :

- les surcharges (`_update` soulbound, `supportsInterface` sur l'accès multiple) ;
- les invariants qui traversent le module et les stores (quantité brûlée = quantité déclarée − restante) ;
- les gardes propres au projet (rôles, états, cooldown).

Confondre les deux gonfle la couverture sans rien démontrer, et se voit immédiatement en revue.

### 8.7 Modules étudiés et écartés

| Module | Pourquoi non |
|---|---|
| **Variantes `*Upgradeable` + proxies** | un registre de preuve dont le code peut changer perd sa valeur probante. Refus structurant, pas un oubli (§1.4) |
| `AccessManager` | gouvernance centralisée élégante pour 4 contrats, mais l'indirection (rôles numériques, adaptateurs, délais) coûte plus en lisibilité qu'elle ne rapporte ici — et `AccessControl` est ce qu'un jury attend de voir |
| `ERC721URIStorage` | stocke une chaîne par token : cher, pour un dispositif médical qui n'a **aucun marché secondaire** à servir. Le lien documentaire fait autorité via `conformityHash` (`bytes32`), et `_baseURI` + `tokenId` suffit à la conformité du standard |
| `ERC721Burnable` | un passeport ne se détruit pas : un dispositif retiré reste un fait historique. Le brûler effacerait précisément la preuve que le registre existe pour conserver |
| `Ownable` / `Ownable2Step` | quatre acteurs distincts avec des droits différents — un propriétaire unique ne modélise pas le problème. `AccessControl` dès le premier jour |
| `Governor` + `Votes` | l'Ordre et l'ARS sont des autorités **désignées par la loi**, pas élues par des porteurs de jetons. Une DAO serait un contresens réglementaire |
| `ERC20Capped` / `ERC20Votes` | sans objet sur un jeton de caution de démonstration |
| `Clones` / `Create2` | aucun besoin de déployer N instances : il y a **un** registre national |
| `BitMaps` | gain de gas réel mais marginal ici, contre une perte de lisibilité sur le code le plus critique |

### 8.8 Outillage OpenZeppelin

- **Contracts Wizard** (`wizard.openzeppelin.com`) pour amorcer les squelettes de jetons — le point de départ, jamais le point d'arrivée.
- **`@openzeppelin/contracts` épinglé** à une version exacte dans `package.json` (pas de `^`) : la version de la librairie fait partie de l'artefact au même titre que celle du compilateur (CONVENTIONS §1.1).
- **OpenZeppelin Defender** — surveillance des events `RecallDeclared` / `BondSlashed` et relayeur pour les meta-transactions : envisagé en v2, hors périmètre certification.

---

## 9. Stockage off-chain et RGPD

### 9.1 Ce qui est on-chain, ce qui ne l'est pas

| Donnée | Emplacement |
|---|---|
| Identifiants techniques (tokenId, lotId), statuts, rôles, horodatages | **on-chain** |
| Certificats matière, scans 3D, fiches techniques | IPFS — seul le **CID** est on-chain |
| Identité du patient, données de santé | **jamais on-chain**, stockage classique effaçable |
| Identité des acteurs (nom, RPPS, SIRET) | **jamais en clair on-chain** — voir §9.4 |

### 9.2 L'engagement patient doit être salé

Un `keccak256` d'un état civil (nom, prénom, date de naissance) est **brute-forçable** : l'espace des identités est trop petit. Publier un tel hash on-chain reviendrait à publier une donnée personnelle pseudonymisée — donc toujours une donnée personnelle au sens du RGPD.

L'engagement est donc **salé** : `patientCommitment = keccak256(sel ‖ identité)`, avec un sel aléatoire de 32 octets stocké uniquement off-chain, avec la donnée. Effacer la donnée off-chain **détruit le sel** et rend l'engagement on-chain définitivement inexploitable — c'est ce qui rend le droit à l'effacement compatible avec l'immuabilité.

> C'est le point RGPD à tenir à l'oral. Le dossier de cadrage parlait de « hash » sans préciser : la précision du sel fait la différence entre une doctrine défendable et une faille.

### 9.3 Pas de confidentialité par l'obscurité

Sur une chaîne publique, `private` ne cache rien : tout le stockage est lisible par n'importe qui. Le modèle ne repose donc **jamais** sur la dissimulation on-chain — seulement sur le fait que la donnée sensible n'y est pas.

### 9.4 L'identité des acteurs — la même doctrine que le patient

La question se pose naturellement : une adresse `0x3Ee3…` toute nue est illisible pour un régulateur ; ne faut-il pas stocker, a minima, le **nom** et l'**identifiant professionnel** de chaque acteur ? Réponse : les identifiants existent, mais **les graver en clair on-chain rouvrirait exactement le problème RGPD résolu pour le patient**. La doctrine ne vaut que si elle vaut pour tout le monde.

#### 9.4.1 Les identifiants réels

| Acteur | Identifiant officiel | Nature juridique |
|---|---|---|
| Praticien (chirurgien-dentiste) | **RPPS** (11 chiffres, ex-ADELI) | **donnée personnelle** — identifie une personne physique |
| Laboratoire de prothèse | **SIRET / SIREN** | entité légale — *pas* une donnée personnelle |
| Établissement de santé | **FINESS** | structure |
| Fabricant de DM sur mesure | **déclaration ANSM** | l'obligation réglementaire réelle du sur-mesure |

**L'asymétrie est le point clé.** Le SIRET d'un labo peut techniquement être inscrit on-chain sans risque RGPD. Le **RPPS d'un praticien est une donnée personnelle** : immuable sur une chaîne publique, il ne pourrait être ni effacé (praticien radié) ni corrigé (erreur de saisie). Le stocker en clair contredirait §9.2.

#### 9.4.2 L'identité est vérifiée à l'agrément, pas stockée

Le lien de responsabilité existe déjà **sans** stocker le nom : l'admin n'accorde `LAB_ROLE` / `PRACTITIONER_ROLE` à une adresse qu'**après** avoir contrôlé, hors chaîne, le RPPS, le SIRET, la déclaration ANSM.

> L'appartenance au rôle **est** le lien de responsabilité : *« cette adresse porte le rôle, accordé par l'admin qui a vérifié les papiers »*. Le registre n'a pas besoin de re-stocker l'identité.

#### 9.4.3 Trois niveaux, du plus léger au plus fort

**Niveau 1 — annuaire off-chain (affichage).** Une table `adresse → {nom, RPPS, SIRET}` maintenue par le consortium, symétrique de la fiche patient : effaçable, corrigeable, gratuite en gas. Le front l'interroge pour **afficher un nom au lieu d'une adresse**. Aucun changement de contrat — le front résout un JSON d'annuaire, exactement là où il affiche aujourd'hui `shortAddress`.

**Niveau 2 — ancrage cryptographique par racine de Merkle (le mécanisme retenu).** Pour prouver on-chain *« cette adresse = un professionnel réellement inscrit »* **sans** annuaire de confiance :

- le régulateur (`REGULATOR_ROLE`) publie **une seule racine de Merkle** de l'annuaire officiel de l'Ordre / RPPS — une écriture, quel que soit le nombre de praticiens ;
- chaque praticien **réclame son rôle lui-même** en prouvant son inscription : `claimRole(bytes32[] proof)` vérifie l'appartenance de `keccak256(msg.sender ‖ rppsCommitment)` à l'arbre, et attribue `PRACTITIONER_ROLE` à `msg.sender` ;
- **rien de l'annuaire n'est stocké on-chain** — ni les 44 000 noms, ni les RPPS : seule la racine (32 octets) l'est, et une racine ne se renverse pas.

```solidity
// CatentaRoles — v1
bytes32 public practitionerRoot;   // racine de l'annuaire, posée par le régulateur
mapping(address => bool) private _claimed;

/// @notice Publie/renouvelle la racine de l'annuaire des praticiens agréés.
/// @dev Une écriture pour tout l'annuaire. Remplaçable à chaque mise à jour
///      de l'Ordre ; révocable en la remettant à zéro.
function setPractitionerRoot(bytes32 _root) external onlyRole(REGULATOR_ROLE) {
    practitionerRoot = _root;
    emit PractitionerRootUpdated(_root);
}

/// @notice L'appelant réclame PRACTITIONER_ROLE en prouvant son inscription.
/// @dev La feuille lie l'ADRESSE au professionnel : une preuve ne vaut que
///      pour l'adresse qui l'appelle, on ne peut pas réclamer pour autrui.
///      `_rppsCommitment` est une empreinte SALÉE (keccak256(sel ‖ RPPS)),
///      jamais le RPPS en clair — la doctrine §9.2 s'applique à la feuille.
function claimPractitioner(bytes32 _rppsCommitment, bytes32[] calldata _proof) external {
    require(!_claimed[msg.sender], AlreadyClaimed(msg.sender));
    bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, _rppsCommitment))));
    require(MerkleProof.verifyCalldata(_proof, practitionerRoot, leaf), BadProof());
    _claimed[msg.sender] = true;
    _grantRole(PRACTITIONER_ROLE, msg.sender);
    emit PractitionerClaimed(msg.sender);
}
```

Ce niveau règle **trois problèmes d'un coup** : le passage à l'échelle (une écriture au lieu de 44 000 `grantRole`), la neutralité (le régulateur atteste l'annuaire, il n'adoube pas les acteurs un par un), et le RGPD (aucun nom, aucun RPPS en clair — la feuille est une empreinte salée, l'arbre reste off-chain). C'est aussi l'attaque **n°16** du tableau §10 et le module `MerkleProof` de l'inventaire §8.4.

**Niveau 3 — empreinte des credentials au grant (trace d'audit).** À l'agrément, émettre un event portant `keccak256(sel ‖ credentials)` : trace immuable de *« à cette date, ces pièces ont été vérifiées »*, sans les pièces en clair. Complémentaire des niveaux 1-2, utile si un audit doit prouver *a posteriori* la diligence de l'agrément.

#### 9.4.4 Recommandation

- **Laboratoire** : SIRET stockable on-chain sans risque RGPD si une lecture sans annuaire est souhaitée ; sinon niveau 1.
- **Praticien** : **jamais** le RPPS en clair. **Niveau 2 (Merkle) retenu** pour la preuve à l'échelle, niveau 1 pour l'affichage confortable, niveau 3 pour la trace d'audit.

> Le raccourci d'oral : *« on identifie les acteurs à l'agrément, hors chaîne ; la chaîne n'en garde que le rôle et une racine de Merkle — jamais le nom ni le RPPS d'un praticien, pour la même raison qu'on ne met pas le patient. La cohérence de la doctrine RGPD, c'est qu'elle vaut pour tout le monde. »*

---

## 10. Tableau des attaques connues (livrable C4)

| # | Attaque | Vecteur dans l'application | Parade | Test associé |
|---|---|---|---|---|
| 1 | **Reentrancy** | `withdrawBond`, `slash` — appel externe ERC-20 | Checks-Effects-Interactions + OZ `ReentrancyGuardTransient` + `SafeERC20` | contrat attaquant réentrant en TS |
| 2 | **Contrôle d'accès cassé** | mint, rappel, slashing sans rôle | OZ `AccessControl`, `onlyRole` sur chaque écriture, tests négatifs systématiques | 1 test négatif / fonction |
| 3 | **Faux passeport** | mint par un acteur non agréé | `LAB_ROLE` sur allowlist, octroi par admin multisig | revert `AccessControlUnauthorizedAccount` |
| 4 | **Contournement du soulbound** | transfert direct du passeport | surcharge de `_update` (pas de `transferFrom`), handoff atomique à usage unique | fuzz : tout transfert non autorisé revert |
| 5 | **Handoff rejouable** | autorisation qui reste ouverte après usage | `delete _pendingHandoff` **dans** `_update` | test : 2ᵉ transfert → `Soulbound` |
| 6 | **Retrait de caution avant rappel** | le labo se désengage en pressentant la sanction | *cooldown* de retrait + blocage si rappel actif | `time.increase` autour du délai |
| 7 | **Slashing abusif / griefing** | rappel malveillant pour nuire à un concurrent | `REGULATOR_ROLE` seul, `evidenceHash` obligatoire, montant plafonné, journalisé | bornes + rôle |
| 8 | **DoS par gas (boucle)** | rappel « notifiant » N passeports | flag au niveau **lot**, statut **dérivé** — aucune boucle on-chain | invariant : coût de `declareRecall` constant |
| 9 | **Oracle physique ↔ numérique** | donnée fausse à la source (*garbage in*) | attestation **co-signée** labo + praticien au handoff ; caution comme incitation économique | scénario multi-signataires |
| 10 | **Over / underflow** | quantités de lots, montants de caution | Solidity ≥ 0.8 (checked), `uint128` sur les montants → tests de bornes | fuzz sur les bornes |
| 11 | **Fuite PII / RGPD** | identité patient inscrite on-chain | jamais de PII ; engagement **salé** (§9.2) | revue de code, pas de test automatisable |
| 12 | **Rejeu de signature** (v2, EIP-712) | co-signature réutilisée sur un autre token | OZ `EIP712` + `Nonces` + `SignatureChecker` — `nonce`, `chainId` et `deadline` dans le domaine | test de rejeu |
| 13 | **Centralisation admin** | admin tout-puissant sur les rôles | **séparation gouverner/opérer** : `REGISTRAR_ROLE` agrée les acteurs sans être la racine (déjà en place) ; racine sous multisig, OZ `AccessControlDefaultAdminRules` + `TimelockController` en v2 ; **pas de proxy upgradeable** | tests : registrar agrée sans admin ; rôles sensibles hors de sa portée |
| 14 | **Front-running** | pas de mint public compétitif | surface quasi nulle — documenté, mint réservé aux rôles | — |
| 15 | **Pause comme censure** | `Pausable` gèle le registre | pause limitée au **mint** et au **rappel** ; jamais sur les lectures ni sur `acknowledgeRecall` | test : lecture OK en pause |
| 16 | **Racine de Merkle empoisonnée** | une racine d'annuaire erronée accorde des rôles à tort | publication `REGULATOR_ROLE` uniquement, racine remplaçable et journalisée, rôle révocable individuellement | test : preuve invalide → revert |
| 17 | **Sur-émission de crédits** | admin compromis qui s'émet des crédits, ou en émet à une adresse externe | `CREDIT_MINTER_ROLE` sous multisig, crédit **non transférable** (pas de revente), émission journalisée (`CreditsMinted`) ; impact borné à de l'usage gratuit, pas à une fuite de valeur | test : mint hors rôle → revert |

L'**analyse critique des interactions utilisateur** exigée par C4 se conduit à partir de ce tableau : chaque parcours (déclaration de lot, mint, conformité, pose, handoff, rappel, accusé, caution) est confronté aux 17 vecteurs ci-dessus.

**Dix de ces dix-sept parades sont fournies par OpenZeppelin** (n° 1, 2, 3, 4, 7, 12, 13, 15, 16). C'est l'argument central de C3 : la sécurité ne repose pas sur du code écrit pour l'occasion, mais sur des contrats audités et éprouvés en production. Les sept parades restantes sont propres au métier (statut dérivé, handoff à usage unique, cooldown, engagement salé) — et ce sont précisément celles qui concentrent l'effort de test.

---

## 11. Optimisations gas (C4)

| Levier | Application | Gain estimé |
|---|---|---|
| Aucune boucle non bornée | rappel dérivé au niveau lot (§6.3) — le cœur de l'optimisation | O(N) → **O(1)** |
| *Packing* des structs | `Passport` : 5 slots → 3 (§5) | ~40 000 gas / mint |
| OZ `ReentrancyGuardTransient` | stockage transitoire (EIP-1153) au lieu du storage | ~18 000 gas / appel gardé |
| OZ `Multicall` | 10 déclarations de lot en 1 transaction | ~9 × 21 000 gas de base |
| Erreurs personnalisées | `revert Soulbound(tokenId)` au lieu de chaînes `require` | déploiement + revert |
| `immutable` / `constant` | adresses des trois contrats de jetons, `WITHDRAWAL_COOLDOWN`, rôles | lecture sans SLOAD |
| Événements indexés | agrégation et recherche déportées hors chaîne | — |
| Cache des lectures storage | champs relus dans une même fonction | SLOAD → MLOAD |
| `calldata` sur les paramètres externes | pas de copie mémoire inutile | — |
| *(à contre-courant)* OZ `ERC721Enumerable` | **coût** assumé pour supprimer la dépendance à un indexeur (§8.4) | **−50 000 gas / mint** |

La dernière ligne est volontairement dans le tableau : une section « optimisation » qui ne montrerait que des gains serait une plaidoirie, pas une analyse. Le solde net reste largement positif, et le rapport de gas le chiffrera.

Un **rapport de gas** (`hardhat-gas-reporter`) est produit et commenté : l'optimisation se démontre par des chiffres avant/après, pas par une liste de bonnes intentions.

---

## 12. Tests — stratégie (C6, > 80 %)

Détail des conventions dans [CONVENTIONS.md §3](CONVENTIONS.md). En résumé :

- **Double runner Hardhat 3.** Tests de **propriétés** en Solidity (`forge-std`, *fuzzing*, 256 exécutions/test) pour la logique pure — invariants de quantité, verrou soulbound, comptabilité de la caution. Tests par **scénarios** en TypeScript (mocha + ethers v6) dès qu'il faut plusieurs signataires, décoder des events/erreurs, ou orchestrer plusieurs contrats.
- **Fixtures `loadFixture`** par état du cycle de vie (`lotDeclared`, `passportMinted`, `conformityAttested`, `placed`, `recalled`).
- **Helpers temps** (`time.increase`) sur le *cooldown* de retrait de caution.
- **Trois axes par fonction publique** : chemin nominal (effets + event), contrôle d'accès (rôle manquant), garde d'état (statut incorrect).
- Cible réaliste : **> 90 %** de lignes. La logique est déterministe et à branches finies ; l'essentiel de l'effort porte sur les **branches de revert**.

---

## 13. Écarts assumés avec le dossier de cadrage

| Point | Dossier technique | Ici | Raison |
|---|---|---|---|
| **Architecture** | **hub orchestrateur unique** (`DentalRegistry`), tokens en `onlyRegistry` | **trois couches** : autorité · stores permanents · modules | une adresse figée dans un store permanent imposait de redéployer les jetons — et de perdre les passeports — pour changer une règle (§4) |
| Statuts | enum en français | **enum en anglais** (`Manufactured`/`Certified`/`Placed`) | le code et le NatSpec sont en anglais (CONVENTIONS) |
| Client Ethereum | viem | **ethers v6** | stack déjà maîtrisée et outillée (projet précédent) ; aucun gain à changer |
| Fuzzing | Echidna | **runner Solidity natif** (forge-std) ; Echidna en v2 | zéro installation, intégré à `hardhat test`, suffisant pour les invariants visés |
| Statut « rappelé » | membre de l'enum stocké | **dérivé**, hors enum stocké | un statut stocké *et* dérivé aurait deux sources de vérité désynchronisables |
| Handoff | booléen `_authorizedHandoff` | **deux temps, à usage unique** | le booléen ne se réarme pas : soulbound désactivé silencieusement (§6.2) |
| Caution | ERC-20 maison | **`IERC20` injecté** + mock sur testnet | une caution en jeton auto-émis n'a aucune valeur (§8.3) |
| Engagement patient | « hash » | **hash salé** | un hash d'état civil est brute-forçable (§9.2) |
| Distributeur | rôle narratif | `acknowledgeRecall` | un rôle sans fonction on-chain est décoratif (§2) |
| Retrait de caution | immédiat | **délai de 30 j** | sinon le slashing est contournable (§6.5) |
| OpenZeppelin | 6 modules cités | **~25 modules inventoriés** (§8.4) | C3 note explicitement la justification du recours aux librairies |
| Modèle économique | absent du cadrage | **crédit d'usage `$CATENTA`** (ERC-20, §8.3bis) | facturer l'usage on-chain sans vendre de jeton — inspiré et démarqué de Galeon |
| Attribution des rôles | `grantRole` par l'admin | **`REGISTRAR_ROLE`** (agrément délégué) + `MerkleProof`/`claimRole` en option à l'échelle | plusieurs opérateurs sans multiplier la racine (§2) ; passage à l'échelle nationale via admission déléguée |
| Réentrance | `ReentrancyGuard` | `ReentrancyGuardTransient` | même garantie, ~18 000 gas de moins (pragma ≥ 0.8.24) |
| Admin | multisig « à mettre » | `AccessControlDefaultAdminRules` | la protection devient structurelle et non procédurale |
| CI | annoncée | **à construire** — le projet précédent n'en avait pas | C5 l'exige explicitement |

---

## 14. Décisions encore ouvertes

| # | Question | Options | Recommandation |
|---|---|---|---|
| D1 | Qui détient le passeport après la pose ? | patient / cabinet / registre | **le cabinet** — le patient n'a pas de wallet ; le lien patient passe par l'engagement salé |
| D2 | Un lot peut-il alimenter plusieurs laboratoires ? | oui / non | **non en v1** — un lot appartient à un labo ; le multi-labo demande un modèle de transfert de lot |
| D3 | Le rappel est-il révocable (faux positif) ? | irréversible / `liftRecall` par le régulateur | **`liftRecall` en v1** — un rappel erroné qui condamne un lot à vie est un vecteur de griefing (attaque n°7) |
| D4 | Qui paie le gas ? | chaque acteur / relayeur ERC-2771 | **chaque acteur en v1** (démo) ; meta-transactions documentées en v2 comme condition d'adoption réelle |
| D5 | Montant de caution : fixe ou proportionnel au volume ? | fixe / par lot | **fixe en v1** ; le proportionnel ajoute une comptabilité par lot pour peu de valeur pédagogique |
| D6 | Multisig admin dès Sepolia ? | EOA / Safe | **Safe si le temps le permet** — sinon documenter la limite explicitement (attaque n°13) |
| D7 | Identité des acteurs on-chain ? | rien / annuaire off-chain / racine de Merkle | **racine de Merkle pour les praticiens** (§9.4, niveau 2) + annuaire off-chain pour l'affichage ; **jamais** le RPPS en clair. SIRET du labo tolérable on-chain (entité légale) |
| D8 | Crédit d'usage : brûlé ou recyclé ? | burn / recyclage vers un pot | **brûlé** (§8.3bis) — recycler ferait du crédit une monnaie qui circule (comptabilité, gouvernance, risque réglementaire). Récompenses par mint bonus, plus tard |

Ces six points doivent être tranchés **avant l'écriture du premier contrat** : chacun a un impact structurel.
</content>
