# Catenta — Roadmap et évaluation de faisabilité

Ce document répond à deux questions distinctes :

1. **Que construit-on, dans quel ordre ?** → le découpage v0 / v1 / v2.
2. **Qu'est-ce qui est réellement faisable ?** → le chiffrage, les risques et les coupes (§5 à §8).

---

## 0. Hypothèses de travail

| Hypothèse | Valeur retenue | À confirmer |
|---|---|---|
| Équipe | 1 développeur | — |
| Rythme | 3 jours-homme par semaine | dépend du reste |
| Expérience | stack Hardhat/Vue/ethers déjà pratiquée (projet précédent) | acquis |
| Date de rendu | **inconnue** — le chiffrage est en jours-homme, converti en calendrier au §6 | ⚠️ à fixer en premier |
| Point de départ | **socle v0 + crédit + registrar** — 6 contrats, 14 tests, lint propre (voir [RAPPORT_V0](RAPPORT_V0.md)) | vérifié |

> **Le seul point réellement bloquant est la date de rendu.** Tout le reste du document est robuste à sa valeur ; le §6 donne la conversion pour 4, 6 et 8 semaines.

---

## 1. Principe de découpage

Les trois jalons ne sont **pas** « moitié / trois quarts / tout ». Ils sont séparés par une propriété précise :

| Jalon | Propriété |
|---|---|
| **v0** | **certifiable en l'état.** Si tout s'arrête après v0, les 8 compétences sont couvertes — modestement, mais couvertes. |
| **v1** | **le rendu visé.** L'application fait ce que les slides annoncent : lots, rappel prouvable, caution, front multi-rôles. |
| **v2** | **au-delà.** Ce qui distingue à l'oral, ce qui rend le projet crédible en production. Rien ici n'est nécessaire à la certification. |

Cette logique vient d'un constat sur le référentiel : **C3 est satisfait par un seul jeton, fongible *ou* non fongible.** Le passeport ERC-721 soulbound suffit. L'ERC-1155 et l'ERC-20 sont de l'excellence, pas de la conformité. C'est ce qui rend v0 véritablement sûr.

---

## 2. v0 — Socle certifiable

**Objectif : franchir la ligne de la certification, sur le chemin le plus court et le plus sûr.**

### Périmètre

| Lot | Contenu |
|---|---|
| Fondations | `git init`, Hardhat 3, TypeScript, solhint, `.gitignore`, conventional commits, **`@openzeppelin/contracts` épinglé** |
| Contrats | `CatentaRoles` + `RoleAware` (autorité) · `PassportNFT` et `MaterialLots` (stores permanents) · `LifecycleModule` (machine à états `Manufactured → Certified → Placed`, handoff 2 temps) |
| OpenZeppelin | `AccessControl(Enumerable)`, `ERC721(Enumerable)`, `ERC1155(Supply, Burnable)`, `ERC20` |
| Modèle éco. | **`CatentaCredit`** (ERC-20 `$CATENTA`) : crédit d'usage non transférable, brûlé à chaque action ; abonnement hors chaîne, aucun jeton vendu (SPEC §8.3bis) |
| Tests | scénarios TS sur les 3 axes + 3-4 propriétés fuzz (verrou soulbound, bornes) — **> 80 %** |
| CI | `.github/workflows/ci.yml` : lint → compile → test → coverage (seuil bloquant) |
| Déploiement | module Ignition, Sepolia, vérification Etherscan |
| Front | connexion wallet, détection du rôle, liste des passeports, fiche passeport, actions du cycle de vie — hébergé publiquement |
| Docs | SPEC + CONVENTIONS + README à jour, tableau des attaques v1 |

### Couverture du référentiel à l'issue de v0

| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|
| ✅ | ✅ | ✅ *(ERC-721)* | ✅ | ✅ | ✅ | ✅ | ✅ |

### Definition of Done

