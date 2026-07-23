# Catenta — Conventions de développement

Ces conventions sont **reprises du projet `alyra-blockchain-projet-1`**, qui les a validées sur un rendu complet (contrats, double suite de tests, dApp déployée). Elles sont ici figées, complétées, et corrigées sur le seul point où le projet précédent était en défaut : **l'intégration continue, qui n'existait pas**.

Principe directeur : **le code et la documentation technique (NatSpec, commentaires, noms) sont en anglais ; la documentation projet (README, spécification, roadmap) est en français.**

---

## 1. Solidity

### 1.1 En-tête et version

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;
```

**Pragma figé, pas de caret.** Un `^0.8.0` autorise une compilation avec un compilateur non testé : pour du code de production non upgradeable, la version du compilateur fait partie de l'artefact.

### 1.2 NatSpec — complet, sur chaque élément public

Chaque contrat, fonction, événement, erreur, struct et champ d'état porte du NatSpec.

- `@notice` — **ce que ça fait**, pour l'appelant.
- `@dev` — **pourquoi c'est fait comme ça** : l'arbitrage, la limite assumée, le piège évité. C'est la partie qui a de la valeur ; un `@dev` qui paraphrase le nom de la fonction est du bruit.
- `@param` / `@return` sur tout ce qui en a.

```solidity
/// @notice Declares a recall on a material lot; every passport issued from it
///         is reported as recalled from the next read on.
/// @dev O(1) by design: a single flag on the lot, never a loop over passports —
///      that loop is the DoS vector this architecture exists to avoid. The
///      derived status lives in statusOf(), the single source of truth.
/// @param _lotId The lot being recalled.
/// @param _evidenceHash Fingerprint of the off-chain evidence file (IPFS).
function declareRecall(uint256 _lotId, bytes32 _evidenceHash)
    external
    onlyRole(REGULATOR_ROLE)
{ ... }
```

### 1.3 Erreurs — personnalisées uniquement, jamais de chaîne

```solidity
error Soulbound(uint256 tokenId);
error WrongStatus(Status expected, Status current);
error BondLocked(uint40 withdrawableAt);

require(status == _expected, WrongStatus(_expected, status));
```

Deux règles :
- **Zéro `require(cond, "message")`** — plus cher en déploiement et en revert, et non décodable par l'appelant.
- **Erreurs à arguments** dès que le contexte aide au diagnostic (`WrongStatus(attendu, actuel)` plutôt que `WrongStatus()`).

La forme `require(cond, CustomError(args))` (Solidity ≥ 0.8.26) est préférée au `if (!cond) revert CustomError(args)` : la condition se lit à l'endroit et non à l'envers.

### 1.4 Contrôle d'accès et gardes dans la signature

Qui peut appeler, et quand, doit se lire sur la **première ligne** de la fonction :

```solidity
function attestConformity(uint256 _tokenId)
    external
    onlyRole(PRACTITIONER_ROLE)
    onlyStatus(_tokenId, Status.Manufactured)
{ ... }
```

Modifiers pour l'autorisation et les gardes d'état ; le corps de la fonction ne contient que la logique métier.

### 1.5 Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Contrat, struct, enum | `PascalCase` | `LifecycleModule`, `Traits` |
| Fonction, variable | `camelCase` | `declareRecall`, `withdrawableAt` |
| Paramètre de fonction | `_` en préfixe | `_tokenId`, `_evidenceHash` |
| Fonction / variable privée ou interne | `_` en préfixe | `_transitionTo`, `_pendingHandoff` |
| Constante, immutable, rôle | `SCREAMING_SNAKE_CASE` | `WITHDRAWAL_COOLDOWN`, `LAB_ROLE` |
| Événement | fait accompli, au passé | `PassportIssued`, `RecallAcknowledged` |
| Erreur | condition d'échec | `Soulbound`, `BondLocked` |

### 1.6 Organisation d'un contrat

Ordre imposé : `type declarations` → `state variables` → `events` → `errors` → `modifiers` → `constructor` → `external` → `public` → `internal` → `private`.

Les blocs fonctionnels sont séparés par des bandeaux, comme dans le projet précédent :

```solidity
// ==================================================
//                   LAB FUNCTIONS
// ==================================================
```

### 1.7 OpenZeppelin — règles d'usage

**Règle n°1 : ne jamais réimplémenter ce qu'OpenZeppelin fournit.** Rôles, réentrance, pause, standards de jetons, signatures EIP-712, ensembles énumérables, preuves de Merkle : si le module existe, il est importé. Un `mapping(address => bool) isAdmin` écrit à la main est un défaut, pas une simplification — l'inventaire complet des modules retenus est en [SPEC §8.4](SPEC.md#84-inventaire-openzeppelin--module-par-module).

**Règle n°2 : un module importé doit être justifié en une phrase.** Si on ne sait pas dire ce qu'il remplace concrètement, il ne rentre pas. Les modules écartés sont documentés avec leur raison ([SPEC §8.7](SPEC.md)) — c'est la liste que le jury lira pour vérifier qu'il y a eu choix et pas copie.

**Règle n°3 : imports nommés, jamais d'import global.**

```solidity
// ✅
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

