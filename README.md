# Catenta — Passeport Dentaire On-Chain

Traçabilité des **dispositifs médicaux sur mesure** (couronnes, bridges, implants) et de leurs **lots de matériaux**, sur un registre partagé entre acteurs concurrents : laboratoires, praticiens, distributeurs, Ordre et ARS.

> **État du projet — socle v0 + crédit d'usage, déployé sur Sepolia.** Six contrats compilent, 14 tests passent, le linter est propre ; la pile tourne sur Sepolia et le front est fonctionnel. Restent à faire : rappel de lot, caution qualité, CI, vérification Etherscan. L'état vérifié et ses limites sont dans le [rapport d'implémentation](docs/RAPPORT_V0.md).

---

## Le problème

Le passeport prothèse est aujourd'hui **un papier** : perdable, falsifiable, non interopérable entre le labo et le cabinet. Trois conséquences concrètes :

- **Le rappel de lot défectueux se gère par téléphone**, sans preuve d'exécution ni délai garanti — un lot défaillant peut mettre des mois à être détecté et des semaines à être notifié.
- **Le praticien porte la responsabilité** en cas de contrôle ARS/Ordre, sans documentation opposable sur la provenance et la conformité.
- **Le cadre réglementaire UDI exclut explicitement les dispositifs sur mesure** — un vide que personne ne comble.

## Pourquoi la blockchain (et pas une base de données)

Les laboratoires sont **en concurrence directe** : aucun n'acceptera de dépendre du serveur d'un autre, ni d'un tiers privé qui pourrait réécrire l'historique après un incident. Le registre partagé apporte trois propriétés qu'une base centralisée ne peut pas fournir seule :

| Propriété | Ce qu'elle règle |
|---|---|
| **Neutralité inter-acteurs** | aucun concurrent n'héberge la vérité des autres |
| **Immuabilité** | l'historique d'un dispositif ne peut pas être modifié *après* le litige — c'est ce qui protège le praticien |
| **Vérifiabilité par un tiers** | l'Ordre et l'ARS lisent l'état réel sans demander l'accès à qui que ce soit |

L'apport est donc **la confiance entre parties non coopératives**, pas la performance ni le coût.

## Ce que fait l'application

- **Un passeport par prothèse** — un ERC-721 *soulbound* : un token = un dispositif, du labo jusqu'à la pose en bouche.
- **Des lots de matériaux tracés** — ERC-1155, brûlés à la fabrication : le lien matière → prothèse est établi au mint et ne peut plus être réécrit.
- **Un rappel de lot instantané et prouvable** — le régulateur marque *le lot* (une seule écriture) ; le statut « rappelé » de chaque passeport en est **dérivé**, et distributeurs et cabinets **accusent réception on-chain** : la preuve d'exécution qui manque aujourd'hui.
- **Une caution qualité** — ERC-20 stakée par le laboratoire, *slashable* par le régulateur sur preuve, avec délai de retrait : le registre passe de passif à « à enjeux ».
- **Un crédit d'usage `$CATENTA`** — ERC-20 non transférable et non coté : l'abonnement (hors chaîne) émet des crédits, chaque action en brûle un. Le modèle économique, sans jamais vendre de jeton ([SPEC §8.3bis](docs/SPEC.md)).

## Architecture

```
   Acteurs (RBAC)                              Stockage off-chain
labo · praticien · distributeur · Ordre/ARS   IPFS (docs) · PII hors chaîne (RGPD)
                    │                                    │ hash / CID uniquement
                    v                                    v
        ┌───────────────────────────┐
        │       CatentaRoles        │   AUTORITÉ — rôles acteurs + rôles modules
        └─────────────┬─────────────┘   « ai-je ce rôle ? »
      ┌───────────────┼───────────────┬──────────────────┐
      v               v               v                  v
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  ┌──────────────┐
│ PassportNFT │ │MaterialLots │ │CatentaCredit│ │  Lifecycle   │  │ Recall·Bond  │
│ ERC-721     │ │ ERC-1155    │ │ ERC-20      │ │  Module      │  │   (v1)       │
│ soulbound   │ │ burn        │ │ crédit usage│ │  + facture   │  │              │
├─────────────┤ ├─────────────┤ ├─────────────┤ ├──────────────┤  ├──────────────┤
│  PERMANENT  │ │  PERMANENT  │ │  PERMANENT  │ │ REMPLAÇABLE  │  │   ADDITIF    │
└─────────────┘ └─────────────┘ └─────────────┘ └──────────────┘  └──────────────┘
```

**Ce qui doit survivre vit dans un stockage permanent ; ce qui évoluera vit dans un module qu'on peut remplacer.** Les jetons ne portent que l'immuable (lot d'origine, empreinte du dossier de conformité, figés au mint) ; les statuts vivent dans le module. **Aucun contrat ne connaît l'adresse d'un pair** : chacun demande un rôle à `CatentaRoles`. Conséquence directe — ajouter le rappel ou la caution ne touche aucun contrat existant : on déploie, on accorde un rôle. **Plusieurs administrateurs sans multiplier la racine** : l'agrément des acteurs est délégué à un `REGISTRAR_ROLE` (donnable à X opérateurs), la racine `DEFAULT_ADMIN` restant unique pour les rôles sensibles ([SPEC §2](docs/SPEC.md)).

**Tout ce qui peut venir d'OpenZeppelin en vient.** Le code écrit à la main se limite à la logique métier dentaire — machine à états, handoff, rappel dérivé, comptabilité de la caution et du crédit d'usage. Le reste (standards de jetons, rôles, réentrance, pause, signatures, ensembles, preuves de Merkle) provient de contrats audités. Conséquence directe : **10 des 17 parades du tableau des attaques sont fournies par la librairie**, et la surface de code non auditée se réduit à ce qui est propre au métier — là où se concentre l'effort de test.

→ Détail complet : **[docs/SPEC.md](docs/SPEC.md)**

## Stack

| Couche | Choix |
|---|---|
| Modèle éco. | crédit d'usage **`$CATENTA`** (ERC-20, non transférable, brûlé à l'action) — abonnement hors chaîne, aucun jeton vendu |
| Contrats | Solidity `0.8.34` (pragma figé) · **OpenZeppelin v5, massivement** — ~25 modules audités (jetons, `AccessControl*`, `ReentrancyGuardTransient`, `Pausable`, `EIP712`, `EnumerableSet`, `MerkleProof`, `Multicall`…), inventoriés et justifiés un par un en [SPEC §8.4](docs/SPEC.md) |
| Outillage | Hardhat 3 · Ignition (déploiement) · keystore chiffré (secrets) |
| Tests | double runner : **Solidity/forge-std** (propriétés, *fuzzing*) + **TypeScript/mocha + ethers v6** (scénarios) |
| Qualité | solhint · slither · couverture native Hardhat 3 (seuil bloquant) |
| CI/CD | GitHub Actions — lint → compile → test → coverage → slither → build front |
| Front | Vue 3 + Vite + TypeScript · Reown AppKit · ethers v6 · Pinia · vue-i18n · Tailwind |
| Réseau | Sepolia, contrats vérifiés sur Etherscan |

Ces choix reprennent **délibérément** la stack éprouvée du projet précédent (`alyra-blockchain-projet-1`) : le temps disponible doit aller dans la logique métier, pas dans la découverte d'outils. Les conventions correspondantes sont figées dans **[docs/CONVENTIONS.md](docs/CONVENTIONS.md)**.

## OpenZeppelin — capitaliser sur l'audité (C3)

**Principe : tout ce qu'OpenZeppelin fournit est pris chez OpenZeppelin.** Le code écrit à la main se limite à la **logique métier dentaire** ; standards de jetons, contrôle d'accès, réentrance, pause, signatures, ensembles, preuves de Merkle viennent de contrats audités et attendus par le référentiel. Corollaire assumé : **aucun module n'est importé pour faire nombre** — chaque ligne dit ce qu'il remplace, et les modules écartés sont documentés avec leur raison ([SPEC §8.7](docs/SPEC.md)).

### Ce qui est déjà en place (v0)

| Notre contrat | Modules OpenZeppelin | Ce qu'ils rendent effectif, et pourquoi |
|---|---|---|
| `CatentaRoles` | `AccessControlEnumerable` | les rôles (RBAC) **et** l'énumération des titulaires (`getRoleMember`) — la vue `/admin` liste les agréés **sans indexeur**. `_setRoleAdmin` délègue l'agrément au `REGISTRAR_ROLE` |
| `PassportNFT` | `ERC721` · `ERC721Enumerable` | le passeport ; `tokenOfOwnerByIndex` liste les passeports d'un cabinet **sans indexeur** ; `_update` surchargé = **soulbound** (tous les chemins de transfert y passent) |
| `MaterialLots` | `ERC1155` · `ERC1155Supply` · `ERC1155Burnable` | un lot = une quantité semi-fongible ; `totalSupply(lotId)` **est** la quantité restante, gratuitement ; burn de la matière au mint |
| `CatentaCredit` | `ERC20` | le crédit d'usage `$CATENTA` ; `_update` surchargé = **non transférable** (pas de marché, pas de cours) ; `decimals()=0` |
| tous | `IERC165`, hooks internes | `supportsInterface`, `_update`, `_increaseBalance` surchargés proprement — les **coutures** que l'on teste une par une |

### Ce qui est planifié (v1 / v2)

| Besoin | Module OpenZeppelin | Jalon |
|---|---|---|
| Réentrance sur la caution | `ReentrancyGuardTransient` (EIP-1153, ~18 k gas de moins) | v1 |
| Frein d'urgence (mint + rappel) | `Pausable` | v1 |
| Accusés de réception « X/Y acteurs » | `EnumerableSet.AddressSet` | v1 |
| Dépôt de caution en 1 transaction | `ERC20Permit` (EIP-2612) | v1 |
| Batch (10 lots en 1 tx) | `Multicall` | v1 |
| Caution en stablecoin externe | `IERC20` · `SafeERC20` | v1 |
| Durcissement admin (transfert 2 temps + délai) | `AccessControlDefaultAdminRules` · `TimelockController` | v1 / v2 |
| Admission déléguée à l'échelle (44 000 praticiens) | `EIP712` · `SignatureChecker` · `Nonces` — ou `MerkleProof` | v2 |
| Meta-transactions (cabinets sans ETH) | `ERC2771Context` | v2 |

### La conséquence, en une ligne

**Dix des dix-sept parades du [tableau des attaques](docs/SPEC.md) sont fournies par la librairie.** La surface de code non auditée se réduit à ce qui est propre au métier — et c'est là que se concentre l'effort de test. Version **épinglée** (pas de caret), **imports nommés**, et on **ne rejoue pas** la suite de tests d'OpenZeppelin (cela gonflerait la couverture sans rien démontrer). Inventaire complet, module par module, et modules écartés : **[SPEC §8.4 / §8.7](docs/SPEC.md)**.

## Arborescence cible

```
catenta/
├── contracts/
│   ├── access/           CatentaRoles · RoleAware
│   ├── tokens/           PassportNFT (721) · MaterialLots (1155) · CatentaCredit (20)
│   └── modules/          LifecycleModule · (Recall · Bond en v1)
├── test/                 *.ts (scénarios) · *.t.sol (propriétés / fuzz)
├── ignition/modules/     modules de déploiement
├── .github/workflows/    ci.yml
├── docs/                 SPEC · CONVENTIONS · ROADMAP · sources de cadrage
└── web/                  dApp Vue 3 (front de consultation multi-rôles)
```

## Démarrage

```bash
npm install
npx hardhat compile
npx hardhat test                  # les deux runners
npx hardhat test --coverage       # rapport console + coverage/html
```

## Déploiement sur Sepolia (C8)

Hardhat 3 + Ignition, avec les secrets dans le **keystore chiffré** (jamais dans un `.env`, jamais dans l'historique shell). Le réseau `sepolia` est déjà câblé dans [`hardhat.config.ts`](hardhat.config.ts) : il lit `SEPOLIA_RPC_URL` et `SEPOLIA_PRIVATE_KEY` du keystore via `configVariable(...)`.

### Prérequis

| Élément | Où l'obtenir |
|---|---|
| **Un compte de déploiement** | un compte MetaMask **dédié au dev** (jamais un compte à valeur réelle) |
| **Du Sepolia ETH** dessus | un faucet — le déploiement enchaîne ~11 transactions (5 contrats + 6 attributions de rôles) |
| **Une URL RPC Sepolia** | Reown (voir plus bas), ou Alchemy / Infura (gratuit) |

### 1. Renseigner le keystore (interactif, une seule fois)

```bash
npx hardhat keystore set SEPOLIA_RPC_URL       # colle l'URL RPC à l'invite
npx hardhat keystore set SEPOLIA_PRIVATE_KEY   # colle la clé privée (préfixe 0x), à l'invite
```

Chaque commande demande la **valeur** puis un **mot de passe de keystore**. La valeur ne transite ni par la ligne de commande, ni par l'historique shell.

> **Clé privée, pas phrase de récupération.** Dans MetaMask : compte de dev → ⋮ → *Détails du compte* → *Afficher la clé privée* → une chaîne hex de 64 caractères (**pas** les 12/24 mots — ceux-là ne vont JAMAIS dans un outil). Ajouter `0x` devant.

**URL RPC via Reown** (réutilise le Project ID du front — voir [`web/.env.example`](web/.env.example)) :

```
https://rpc.walletconnect.org/v1?chainId=eip155:11155111&projectId=<REOWN_PROJECT_ID>
```

Endpoint pratique parce qu'un seul identifiant sert au front et au déploiement ; s'il renvoie des `429`/timeouts pendant les 8 transactions, basculer sur un Alchemy/Infura et **relancer la même commande** (Ignition reprend où il s'est arrêté, il ne redéploie rien de déjà passé).

### 2. Déployer

```bash
npx hardhat ignition deploy ignition/modules/Catenta.ts --network sepolia
```

Le module [`Catenta.ts`](ignition/modules/Catenta.ts) déploie les 5 contrats **et** accorde au `LifecycleModule` ses 5 rôles techniques (dont `CREDIT_SPENDER`) plus le `CREDIT_MINTER_ROLE` à l'admin, dans la foulée — sans quoi les stockages refusent toute écriture. Le **compte déployeur devient l'administrateur** (`DEFAULT_ADMIN_ROLE`).

> Confier l'admin à une autre adresse (multisig) dès l'origine :
> `--parameters '{"CatentaModule":{"admin":"0x…"}}'`

### 3. Brancher le front

Ignition affiche 4 adresses. **Une seule est nécessaire** : celle du `LifecycleModule` — il expose `ROLES`, `PASSPORTS` et `LOTS`, que le front dérive au démarrage. La reporter dans `web/.env` :

```bash
VITE_LIFECYCLE_ADDRESS=0x…      # l'adresse LifecycleModule
```

### 4. Amorcer les rôles acteurs

À froid, seuls les rôles **techniques** sont attribués. Pour dérouler le parcours, l'admin s'accorde `LAB_ROLE` / `PRACTITIONER_ROLE` depuis la vue **Administration** du front. Tant que c'est vide, l'app se connecte mais reste en lecture seule — comportement normal, pas un bug.

> Vérification d'Etherscan (`hardhat verify`) : à ajouter, non couvert par cette version.

## Couverture du référentiel

| Comp. | Intitulé | Où c'est traité |
|---|---|---|
| **C1** | Cahier des charges, apport blockchain | [SPEC §1–3](docs/SPEC.md) — besoin, objectifs, schéma fonctionnel, arborescence |
| **C2** | Développer le smart contract | [SPEC §4–7](docs/SPEC.md) — architecture à trois couches + machine à états |
| **C3** | Exploiter un jeton (fongible / non) | [SPEC §8](docs/SPEC.md) — ERC-721 soulbound, ERC-1155, ERC-20, via OpenZeppelin |
| **C4** | Sécurité & optimisations | [SPEC §10](docs/SPEC.md) (tableau des attaques) · [§11](docs/SPEC.md) (gas) |
| **C5** | Versions & intégration continue | [CONVENTIONS §5–6](docs/CONVENTIONS.md) — Git + GitHub Actions |
| **C6** | Tests fonctionnels (> 80 %) | [CONVENTIONS §3](docs/CONVENTIONS.md) — double runner, fixtures, seuil bloquant |
| **C7** | Front web ↔ smart contract | [SPEC §3](docs/SPEC.md) + [CONVENTIONS §4](docs/CONVENTIONS.md) |
| **C8** | Déploiement sur blockchain | [ROADMAP v0/v1](docs/ROADMAP.md) — Sepolia + vérification Etherscan |

## Documentation

| Document | Contenu |
|---|---|
| **[docs/SPEC.md](docs/SPEC.md)** | Spécification fonctionnelle et technique — acteurs, cycle de vie, contrats, tableau des attaques, arbitrages ouverts |
| **[docs/CONVENTIONS.md](docs/CONVENTIONS.md)** | Conventions de code — Solidity, tests, front, CI/CD, Git |
| **[docs/ROADMAP.md](docs/ROADMAP.md)** | Découpage v0 / v1 / v2, chiffrage, risques, **évaluation de ce qui est réellement faisable** |
| **[docs/TODO.md](docs/TODO.md)** | Checklist actionnable — **le rappel de lot en tête**, puis caution, CI, tests, durcissement |
| **[docs/ETUDE_GALEON.md](docs/ETUDE_GALEON.md)** | Étude du comparable français (blockchain santé) : modèle de jeton, modèle économique, ce qu'on en reprend et ce qu'on en écarte — **et comment répondre au jury** |
| **[docs/RAPPORT_V0.md](docs/RAPPORT_V0.md)** | Rapport d'implémentation du socle v0 — état vérifié, choix, avantages et limites, écrit pour être défendu |
| **[web/README.md](web/README.md)** | La dApp — configuration `.env`, lancement, architecture, lecture on-chain sans indexeur |
| [docs/Passeport_Dentaire_dossier_technique.md](docs/Passeport_Dentaire_dossier_technique.md) | Dossier technique de cadrage (source) |
| [docs/slides dentaire.pdf](docs/) · [docs/Slides_tech_Passeport_Dentaire.pdf](docs/) | Supports de soutenance (cadrage métier / architecture) |
</content>
</invoke>