- [ ] `npx hardhat test` vert, couverture ≥ 80 % mesurée et affichée
- [ ] CI verte sur `main`, badge dans le README
- [ ] Contrats déployés **et vérifiés** sur Sepolia, adresses dans le README
- [ ] Front en ligne, parcours complet exécutable par un tiers avec un wallet Sepolia
- [ ] Tag `v0.1.0`

### Chiffrage

| Tâche | j·h |
|---|---:|
| Fondations + CI squelette | 1 |
| `CatentaRoles` + `RoleAware` + `PassportNFT` + `MaterialLots` + `LifecycleModule` | 3,5 |
| Tests (TS + fuzz) jusqu'au seuil | 2 |
| Ignition + Sepolia + vérification | 0,5 |
| Front (connexion, rôles, liste, fiche, actions) | 2,5 |
| Docs & mise au propre | 0,5 |
| **Total v0** | **10** |

---

## 3. v1 — Le rendu visé

**Objectif : l'application tient ce que les slides promettent.**

### Périmètre

| Lot | Contenu | Pourquoi c'est là |
|---|---|---|
| `RecallModule` | `declareRecall` O(1), `liftRecall` (D3), statut dérivé composé par `CatentaLens` | le point d'architecture qui distingue le projet — **ne touche aucun contrat existant** |
| **Accusés de réception** | `acknowledgeRecall` + tableau de suivi — OZ `EnumerableSet.AddressSet` | la preuve d'exécution, réponse directe au problème terrain n°1 |
| `CatentaLens` | vue pure composant Lifecycle + Recall pour le front | garde les modules indépendants les uns des autres |
| `BondModule` (ERC-20) | stake, *cooldown*, slashing sur preuve — OZ `IERC20`/`SafeERC20`/`ERC20Permit` + CEI + `ReentrancyGuardTransient` | enjeu économique + surface de sécurité réelle pour C4 |
| **Rôles à l'échelle** | `claimRole(proof)` — OZ `MerkleProof` sur l'annuaire des agréés | 44 000 praticiens ne s'inscrivent pas un par un (SPEC §8.4) |
| **Durcissement admin** | OZ `AccessControlDefaultAdminRules` (transfert 2 temps + délai) | ferme l'attaque n°13 par le code, pas par une promesse |
| Incidents | `reportIncident` | matériovigilance, peu coûteux |
| `Pausable` + `Multicall` | pause du mint et du rappel uniquement ; batch des déclarations de lot | frein d'urgence sans censure ; gas et UX |
| Tests | contrat attaquant réentrant, `time.increase` sur le cooldown, invariants de quantité | ce sont les tests qui *démontrent* C4 |
| CI complète | + slither (+ `slither.config.json` justifié), + build front | C5 |
| Front | vues lots / rappels / caution / admin, 4 panneaux de rôle, i18n FR-EN | C7 |
| Livrables C4 | tableau des attaques final + **rapport de gas avant/après** | l'optimisation se démontre en chiffres |

### Definition of Done

- [ ] Couverture ≥ 90 %
- [ ] Slither propre ou écarts justifiés par écrit
- [ ] Rapport de gas commenté (packing, custom errors, rappel O(1))
- [ ] Les 16 vecteurs du tableau des attaques ont soit un test, soit une justification écrite de leur non-testabilité
- [ ] Chaque module OpenZeppelin importé est justifié en une phrase, et la liste des modules écartés est à jour (SPEC §8.4 / §8.7)
- [ ] Démo Sepolia de bout en bout : lot → passeport → conformité → pose → rappel → accusés → slashing
- [ ] Captures d'écran de chaque parcours dans `web/README.md`
- [ ] Tag `v1.0.0`

### Chiffrage

