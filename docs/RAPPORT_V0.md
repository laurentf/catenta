# Catenta — Rapport d'implémentation v0

**Objet.** Rendre compte de la première implémentation : ce qui existe, pourquoi chaque choix a été fait, ce qu'il apporte, et ce qu'il coûte. Ce document est écrit pour être **défendu** : chaque avantage est suivi de sa limite, et les alternatives écartées sont nommées avec leur raison.

**Périmètre.** Le socle v0 — autorité de rôles, deux stockages permanents, un module de cycle de vie. Le rappel de lot, la caution qualité, la CI, le déploiement et le front ne sont **pas** dans ce rapport parce qu'ils ne sont pas faits.

---

> **Note de mise à jour.** Ce rapport décrivait le socle v0 initial. Depuis, se sont ajoutés — **déployés sur Sepolia** — le crédit d'usage `$CATENTA` (ERC-20) et l'agrément délégué (`REGISTRAR_ROLE`). Le design de ces deux ajouts est dans [SPEC §8.3bis](SPEC.md) et [§2](SPEC.md) ; les chiffres ci-dessous sont à jour, le raisonnement des §2 à §10 reste valable.

## 1. État vérifié

Mesures réelles, reproductibles par les commandes ci-dessous :

| Commande | Résultat |
|---|---|
| `npx hardhat compile` | ✅ 6 fichiers, solc `0.8.34` |
| `npx solhint "contracts/**/*.sol"` | ✅ **0 problème** |
| `npx hardhat test mocha` | ✅ **14/14** |
| `npx hardhat test --coverage` | 95,90 % lignes · 94,68 % instructions — **à lire avec la §8** |

