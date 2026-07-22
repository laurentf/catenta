# Passeport Dentaire On‑Chain — Dossier technique

Traçabilité des dispositifs médicaux sur mesure (couronnes, bridges, implants) et de leurs matériaux, sur un registre partagé entre acteurs concurrents.
Ce document décrit l'architecture smart contract et sa correspondance avec le référentiel de certification.

---

## Mapping référentiel

| Comp. | Intitulé | Où c'est traité |
|-------|----------|-----------------|
| **C1** | Cahier des charges / apport blockchain | §1, §7 — neutralité inter‑acteurs, immuabilité, vide réglementaire UDI, conception RGPD‑compatible |
| **C2** | Développer le smart contract | §2, §4 — hub orchestrateur + machine à états |
| **C3** | Exploiter un jeton (fongible / non) | §3 — ERC‑721 soulbound, ERC‑1155, ERC‑20, via OpenZeppelin audité |
| **C4** | Sécurité & optimisations | §8 (tableau des attaques), §9 (gas) |
| **C5** | Gestion des versions / intégration continue | §11 — Git + GitHub Actions |
| **C6** | Tests fonctionnels (> 80 %) | §10 — Hardhat 3, invariants, couverture |
| **C7** | Front web ↔ smart contract | §12 — front de consultation RBAC |
| **C8** | Déploiement sur blockchain | §12 — Sepolia via Hardhat, vérification Etherscan |

---

## 1. Vue d'ensemble (C1 / C2)

Un **hub orchestrateur** (`DentalRegistry`) porte la logique métier et l'état mutable ; **trois contrats de tokens** portent les actifs ; un **stockage hybride** sépare les documents/PII (off‑chain) de leurs empreintes (on‑chain).

```
        Acteurs (RBAC)                Stockage off‑chain
   labo · praticien · Ordre/ARS      IPFS (docs) · PII par hash (RGPD)
              \                          /
               \                        /
                v                      v
             ┌───────────────────────────────┐
             │        DentalRegistry.sol      │  hub : cycle de vie,
             │  RBAC · rappels · caution      │  RBAC, orchestration
             └───────────────────────────────┘
                /             |             \
               v              v              v
      Passeport DM       Lots matériaux     Caution qualité
      ERC‑721 soulbound  ERC‑1155 (burn)    ERC‑20 (staking + slashing)
```

**Apport blockchain (C1)** — les labos sont en concurrence directe : aucun n'accepterait la base de données propriétaire d'un autre. La blockchain fournit un **tiers de confiance neutre** (lecture Ordre/ARS), une **immuabilité** qui protège le praticien en cas de litige, et comble un **vide réglementaire réel** (le cadre UDI exclut explicitement les dispositifs sur mesure). Ces propriétés ne sont pas reproductibles par une base centralisée seule.

---

## 2. Les contrats (C2)

| Contrat | Type | Rôle |
|---------|------|------|
| `DentalRegistry` | logique + état | orchestrateur : cycle de vie, RBAC, déclenchement des rappels, gestion de la caution |
| `PassportNFT` | ERC‑721 | passeport prothèse, non transférable (soulbound) |
| `MaterialLots` | ERC‑1155 | lots de matériaux, brûlés à la fabrication |
| `QualityBond` | ERC‑20 | caution qualité stakée par le labo, slashable |

**Séparation immuable / mutable.** Les traits immuables (référence de lot, empreinte du dossier de conformité) sont posés au mint dans les tokens. L'état mutable du cycle de vie (statut, acteur courant) vit dans le hub : ainsi **seul le hub mute l'état**, ce qui concentre et simplifie le contrôle d'accès.

Signatures clés (extrait) :

```solidity
// DentalRegistry
function mintPassport(address lab, uint256 lotId, bytes32 conformityHash) external onlyRole(LAB_ROLE) returns (uint256 tokenId);
function attestConformity(uint256 tokenId) external onlyRole(PRACTITIONER_ROLE);
function markPlaced(uint256 tokenId) external onlyRole(PRACTITIONER_ROLE);
function declareRecall(uint256 lotId, bytes32 evidenceHash) external onlyRole(REGULATOR_ROLE);
function slash(address lab, uint256 amount) external onlyRole(REGULATOR_ROLE);

// events (consommés par le front / l'indexeur)
event PassportMinted(uint256 indexed tokenId, uint256 indexed lotId, address indexed lab);
event ConformityAttested(uint256 indexed tokenId, address practitioner);
event RecallDeclared(uint256 indexed lotId, bytes32 evidenceHash);
```

---

## 3. Standards de tokens & justification (C3)

**ERC‑721 *soulbound* — le passeport prothèse.** Un token = un dispositif. Le transfert libre n'a pas de sens (un DM est lié au patient) : on rend le token non transférable en **surchargeant `_update`** (OpenZeppelin v5) et en n'autorisant que le mint et un handoff explicitement signé.