| Tâche | j·h |
|---|---:|
| `RecallModule` + accusés + `liftRecall` + `CatentaLens` | 2 |
| `BondModule` + cooldown + slashing + `Pausable` + `Multicall` | 1,5 |
| `MerkleProof`/`claimRole` + `AccessControlDefaultAdminRules` (dont résolution des surcharges) | 1,5 |
| Tests jusqu'à 90 % (attaquant réentrant, temps, preuves Merkle, coutures OZ) | 3,5 |
| CI complète (slither, seuil, front) | 1 |
| Front — 4 vues + panneaux de rôle + i18n | 4 |
| Rapport de gas + tableau des attaques + captures | 1,5 |
| **Total v1** | **15** |

---

## 4. v2 — Au-delà de la certification

Rien ici n'est requis. Chaque ligne est **indépendante** : on en prend ce que le temps restant permet, dans l'ordre du meilleur rapport impact/coût.

| # | Sujet | Ce que ça apporte | j·h |
|---|---|---|---:|
| 1 | **IPFS réel** (certificats, scans) | rend concrète la partie « stockage hybride » des slides | 1,5 |
| 2 | **Indexeur d'events** (The Graph ou script + SQLite) | le fan-out de notification annoncé — la « alerte nationale » devient tangible | 2 |
| 3 | **Multisig Safe** sur `DEFAULT_ADMIN_ROLE` | ferme l'attaque n°13 au lieu de la documenter | 0,5 |
| 4 | **Timelock** sur les changements de rôle | idem, niveau supérieur | 1 |
| 5 | **Co-signature EIP-712** au handoff | la vraie parade au problème de l'oracle (attaque n°9) | 1,5 |
| 6 | **Echidna / Medusa** — invariants | fuzzing d'invariant au-delà du fuzzing de propriété | 1,5 |
| 7 | **Meta-transactions ERC-2771** | les cabinets n'ont pas d'ETH — condition réelle d'adoption | 2 |
| 8 | **Déploiement L2** (Base / Arbitrum Sepolia) | le coût par passeport devient réaliste | 1 |
| 9 | **API / plugin** pour Julie & Logos | le narratif « pas un outil de plus » devient démontrable | 3 |
| 10 | **Accessibilité + responsive** du front | qualité perçue | 1 |

### Priorisation recommandée

Si le temps restant après v1 est de :

- **1-2 jours** → #3 (multisig) + #10 (a11y). Coût minimal, effet visible immédiat.
- **3-5 jours** → + #1 (IPFS) + #2 (indexeur). C'est le couple qui rend les slides *vraies*.
- **plus de 5 jours** → + #5 (EIP-712) et #7 (meta-tx), qui sont les deux sujets sur lesquels un jury poussera le plus loin.

---

## 5. Évaluation — ce qui est faisable, et ce qui ne l'est pas

### 5.1 Le verdict

| Jalon | Cumul j·h | Faisable ? |
|---|---:|---|
| **v0** | 10 | ✅ **oui, sans réserve** — périmètre proche du projet précédent, stack maîtrisée |
| **v0 + v1** | **25** | ✅ **oui, avec discipline** — c'est la cible réaliste |
| **+ v2 partiel** | 27-32 | ⚠️ selon le temps de rendu restant |
| **+ v2 complet** | 39 | ❌ **non** sur un projet de certification solo |

**La cible est v0 + v1 ≈ 25 jours-homme**, soit environ **8 semaines à 3 j/semaine**.

**L'usage intensif d'OpenZeppelin joue dans les deux sens, et c'est important de le voir.** Il *réduit* le volume de code à écrire et à tester — `EnumerableSet` supprime l'énumération des accusés à la main, `ERC1155Supply` supprime le compteur de quantité restante, `ERC721Enumerable` supprime un indexeur entier. Mais il *ajoute* des points de couture : les surcharges multiples d'`AccessControl*` et de `_update` (§5.2). Le solde net reste franchement positif — environ **+1,5 j·h** sur v1 pour un code substantiellement plus sûr et un argumentaire C3 solide.

### 5.2 Ce que le dossier de cadrage sous-estime

Trois points où le cadrage actuel est optimiste, et qu'il faut regarder en face :