| Fichier | Nature |
|---|---|
| `contracts/access/CatentaRoles.sol` | autorité (rôles acteurs, opérateurs, modules) |
| `contracts/access/RoleAware.sol` | base abstraite |
| `contracts/tokens/PassportNFT.sol` | **stockage permanent** (ERC-721) |
| `contracts/tokens/MaterialLots.sol` | **stockage permanent** (ERC-1155) |
| `contracts/tokens/CatentaCredit.sol` | **stockage permanent** (ERC-20, crédit d'usage) |
| `contracts/modules/LifecycleModule.sol` | **module remplaçable** (cycle de vie + facturation) |
| `test/Lifecycle.smoke.ts` | scénarios de bout en bout, crédit et agrément délégué inclus |

**Ce qui n'existe pas encore** : rappel de lot, accusés de réception, caution qualité, CI GitHub Actions, vérification Etherscan, tests de propriétés Solidity, rapport de gas, analyse Slither.

---

## 2. L'architecture — le choix central

```
                    ┌───────────────────────┐
                    │     CatentaRoles      │   AUTORITÉ
                    │  AccessControlEnum.   │   rôles acteurs + rôles modules
                    └───────────┬───────────┘
              « ai-je ce rôle ? »│  (aucun contrat ne connaît ses pairs)
        ┌────────────────┬───────┴────────┬──────────────────┐
        ▼                ▼                ▼                  ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
│  PassportNFT  │ │ MaterialLots │ │ Lifecycle    │  │  (à venir)   │
│  ERC721+Enum. │ │ ERC1155+Sup. │ │ Module       │  │ Recall·Bond  │
│  soulbound    │ │ +Burnable    │ │              │  │ Acknowledge  │
├───────────────┤ ├──────────────┤ ├──────────────┤  ├──────────────┤
│  PERMANENT    │ │  PERMANENT   │ │ REMPLAÇABLE  │  │ ADDITIF      │
│  traits figés │ │ soldes lots  │ │ statuts      │  │ leur état    │
└───────────────┘ └──────────────┘ └──────────────┘  └──────────────┘
     ce qui ne change jamais          ce qui change
```

**La règle en une phrase :** *ce qui doit survivre vit dans un stockage permanent ; ce qui est susceptible d'évoluer vit dans un module qu'on peut remplacer ; personne ne connaît l'adresse de personne, tout passe par les rôles.*

**Preuve, pas promesse.** Un test déploie un **second** `LifecycleModule`, bascule les rôles, et vérifie qu'il pilote les passeports et les lots créés par le premier — pendant que l'ancien devient impuissant. Passeport intact, lot à 450 unités, nouveau mint fonctionnel, ancien module en revert.

---

## 3. Les décisions, une par une

### 3.1 Séparer autorité / stockage / logique

| | |
|---|---|
| **Choix** | Trois couches, découplées par les rôles plutôt que par des adresses |
| **Pourquoi** | La première version couplait tout : le registre déployait le NFT et s'inscrivait en `immutable` dedans. Changer une règle métier aurait voulu dire redéployer le NFT — donc **perdre tous les passeports** |
| **Avantage** | Ajouter un module (rappel, caution, accusés) ne touche à **rien** : on déploie, on accorde un rôle, c'est fini |
| **Limite** | Une indirection de plus à chaque appel (un `hasRole` externe, ~2 600 gas). Et surtout : **l'état local d'un module ne migre pas** — remplacer `LifecycleModule` remettrait les statuts à zéro sans fonction de migration dédiée |
| **Alternative écartée** | *Eternal storage* (toute la donnée dans un contrat de stockage générique). Résout la migration, mais rend le code illisible et nous ramène à la complexité des proxies qu'on refuse |

> **À dire à l'oral :** *ajouter* est gratuit, *remplacer* demande un plan de migration. C'est un compromis assumé, pas un angle mort.

### 3.2 Rôles sémantiques plutôt qu'`AccessManager`

| | |
|---|---|
| **Choix** | `AccessControlEnumerable` avec des rôles nommés (`LAB_ROLE`, `PASSPORT_MINTER_ROLE`) |
| **Pourquoi** | `LAB_ROLE` se lit dans le code ; un identifiant `uint64` ne se lit nulle part. Le jury lit le code |
| **Avantage** | Les règles d'accès restent **dans** les contrats. `AccessControlEnumerable` donne en prime la liste des labos et praticiens agréés sans indexeur |
| **Limite** | Pas de permission par fonction, pas de délai intégré. Un changement de rôle est immédiat |
| **Alternative écartée** | OZ `AccessManager` — techniquement supérieur pour un système modulaire (ciblage par fonction, délais natifs), mais il sort les règles du code. **Reste l'échappatoire** si des permissions temporisées deviennent nécessaires |

### 3.3 Deux familles de rôles, séparées

`LAB_ROLE` / `PRACTITIONER_ROLE` / `DISTRIBUTOR_ROLE` / `REGULATOR_ROLE` sont pour des **humains et organisations**. `PASSPORT_MINTER_ROLE` / `PASSPORT_CONTROLLER_ROLE` / `LOT_MINTER_ROLE` / `LOT_BURNER_ROLE` sont pour des **contrats**.

- **Avantage** : le store applique une règle simple et vérifiable ; toute la logique métier reste dans le module.
- **Limite, et c'est la vraie faiblesse du modèle** : accorder un rôle module à une adresse externe **court-circuite entièrement la logique métier**. Rien dans le code ne l'empêche. C'est une erreur au niveau administrateur, à couvrir par la checklist de déploiement et le multisig — pas par le contrat.

### 3.4 Le passeport *soulbound*, verrouillé sur `_update`

| | |
|---|---|
| **Choix** | Surcharge de `_update`, pas de `transferFrom` |
| **Pourquoi** | **Tous** les chemins de transfert d'ERC721 — `transferFrom`, `safeTransferFrom`, les chemins internes — passent par `_update`. Surcharger les points d'entrée publics laisserait les internes grands ouverts |
| **Avantage** | Une seule ligne de défense, impossible à contourner. Le mint reste autorisé, le burn est refusé (un dispositif retiré reste un fait historique) |
| **Limite** | Un passeport ne peut jamais être détruit, même en cas d'erreur de saisie. La correction se fera par un événement de rectification, pas par un effacement |

### 3.5 Le handoff en deux temps

| | |
|---|---|
| **Choix** | `initiateHandoff(id, to)` puis `acceptHandoff(id)`, l'autorisation étant consommée **dans** `_update` |
| **Pourquoi** | Le document de cadrage prévoyait un booléen `authorizedHandoff[tokenId]`. Un booléen que personne ne remet à zéro laisse le token transférable **indéfiniment** : le soulbound se désactive silencieusement |
| **Avantage** | Autorisation **atomique et à usage unique**, destinataire épinglé nominativement, et personne ne peut se voir imposer un passeport sans l'avoir accepté |
| **Limite** | Deux transactions au lieu d'une, donc deux fois le gas et une friction d'usage réelle. Une variante co-signée EIP-712 en une transaction est possible, mais elle demande une infrastructure de signature côté front |

### 3.6 ERC-1155 pour les lots, non transférables

| | |
|---|---|
| **Choix** | `ERC1155` + `ERC1155Supply` + `ERC1155Burnable`, transferts bloqués dans `_update` |
| **Pourquoi** | Un lot est une **quantité semi-fongible** — « X grammes de zircone du lot N ». L'ERC-721 imposerait un token par gramme, l'ERC-20 un contrat par lot. Et `totalSupply(lotId)` **est** la quantité restante, gratuitement, au lieu d'un compteur à maintenir |
| **Avantage** | Le lien matière → prothèse est établi **dans la transaction même** qui crée le passeport (burn + mint atomiques). Il ne peut pas être reconstruit après coup |
| **Limite** | Un lot appartient à un seul laboratoire. Le cas réel du lot partagé ou revendu entre labos n'est **pas** modélisé, et le sera au prix d'un modèle de custody |

### 3.7 Le statut « Rappelé » restera dérivé

Décidé, spécifié, **pas encore codé**. L'enum stocké est volontairement `{ Manufactured, Certified, Placed }` — sans `Recalled`.

- **Pourquoi** : un rappel est une propriété du **lot**. Le stocker aussi sur chaque passeport créerait deux sources de vérité qui divergent.
- **Avantage** : `declareRecall` sera **une seule écriture**, que le lot ait produit 3 ou 30 000 passeports. Aucune boucle on-chain, donc aucun DoS par gas sur le chemin critique. C'est ce qui rend l'« alerte nationale » techniquement honnête.
- **Limite** : la chaîne ne *pousse* rien. Elle rend l'information disponible en O(1) et prouve qui l'a lue — le fan-out de notification est **hors chaîne**, assumé.

### 3.8 Ce qui est immuable est figé au mint

`PassportNFT.Traits` (lot d'origine, horodatage, empreinte du dossier de conformité) est écrit au mint et n'a **aucun setter**.

- **Avantage** : l'antériorité et la provenance ne sont pas une règle applicative, elles sont une propriété du code.
- **Limite** : une empreinte erronée au mint est définitive. La correction passera par un événement de rectification traçable, jamais par une réécriture — ce qui est le comportement voulu pour un registre de preuve.

### 3.9 Les événements, placés par couche

| | |
|---|---|
| **Choix** | Le store permanent émet ce qui touche à son état (`PassportIssued`, `HandoffArmed`, `LotDeclared`) ; le module n'émet que le fait métier qu'il possède en propre (`MaterialConsumed`) ; aucun doublon d'un événement OpenZeppelin |
| **Pourquoi** | Un audit a trouvé deux défauts réels : `conformityHash` et `patientCommitment` étaient **écrits en storage sans être émis nulle part** — un indexeur devait faire un appel par entité. Et `HandoffArmed`/`HandoffInitiated` puis `HandoffAccepted`/`Transfer` mettaient deux fois le même fait dans la même transaction |
| **Avantage** | Un indexeur qui suit les **stores** continue de fonctionner **après un remplacement de module** — s'il suivait les événements du module, il faudrait le repointer à chaque bascule. C'est le prolongement direct du découplage |
| **Limite** | Lire l'état complet d'un passeport demande de croiser des événements de deux contrats. La couche de lecture (`CatentaLens`, v1) l'absorbe côté front |

### 3.10 Pas de proxy, pragma figé

`0.8.34` sans caret, aucune variante `Upgradeable`, aucun proxy.

- **Pourquoi** : un registre de preuve dont le code peut changer perd sa valeur probante. Et pour un contrat non upgradeable, **la version du compilateur fait partie de l'artefact** au même titre que le bytecode.
- **Avantage** : ce qui est vérifié sur Etherscan est ce qui s'exécutera, définitivement. `0.8.34` débloque au passage le stockage transitoire (EIP-1153) pour `ReentrancyGuardTransient`.
- **Limite** : une faille dans un contrat déployé ne se corrige pas — elle se contourne en révoquant le rôle du module fautif et en en déployant un autre. **C'est précisément pour ça que l'architecture modulaire de la §3.1 existe** : elle est notre mécanisme de correction, à la place de l'upgradeabilité.

### 3.11 OpenZeppelin partout où c'est possible

Modules effectivement utilisés à ce stade : `AccessControlEnumerable`, `ERC721`, `ERC721Enumerable`, `ERC1155`, `ERC1155Supply`, `ERC1155Burnable`. Les événements `Transfer`, `TransferSingle` et `RoleGranted` qu'ils émettent font partie de l'API publique du système et ne sont jamais redoublés (§3.9).

- **Avantage** : le code écrit à la main se réduit à la logique métier dentaire. La surface non auditée est petite — et c'est exactement là que l'effort de test se concentre.
- **Limite** : les surcharges multiples sont le point de fragilité. `ERC721` et `ERC721Enumerable` se disputent `_update` et `_increaseBalance`, ce qui impose des `override(A, B)` explicites. **C'est là qu'on casse silencieusement une garantie auditée**, donc chaque couture est commentée et doit être testée individuellement.
- **Règle appliquée** : on ne rejoue **pas** la suite de tests d'OpenZeppelin. Cela gonflerait la couverture sans rien démontrer.

---

## 4. Ce que le code apporte, résumé

| Problème terrain | Réponse dans le code v0 |
|---|---|
| Passeport papier falsifiable | ERC-721 dont les traits sont figés au mint et le transfert verrouillé |
| Provenance matière invérifiable | burn ERC-1155 dans la transaction de mint — lien atomique, non reconstructible |
| Responsabilité du praticien | chaque acte est horodaté et attribué à un signataire porteur d'un rôle agréé |
| Faux passeport | mint réservé au `LAB_ROLE`, sur allowlist administrée |
| Registre neutre entre concurrents | aucun acteur n'héberge la vérité des autres |

---

## 5. Face au référentiel, honnêtement

| Comp. | État réel |
|---|---|
| **C1** | ✅ spécifié — besoin, apport blockchain, schéma fonctionnel, arborescence |
| **C2** | 🟡 **partiel** — machine à états et RBAC codés ; rappel et caution non |
| **C3** | 🟡 **partiel** — ERC-721 et ERC-1155 codés et justifiés ; ERC-20 non |
| **C4** | 🟡 **partiel** — tableau des 17 attaques rédigé ; parades codées pour 4 d'entre elles |
| **C5** | ❌ **non fait** — Git initialisé, **aucune CI** |
| **C6** | 🟡 **trompeur** — voir §8 |
| **C7** | ❌ **non fait** |
| **C8** | ❌ **non fait** |

Aucune compétence n'est acquise tant que C5, C7 et C8 sont vides. Le socle est solide, il n'est pas certifiant.

---

## 6. Limites assumées, à énoncer avant qu'on nous les oppose

1. **L'administrateur reste un point de centralisation.** Il peut accorder un rôle module à une adresse externe et court-circuiter toute la logique. Parades prévues : multisig, `AccessControlDefaultAdminRules`, timelock. **Aucune n'est en place aujourd'hui.**
2. **L'oracle physique ↔ numérique n'est pas résolu.** Rien ne garantit que la couronne réellement posée est celle du passeport. La chaîne garantit l'attribution et la non-réécriture, pas la véracité à la source. Parade partielle prévue : co-signature au handoff.
3. **Personne ne paiera le gas.** Un cabinet dentaire n'aura jamais d'ETH. Sans meta-transactions, le modèle n'est pas déployable en production. C'est une condition d'adoption, pas un détail.
4. **Aucune donnée patient n'est encore protégée en pratique** — l'engagement salé est spécifié et le paramètre existe, mais la génération et la conservation du sel sont un processus **hors chaîne** qui reste entièrement à construire.
5. **L'état de module ne migre pas** (§3.1).
6. **Un lot appartient à un seul laboratoire** (§3.6).
7. **La couverture affichée est trompeuse** (§8).

---

## 7. La question qui fait la différence : et sans blockchain ?

C'est le critère C1 (« l'apport de la technologie blockchain est démontré ») et c'est la question à provoquer plutôt qu'à subir.

> **Retirez la chaîne : qu'est-ce qui casse ?**
>
> Il faudrait qu'un laboratoire héberge la base de données de ses concurrents, ou qu'un tiers privé la détienne et puisse la réécrire après un incident. Les deux sont refusés par les acteurs eux-mêmes. **L'apport n'est pas la performance ni le coût — une base classique gagnerait sur les deux. C'est la confiance entre parties non coopératives.**

C'est aussi le test qui distingue ce projet du comparable français le plus connu, dont le produit — un dossier patient en SaaS — fonctionnerait à l'identique sans sa blockchain (voir [ETUDE_GALEON.md](ETUDE_GALEON.md)).

---

## 8. Le chiffre de couverture, et pourquoi il ne vaut rien aujourd'hui

`hardhat test --coverage` affiche **95,90 % de lignes**. Avec **14 tests**. Il faut le dire soi-même avant qu'on le découvre.

**Ce que le chiffre mesure vraiment.** La couverture de lignes compte les lignes *exécutées*, pas les comportements *vérifiés*. Le test de bout en bout traverse presque tout le chemin nominal, donc il allume presque toutes les lignes. Mais :

- les **branches de revert** ne sont quasiment pas couvertes — un seul `require` sur la dizaine que compte `LifecycleModule` est testé ;
- **aucun test négatif systématique** : les trois axes de la convention (nominal / rôle / état) ne sont appliqués à aucune fonction ;
- **aucun test de propriété** Solidity, alors que le verrou soulbound et la comptabilité des lots sont exactement ce qui gagne au *fuzzing* ;
- les lignes non couvertes (`mintedCount`, `supportsInterface`, `lotCount`) sont anecdotiques — leur absence masque les vraies lacunes.

**Conclusion à assumer :** la couverture de lignes est un symptôme, pas un objectif. Le chiffre honnête aujourd'hui serait plutôt *« le chemin nominal est verrouillé, les chemins d'erreur ne le sont pas »*. La cible réelle est **> 90 % avec 80 à 100 tests**, dont un test négatif par fonction et par garde.

---

## 9. Questions probables, et réponses

**« Pourquoi ne pas rendre les contrats upgradeables ? »**
> Parce que la valeur du registre est sa non-réécriture. Un registre dont le code peut changer après l'incident ne protège plus le praticien. Notre mécanisme de correction n'est pas le proxy, c'est la révocation d'un rôle et le déploiement d'un module de remplacement — ce qui laisse les passeports et les lots intacts.

**« Votre découplage par rôles, ça n'ajoute pas juste de la complexité ? »**
> Il ajoute un appel externe par action. En échange, ajouter le rappel, la caution ou les accusés de réception ne touchera aucun contrat existant. Le test n°4 le démontre : un second module pilote les passeports déjà créés par le premier.

**« Trois standards de jetons, ce n'est pas décoratif ? »**
> Retirez-en un et une fonctionnalité disparaît. L'ERC-721 *est* le dispositif, non transférable parce qu'un dispositif médical n'est pas un actif. L'ERC-1155 modélise une quantité de matière consommable — c'est le burn qui crée le lien matière-prothèse. L'ERC-20 mettra un enjeu économique derrière la qualité.

**« 95 % de couverture avec 4 tests, c'est sérieux ? »**
> Non, et c'est pour ça que je le signale moi-même. Voir §8.

**« Qu'est-ce qui empêche l'administrateur de tout casser ? »**
> Aujourd'hui, rien. C'est la limite n°1 de la §6, et les parades sont identifiées : multisig, `AccessControlDefaultAdminRules`, timelock.

---

## 10. Prochaines étapes, par ordre de valeur

1. **La CI** — c'est le seul livrable C5, et le monter sur 5 contrats est plus simple que sur 9.
2. **La vraie suite de tests** — trois axes par fonction, plus les propriétés Solidity. C'est ce qui transforme la §8 d'aveu en argument.
3. **Le module de rappel** — le point d'architecture le plus distinctif, et il ne touchera aucun contrat existant.
4. **Ignition + Sepolia vérifié** — C8, et ça débloque le front.
5. **Le front** — C7, et sans lui rien n'est démontrable devant un jury.

---

*Toutes les mesures de ce rapport sont reproductibles : `npm install && npx hardhat compile && npx solhint "contracts/**/*.sol" && npx hardhat test --coverage`.*