// ❌ — pollue l'espace de noms, masque les collisions
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
```

> Écart avec le projet précédent, qui utilisait l'import global. Sur un contrat unique et une seule dépendance c'était sans conséquence ; avec ~25 modules et quatre contrats, les imports nommés deviennent nécessaires.

**Règle n°4 : version épinglée, exacte.** `"@openzeppelin/contracts": "5.x.y"` sans caret. La version de la librairie fait partie de l'artefact déployé au même titre que celle du compilateur.

**Règle n°5 : toute surcharge d'un hook OZ porte un `@dev` qui dit pourquoi.** Les surcharges (`_update`, `_grantRole`, `supportsInterface`) sont exactement les endroits où l'on peut casser silencieusement une garantie auditée. Chacune est commentée et testée individuellement.

```solidity
/// @dev Overridden to make the passport soulbound. Hooked on _update (and not
///      on transferFrom) because every transfer path — transferFrom,
///      safeTransferFrom, internal — funnels through it: overriding the public
///      entry points would leave the internal ones open.
function _update(address to, uint256 tokenId, address auth)
    internal
    override(ERC721, ERC721Enumerable)
    returns (address)
{ ... }
```

**Règle n°6 : ne pas retester OpenZeppelin.** Les tests portent sur les **coutures** (surcharges, orchestration, gardes métier), pas sur le comportement d'`ERC721` — voir [SPEC §8.6](SPEC.md). Rejouer la suite d'OZ gonfle la couverture sans rien démontrer.

**Règle n°7 : branche non-upgradeable uniquement.** Aucun `@openzeppelin/contracts-upgradeable`, aucun proxy. Décision structurante, documentée en [SPEC §1.4](SPEC.md).

### 1.8 Événements — trois règles

Les événements sont l'API de lecture du système : le front et l'indexeur ne voient rien d'autre. Trois règles, dans cet ordre de priorité.

**Règle 1 — tout ce qui est écrit doit être émis.** Si une donnée est inscrite en storage et n'apparaît dans aucun événement, l'indexeur doit faire un appel par entité pour la récupérer. C'est le défaut le plus fréquent et le plus coûteux à réparer après coup.

> Contrôle systématique en revue : pour chaque écriture de storage, quel événement la porte ? `conformityHash` et `patientCommitment` sont passés à travers ce filet en v0 — ils étaient stockés sans être émis nulle part.

**Règle 2 — ne jamais dupliquer un événement OpenZeppelin.** `Transfer`, `TransferSingle`, `RoleGranted` sont déjà émis et déjà indexés par tout l'écosystème. Un événement maison qui redit la même chose met le même fait deux fois dans la même transaction et double le travail de l'indexeur.

| Fait | Qui l'émet |
|---|---|
| un passeport a changé de main | `Transfer` (ERC-721) — **pas** un `HandoffAccepted` maison |
| de la matière a été consommée | `TransferSingle` vers `address(0)` — **pas** un `MaterialBurned` maison |
| un rôle a été accordé | `RoleGranted` (AccessControl) |

**Règle 3 — chaque contrat émet les faits sur son propre état.** Dans une architecture modulaire, c'est ce qui décide *où* placer un événement :

- **le store permanent** émet ce qui touche à son état (`PassportIssued`, `HandoffArmed`, `LotDeclared`). Un indexeur qui le suit continue de fonctionner **après un remplacement de module** ;
- **le module** émet uniquement le fait métier qu'il possède en propre — la corrélation entre deux contrats, typiquement (`MaterialConsumed` lie le burn ERC-1155 et le mint ERC-721 de la même transaction).

Un événement qui ne serait ni l'un ni l'autre est un doublon : il faut choisir sa couche, pas émettre des deux côtés.

**Forme.** Trois paramètres `indexed` au maximum : les réserver aux clés de jointure (identifiants, adresses), jamais aux valeurs (montants, empreintes) qu'on ne filtre pas. Nommer au fait accompli (`PassportIssued`, pas `IssuePassport`). NatSpec `@param` sur chaque champ, et un `@dev` qui dit **pourquoi cet événement est là et pas ailleurs** dès qu'il y a un choix de couche.

**Test.** Tout événement se vérifie avec `withArgs`, jamais avec un `.to.emit()` nu — sinon on valide qu'un événement part, pas qu'il dit la vérité.

### 1.9 Règles de fond

- **Checks-Effects-Interactions** sur tout ce qui touche à la caution, systématiquement, `nonReentrant` en ceinture-bretelles.
- **Aucune boucle non bornée** sur un tableau alimenté par des utilisateurs. Si une itération semble nécessaire, c'est le modèle de données qu'il faut revoir (cf. le rappel dérivé).
- **`SafeERC20`** pour tout transfert de jeton fongible.
- **Pas de proxy upgradeable** — choix documenté, pas un oubli (SPEC §1.4).
- **Une limite connue se documente dans le `@dev`.** Un compromis assumé et écrit vaut mieux qu'un compromis découvert par le jury.

### 1.10 Lint

`solhint` avec `solhint:recommended` + `compiler-version: 0.8.34`, `func-visibility`, `no-unused-vars`, `custom-errors`. Bloquant en CI.

---

## 2. Structure du dépôt

```
catenta/
├── contracts/
│   ├── access/                  CatentaRoles.sol · RoleAware.sol
│   ├── tokens/                  PassportNFT.sol · MaterialLots.sol · CatentaCredit.sol   (permanents)
│   ├── modules/                 LifecycleModule.sol · RecallModule.sol ·
│   │                            BondModule.sol · CatentaLens.sol        (remplaçables)
│   └── mocks/                   ReentrantAttacker.sol · MockEUR.sol
├── test/
│   ├── Lifecycle.ts             scénarios (mocha + ethers)
│   ├── Passport.lifecycle.ts
│   ├── Recall.ts
│   ├── Bond.ts
│   └── Invariants.t.sol         propriétés (forge-std, fuzz)
├── ignition/modules/Catenta.ts
├── scripts/                     vérification Etherscan, seed de démo
├── .github/workflows/ci.yml
├── docs/
└── web/                         dApp Vue 3
```

`artifacts/`, `cache/`, `types/`, `coverage/`, `ignition/deployments/`, `node_modules/`, `.env*` sont **ignorés par Git** (reprendre le `.gitignore` du projet précédent).

---

## 3. Tests

### 3.1 Deux runners, deux techniques

Hardhat 3 expose deux runners et `npx hardhat test` lance les deux. La séparation n'est **pas** « unitaire vs intégration » — elle porte sur la technique.

| Runner | Technique | Ce qu'on y met |
|---|---|---|
| **Solidity** (`forge-std`) | **propriétés** / *fuzzing* — 256 entrées aléatoires par test | logique pure in-EVM : invariants de quantité de lot, verrou soulbound, comptabilité de la caution, bornes arithmétiques |
| **TypeScript** (mocha + ethers v6) | **scénarios** — cas choisis à la main | tout ce qui sort de l'EVM : plusieurs signataires, décodage d'events et d'erreurs custom, orchestration multi-contrats, temps |

**Règle de répartition :** *si le test ne sort pas de l'EVM et gagne à explorer des entrées aléatoires → Solidity ; dès qu'il faut plusieurs signataires, décoder des events ou orchestrer plusieurs contrats → TypeScript.*

`forge-std` est une simple dépendance npm : **Foundry n'est ni installé ni requis**, c'est le runner Solidity natif de Hardhat 3 qui exécute ces tests.

> À dire honnêtement à l'oral : le fuzzing **augmente la confiance**, il ne *prouve* pas l'absence de bug. L'*invariant testing* et l'audit vont plus loin.

### 3.2 Fixtures

Un état du cycle de vie = une fixture `loadFixture`, en couches :

```ts
deployFixture            → contrats déployés, rôles attribués
  └─ lotDeclaredFixture       → un lot de matériau déclaré
      └─ passportMintedFixture   → un passeport minté (lot partiellement brûlé)
          └─ conformityFixture      → conformité attestée
              └─ placedFixture         → prothèse posée
                  └─ recalledFixture      → lot rappelé