1. **Quatre contrats, c'est beaucoup pour une couverture > 80 %.** Le projet précédent avait 2 contrats testés et 44 tests pour atteindre 100 %. Ici, viser 90 % sur 4 contrats interconnectés demande de l'ordre de **80 à 100 tests**. C'est le poste de charge n°1, et c'est celui qu'on sous-estime toujours. **Mitigation : écrire les tests au fil de l'eau, jamais en fin de projet.** Un rattrapage de couverture en dernière semaine est le scénario d'échec classique. Corollaire OpenZeppelin : **ne pas rejouer la suite de tests d'`ERC721`** — ce qui gonfle la couverture sans rien démontrer (SPEC §8.6).

   **Le piège précis à connaître d'avance :** `AccessControlEnumerable` et `AccessControlDefaultAdminRules` surchargent toutes deux `_grantRole`, `_revokeRole` et `supportsInterface` ; `ERC721` et `ERC721Enumerable` surchargent toutes deux `_update` et `_increaseBalance`. Les combiner demande des `override(A, B)` explicites et un test dédié à chaque couture. Ce n'est pas difficile, mais découvert en semaine 7 sous pression, ça coûte une journée.

2. **Le front à quatre rôles est plus lourd qu'il n'en a l'air.** Quatre acteurs × cinq écrans, ce n'est pas quatre fois le front du projet précédent — mais ce n'est pas non plus une extension gratuite. **Mitigation : une vue, des panneaux conditionnés par le rôle** (exactement le patron d'`ElectionView.vue`), et non quatre parcours distincts.

3. **La CI n'existe pas encore et n'est pas triviale.** Le projet précédent n'en avait aucune : c'est un chantier neuf, pas une reprise. Les deux pièges concrets sont le **seuil de couverture** (non natif dans Hardhat 3, à scripter) et le **bruit de Slither** sur OpenZeppelin. **Mitigation : monter la CI en v0, sur deux contrats seulement.** La monter en v1 sur quatre contrats, c'est la débugger sous pression.

### 5.3 Ce qui est plus facile qu'il n'y paraît

- **Le rappel dérivé est une idée forte pour un coût dérisoire** : un booléen et un getter. C'est le meilleur rapport impact-oral/effort de tout le projet.
- **Les accusés de réception aussi** : un mapping et un event, et ça répond au problème n°1 du terrain que le processus papier n'a jamais su résoudre.
- **Le soulbound est court** : une surcharge de `_update`. Le risque est conceptuel (le handoff rejouable), pas volumétrique.
- **Une grande partie du front est du copier-adapter** : `lib/`, `stores/wallet.ts`, `components/ui/`, `parseError` viennent du projet précédent quasiment tels quels.
- **Les extensions OpenZeppelin sont des mixins, pas des chantiers.** `ERC1155Supply`, `ERC1155Burnable`, `ERC20Permit`, `Multicall`, `EnumerableSet` s'ajoutent en quelques lignes chacun et suppriment du code qu'il aurait fallu écrire *et* tester. Seuls `MerkleProof`/`claimRole` et la combinaison des extensions d'`AccessControl` demandent un vrai travail de conception.

### 5.4 Ce qu'il ne faut pas tenter

| Tentation | Pourquoi c'est un piège |
|---|---|
| Rendre les contrats upgradeables | contredit la valeur probante du registre, ajoute des proxies à tester, et le jury demandera pourquoi |
| Un vrai chiffrement des données patient on-chain | rien de chiffré on-chain n'est effaçable ; le hash salé est la bonne réponse, pas un demi-chiffrement |
| Une DAO pour la gouvernance des rôles | le régulateur est une autorité désignée par la loi, pas élue par des porteurs de jetons |
| Une notification push on-chain | impossible par construction ; l'event + l'indexeur est **la** réponse |
| Un token de caution auto-émis présenté comme une garantie | économiquement vide, et facilement démonté à l'oral (voir SPEC §8.3) |

---

## 6. Conversion en calendrier