```solidity
function _update(address to, uint256 tokenId, address auth)
    internal override returns (address)
{
    address from = _ownerOf(tokenId);
    // autorise mint (from == 0) ; interdit tout transfert non autorisé
    if (from != address(0) && !_authorizedHandoff[tokenId]) revert Soulbound();
    return super._update(to, tokenId, auth);
}
```

**ERC‑1155 — les lots de matériaux.** Un lot est une **quantité semi‑fongible** (X grammes de zircone du lot N) : l'ERC‑1155 modélise cela mieux que l'ERC‑721 (un `id` par lot, un `amount` consommable). À la fabrication, la quantité utilisée est **brûlée** (`_burn`), ce qui trace le lien matière → prothèse.

**ERC‑20 — la caution qualité.** Le labo **stake** un montant à l'entrée. En cas de rappel de lot défectueux, la caution est **slashée**. Cela transforme un registre passif en système à enjeux économiques et donne une vraie surface de sécurité (voir §8).

**Librairies (C3).** Uniquement **OpenZeppelin** (audité, standard attendu) : `ERC721`, `ERC1155`, `ERC20`, `AccessControl`, `ReentrancyGuard`, `Pausable`. Aucun token décoratif : chaque standard rend effective une fonctionnalité métier.

---

## 4. Modèle de données & cycle de vie

Le passeport suit une **machine à états déterministe** (donc facile à tester, cf. C6) :

| État | Déclencheur | Acteur | Effet |
|------|-------------|--------|-------|
| `Fabriqué` | `mintPassport` | Laboratoire | mint + burn des lots consommés |
| `Conforme` | `attestConformity` | Praticien | contrôle validé |
| `Posé` | `markPlaced` | Praticien | verrou soulbound définitif |
| `Rappelé` | `declareRecall` (au niveau **lot**) | Ordre / ARS | statut dérivé + slashing |

```solidity
enum Status { Fabrique, Conforme, Pose, Rappele }

struct Passport {
    uint256 lotId;
    bytes32 conformityHash; // empreinte du dossier off‑chain
    Status  status;
}
```

**Point d'architecture clé (rappel).** Un rappel ne parcourt **jamais** une boucle sur tous les passeports (risque de DoS gas). On marque **le lot** comme rappelé (un seul write) ; le statut « rappelé » d'un passeport est **dérivé** par lecture du statut de son lot. Un unique `RecallDeclared` est émis ; le front / l'indexeur se charge du fan‑out des notifications. C'est ce qui rend l'« alerte nationale instantanée » réaliste on‑chain.

---

## 5. Contrôle d'accès — RBAC (C2 / C4)

`AccessControl` d'OpenZeppelin, un rôle = un ensemble de droits :

| Rôle | Droits |
|------|--------|
| `LAB_ROLE` | mint du passeport, déclaration/mint des lots, stake de caution |
| `PRACTITIONER_ROLE` | attestation de conformité, pose, signalement d'incident |
| `DISTRIBUTOR_ROLE` | relai d'alerte fabricant → cabinets |
| `REGULATOR_ROLE` (Ordre + ARS) | lecture totale, déclaration de rappel, slashing, suspension |
| `DEFAULT_ADMIN_ROLE` | gestion des rôles — **derrière un multisig / timelock** |

L'octroi de `LAB_ROLE` et `PRACTITIONER_ROLE` est réservé à des acteurs agréés (allowlist gérée par l'admin), ce qui bloque le **faux passeport** (mint non autorisé).

---

## 6. Caution & rappel

- **Stake** : le labo dépose une caution (`QualityBond`) conservée par le hub.
- **Rappel** : `declareRecall(lotId, evidenceHash)` par `REGULATOR_ROLE`, avec empreinte de preuve.
- **Slashing** : montant transféré/brûlé selon la politique, événement traçable.
- **Retrait** : la sortie de caution suit **checks‑effects‑interactions** et `nonReentrant` (voir §8).

Garde‑fous : le droit de slasher est cloisonné au régulateur, borné (montant plafonné, preuve requise), et entièrement journalisé pour éviter le **slashing abusif / griefing**.

---

## 7. Stockage & RGPD (renfort C1)

- **IPFS** : documents lourds (certificats matière, scans 3D, fiches techniques) ; seul le **CID/hash** est on‑chain.
- **Off‑chain RGPD** : les données personnelles patient ne sont **jamais** on‑chain ; elles vivent dans un stockage classique effaçable, liées au token par un **hash** (commitment).
- **Alignement CNIL** : l'immuabilité de la chaîne est incompatible avec le droit à l'effacement → on n'inscrit que des empreintes ; effacer la donnée off‑chain rend le hash on‑chain inexploitable. C'est la doctrine à défendre à l'oral.