```

`loadFixture` déploie **une fois** puis restaure un snapshot avant chaque `it` : isolation stricte et exécution nettement plus rapide qu'un redéploiement.

### 3.3 Règles TypeScript

- **Zéro `any`.** Contrats et signataires sont typés par les bindings générés sous `types/` au `compile` (dossier généré, non versionné).
- **Événements** : `expect(tx).to.emit(c, "PassportIssued").withArgs(...)` — toujours avec `withArgs`.
- **Erreurs** : `revertedWithCustomError(c, "Soulbound").withArgs(id)` — jamais `reverted` seul, qui passe pour la mauvaise raison.
- **Temps** : `networkHelpers.time.increase()` autour du *cooldown* de caution — tester **avant** la borne (revert) et **après** (succès).
- Un miroir TS des enums Solidity en tête de fichier, commenté comme tel.

### 3.4 Couverture par fonction — les trois axes

Pour **chaque** fonction publique :

1. **Chemin nominal** — effets d'état vérifiés **et** événement émis avec ses arguments.
2. **Contrôle d'accès** — appel par un acteur sans le rôle → revert typé.
3. **Garde d'état** — appel au mauvais moment du cycle de vie → revert typé.

S'y ajoutent les cas limites propres au domaine : quantité de lot insuffisante, double accusé de réception, retrait avant échéance, rappel sur un lot inexistant, handoff rejoué.

### 3.5 Seuil

```bash
npx hardhat test --coverage     # rapport console + coverage/html
```

Plancher **bloquant à 80 %** de lignes en CI (exigence C6), **cible 90 %+**. Le seuil n'est pas atteint par des tests décoratifs : la couverture est un symptôme, pas l'objectif.

---

## 4. Front

### 4.1 Stack

Vue 3 (`<script setup>` + TypeScript) · Vite · **Reown AppKit** (connexion wallet, extensions + mobile) · **ethers v6** · Pinia · vue-i18n (FR/EN) · Tailwind.

### 4.2 Organisation

```
web/src/
├── lib/
│   ├── appkit.ts       init Reown (réseaux supportés)
│   ├── constants.ts    adresses de contrats, chaîne, helpers explorer
│   ├── contract.ts     ABIs, enums miroirs, parseError
│   └── format.ts       shortAddress, eqAddress, formatDate
├── stores/             un store Pinia par domaine : wallet · roles · passports · lots · recalls · bond
├── views/              une vue par entrée de l'arborescence (SPEC §3.2)
├── components/ui/      UiButton, UiCard, UiModal, UiIcon, StatusBadge
└── locales/            fr.json, en.json
```

### 4.3 Règles

- **ABIs *human-readable*** en chaînes dans `lib/contract.ts`, tenues en phase avec les contrats — **fragments `error` inclus**, sans quoi ethers ne peut pas décoder les reverts par nom.
- **`parseError`** traduit chaque erreur custom du contrat en message lisible. Un utilisateur ne doit jamais voir `execution reverted (unknown custom error)`.
- **Panneaux selon le rôle lu on-chain** (`hasRole`), pas selon un état local : un front qui décide lui-même des droits ment.
- **Aucun scan de logs sur toute la chaîne** : lecture par index jusqu'à la borne, ou depuis le bloc de déploiement, avec repli si le RPC refuse `getLogs`.
- **Aucun secret dans le front.** Les `VITE_*` sont publiques par construction ; `.env.example` documente chaque variable.
- `npm run type-check` (vue-tsc) bloquant en CI.

### 4.4 Livrable

`web/README.md` avec la stack, la configuration (`.env.example` commenté), le lancement, l'architecture, **et des captures d'écran** de chaque parcours — c'est ce qui rend le rendu lisible sans dérouler la démo.

---

## 5. Git et versions (C5)

### 5.1 Commits — *conventional commits*

```
feat:     nouvelle fonctionnalité
fix:      correction
refactor: réorganisation sans changement de comportement
test:     tests
docs:     documentation
chore:    outillage, configuration, CI
```

Sujet à l'impératif, en anglais, ≤ 72 caractères, sans point final. Reprise directe de l'historique du projet précédent (`feat: add VotingFactory deploying caller-owned elections`).

### 5.2 Branches

`main` toujours vert (CI verte, déployable). Une branche par lot de travail : `feat/passport-nft`, `feat/recall`, `feat/web-dashboard`. Fusion par PR — même en solo : la PR est ce qui déclenche la CI et laisse une trace de revue.

### 5.3 Tags

Un tag par jalon de la roadmap : `v0.1.0` (socle certifiable), `v1.0.0` (rendu), `v2.x`. L'adresse de déploiement et l'ABI sont figées avec le tag.

---

## 6. Intégration continue (C5)

> Le projet précédent **n'avait pas de CI**. C'est le principal écart à combler, et C5 l'exige explicitement (« utiliser des outils d'intégration continue sur l'ensemble du projet »).

`.github/workflows/ci.yml`, déclenché sur `push` et `pull_request` :

| Job | Étapes | Bloquant |
|---|---|---|
| **contracts** | `npm ci` → `solhint` → `hardhat compile` → `hardhat test` (les deux runners) → `hardhat test --coverage` + contrôle du seuil 80 % | ✅ |
| **security** | `slither .` sur les contrats du projet (`--filter-paths node_modules`) | ✅ sur `high`/`medium`, informatif sinon |
| **web** | `npm ci` → `vue-tsc --noEmit` → `vite build` | ✅ |

Points de vigilance identifiés :

- **Le seuil de couverture n'est pas natif** dans Hardhat 3. Il faut un petit script qui lit le rapport et sort en code ≠ 0 sous 80 % — à écrire, ce n'est pas fourni.
- **Slither est bruyant** sur OpenZeppelin. `--filter-paths node_modules` et un `slither.config.json` avec les détecteurs explicitement écartés (et **justifiés en commentaire**) sont nécessaires, sinon la CI est rouge en permanence et plus personne ne la lit.
- **Cache npm** (`actions/setup-node` avec `cache: npm`) : sans lui, chaque run réinstalle Hardhat et la CI devient trop lente pour être utilisée à chaque push.

Le déploiement du front est continu (Render ou Vercel sur `main`) ; le déploiement des contrats reste **manuel et taggé** — un contrat non upgradeable ne se déploie pas par accident.

---

## 7. Definition of Done

Une fonctionnalité n'est terminée que lorsque **toutes** ces conditions sont vraies :

- [ ] NatSpec complet, `@dev` justifiant les arbitrages
- [ ] Erreurs personnalisées, aucune chaîne dans un `require`
- [ ] Trois axes testés (nominal, accès, état) + cas limites du domaine
- [ ] Couverture globale ≥ 80 %, sans régression
- [ ] `solhint` et `slither` propres (ou écart justifié en commentaire)
- [ ] Front branché si la fonctionnalité est exposée, avec `parseError` à jour
- [ ] Documentation à jour : SPEC si le modèle change, README si l'usage change
- [ ] CI verte sur la PR
</content>