À **3 j·h par semaine**, en partant d'un dépôt vide :

| Temps disponible | Ce qui est atteignable | Commentaire |
|---|---|---|
| **4 semaines** (12 j) | v0 complet + ~25 % de v1 | prioriser `MaterialLots` + rappel + accusés ; **abandonner `BondModule`, `MerkleProof` et l'i18n** |
| **6 semaines** (18 j) | v0 + v1 sans `MerkleProof`, `DefaultAdminRules`, rapport de gas ni i18n | serré mais tenable |
| **8 semaines** (24 j) | **v0 + v1 complets** | ✅ la cible, sans marge |
| **10 semaines** (30 j) | + 6 j de v2 (multisig, a11y, IPFS, indexeur) | excellent rendu |

À 5 j·h/semaine, diviser les durées par ~1,7.

### Séquencement recommandé (8 semaines)

```
S1  ██ fondations · CI squelette · CatentaRoles + stores permanents
S2  ██ PassportNFT soulbound + handoff · tests au fil de l'eau
S3  ██ Ignition + Sepolia vérifié · front v0 · ▶ TAG v0.1.0
S4  ██ MaterialLots + burn au mint · tests
S5  ██ Rappel dérivé + accusés + liftRecall · tests
S6  ██ BondModule + cooldown + slashing · attaquant réentrant · Pausable
       MerkleProof/claimRole · AccessControlDefaultAdminRules (coutures)
S7  ██ Front v1 (4 vues, panneaux de rôle) · CI complète (slither, seuil)
S8  ██ Couverture 90 % · gas report · tableau des attaques · captures · ▶ TAG v1.0.0
```

**Le tag `v0.1.0` en fin de S3 est le jalon le plus important du planning.** À partir de là, quoi qu'il arrive, il existe un rendu certifiable déployé et en ligne. Tout ce qui suit est de l'amélioration à risque nul.

---

## 7. Risques

| Risque | P | Impact | Mitigation |
|---|---|---|---|
| Couverture sous 80 % en fin de parcours | moyenne | **bloquant C6** | tests au fil de l'eau ; mesure de la couverture dès S1, à chaque PR |
| CI qui résiste (seuil, Slither) | élevée | perte de 1-2 j | la monter en S1 sur 2 contrats, pas en S7 sur 4 |
| Dérive du front | élevée | 2-4 j | une vue + panneaux par rôle ; les 4 vues de v1 seulement après le tag v0 |
| Bug de conception sur le handoff | moyenne | reprise du soulbound | tranché en amont (SPEC §6.2), à couvrir par un fuzz dès l'écriture |
| Instabilité Sepolia / RPC / faucet | moyenne | démo indisponible | déployer tôt (S3), garder les adresses, prévoir un RPC de secours |
| Décisions D1-D6 non tranchées | **certaine si on ne les traite pas** | refonte du modèle | **les trancher avant le premier contrat** (SPEC §14) |
| Sur-ambition (v2 attaqué avant la fin de v1) | moyenne | v1 inachevé | règle : aucun ticket v2 avant le tag `v1.0.0` |

---

## 8. Les trois prochaines actions

1. **Fixer la date de rendu**, et choisir la ligne correspondante du §6. Tout le reste en découle.
2. **Trancher les décisions D1 à D6** de [SPEC §14](SPEC.md#14-décisions-encore-ouvertes) — 1 h de réflexion qui évite une refonte à mi-parcours.
3. **La CI** — c'est le seul livrable C5, et la monter sur 5 contrats est plus simple que sur 9.

---

## Annexe — Récapitulatif du chiffrage

| Jalon | j·h | Cumul | Statut |
|---|---:|---:|---|
| v0 — socle certifiable | 10 | 10 | 🟡 **en cours** — contrats faits, CI/déploiement/front non |
| v1 — rendu visé | 15 | 25 | 🎯 cible |
| v2 — au-delà (complet) | 15 | 40 | ⭕ optionnel, à la carte |
</content>