---

## 8. Sécurité — tableau des attaques connues (C4, livrable exigé)

| Attaque | Vecteur dans l'app | Parade |
|---------|--------------------|--------|
| **Reentrancy** | retrait / slashing de la caution | Checks‑Effects‑Interactions + `ReentrancyGuard` |
| **Access control cassé** | mint / rappel / slashing sans rôle | `AccessControl`, `onlyRole`, tests négatifs systématiques |
| **Faux passeport** | mint par un acteur non agréé | `LAB_ROLE` sur allowlist, octroi par admin multisig |
| **Contournement soulbound** | transfert non autorisé du passeport | override `_update`, revert hors mint / handoff signé |
| **Slashing abusif / griefing** | rappel malveillant pour nuire à un labo | rôle `REGULATOR_ROLE` seul, preuve (`evidenceHash`), montant borné, journal |
| **Oracle physique ↔ numérique** | données fausses à la source (« garbage in ») | attestation **co‑signée** par deux parties au handoff (labo + praticien) |
| **DoS par gas (boucle)** | rappel « notifiant » N passeports | rappel = un flag au niveau **lot** ; statut passeport **dérivé**, aucune boucle on‑chain |
| **Over/underflow** | stocks de lots, montants de caution | Solidity ≥ 0.8 (checked) + tests de bornes |
| **Front‑running** | pas de mint public compétitif → surface quasi nulle | documenté ; mint réservé aux rôles |
| **Fuite PII / RGPD** | données patient inscrites on‑chain | jamais de PII on‑chain, **hash uniquement** |
| **Centralisation admin** | admin tout‑puissant | rôles séparés, `DEFAULT_ADMIN_ROLE` sous multisig/timelock, **pas de proxy upgradeable** |

Une **analyse critique des interactions utilisateur** (exigée par C4) est menée à partir de ce tableau : chaque parcours (mint, conformité, pose, rappel, retrait de caution) est confronté aux vecteurs ci‑dessus.

---

## 9. Optimisation gas (C4)

- **Packing** des structs (`Status` en `uint8`, regroupement des champs) pour réduire les slots.
- **Custom errors** (`revert Soulbound()`) plutôt que chaînes `require`.
- Pas de boucle non bornée (cf. rappel dérivé au niveau lot).
- Événements indexés pour déporter la lecture/agrégation vers l'indexeur, hors chaîne.

---

## 10. Stratégie de tests (C6, > 80 %)

- **Hardhat 3** (runtime EDR, intégration viem native) : tests **unitaires** (`.t.sol` ou TS) + **intégration** (scénarios multi‑acteurs en TypeScript/viem).
- **Fixtures** (`loadFixture`) pour un état de départ reproductible ; **helpers temps** (`time.increase`) pour les transitions et délais.
- **Invariants / fuzzing** avec **Echidna** (ex. : la somme des cautions stakées est toujours ≥ 0 ; un passeport `Posé` n'est jamais transférable ; un lot rappelé le reste).
- **Analyse statique** avec **Slither** dans le pipeline.
- Couverture visée **> 80 %** : la logique étant déterministe et à branches finies, l'objectif est atteignable ; les cas à couvrir sont surtout les **branches de revert** (rôles, soulbound, reentrancy) et les **transitions d'état invalides**.

---

## 11. Intégration continue & versioning (C5)

- **Git** pour l'historisation des versions.
- **GitHub Actions** à chaque push / PR : `lint` (solhint) → `compile` → `test` → `coverage` (seuil bloquant) → `slither`.
- Tags de version pour les déploiements ; artefacts d'ABI publiés pour le front.

---

## 12. Front & déploiement (C7 / C8)

- **Front web de consultation (C7)** : lecture du registre avec **droits différenciés par rôle** (labo, praticien, distributeur, Ordre/ARS). Pensé en **plugin** des logiciels métier existants (Julie, Logos), pas en outil autonome supplémentaire. Communication via viem/wagmi + les events du contrat.
- **Déploiement (C8)** : réseau de test **Sepolia** via Hardhat (scripts `ignition` ou script de déploiement), **vérification Etherscan**, adresses et ABI versionnés. Toutes les interactions prévues (mint, conformité, pose, rappel, caution) sont exécutables sur le réseau déployé.

---

## Annexe — événements clés

```solidity
event PassportMinted(uint256 indexed tokenId, uint256 indexed lotId, address indexed lab);
event ConformityAttested(uint256 indexed tokenId, address practitioner);
event PlacedInMouth(uint256 indexed tokenId);
event RecallDeclared(uint256 indexed lotId, bytes32 evidenceHash);
event BondStaked(address indexed lab, uint256 amount);
event BondSlashed(address indexed lab, uint256 amount, uint256 indexed lotId);
```
