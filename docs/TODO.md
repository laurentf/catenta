# Catenta — TODO

Liste actionnable de ce qui reste. Le découpage v0/v1/v2 raisonné et chiffré est dans [ROADMAP.md](ROADMAP.md) ; ce fichier est la checklist courte.

**État au dernier commit** — socle v0 + crédit d'usage + agrément délégué : 6 contrats, 14 tests, lint propre, **déployé sur Sepolia**, front fonctionnel (passeports, lots, crédits, admin en onglets, toasts, page architecture).

---

## 🔴 Prioritaire — le rappel de lot (`RecallModule`)

**C'est le point d'architecture le plus distinctif du projet, et il manque.** Il ne touche aucun contrat existant : on déploie, on lui accorde un rôle.

- [ ] **`RecallModule`** — `declareRecall(lotId, evidenceHash)` : **une seule écriture** sur le lot, coût O(1) quel que soit le nombre de passeports (aucune boucle → aucun DoS gas).
- [ ] **Statut « rappelé » dérivé** — jamais stocké sur le passeport ; calculé à la lecture (`isRecalled(lotId)`).
- [ ] **`liftRecall(lotId, evidenceHash)`** — un faux positif ne condamne pas un lot à vie (décision D3).
- [ ] **Accusés de réception** — `acknowledgeRecall(lotId)` pour `PRACTITIONER_ROLE` / `DISTRIBUTOR_ROLE`, via `EnumerableSet.AddressSet` : le tableau « X/Y acteurs prévenus », la **preuve d'exécution** qui manque au processus papier.
- [ ] **`CatentaLens`** — vue pure qui compose Lifecycle + Recall (`statusOf` recall-aware) sans coupler les modules.
- [ ] **Front** — vue `/recalls` (déclaration régulateur, accusés praticien/distributeur, suivi), badge « rappelé » dérivé sur la fiche passeport.
- [ ] **Tests** — coût constant de `declareRecall`, statut dérivé, double accusé, `liftRecall`.

Réf : [SPEC §6.3–6.4](SPEC.md), [ROADMAP v1](ROADMAP.md).

---

## 🟠 v1 — le reste du rendu attendu

### Caution qualité (`BondModule`)
- [ ] `stakeBond` / `requestBondWithdrawal` / `withdrawBond` avec **délai de retrait** (sinon slashing contournable).
- [ ] `slash(lab, amount, lotId)` — plafonné, preuve requise, journalisé.
- [ ] **`IERC20` externe injecté** (stablecoin / `MockEUR` sur testnet) — jamais un jeton maison (SPEC §8.3).
- [ ] `ReentrancyGuardTransient` + CEI ; `ERC20Permit` pour le dépôt en 1 tx.
- [ ] Contrat attaquant réentrant en test ; `time.increase` autour du cooldown.

### Qualité & livrables C4/C6
- [ ] **CI GitHub Actions** — `lint → compile → test → coverage (seuil bloquant) → slither → build front`. *Seul livrable C5, à monter maintenant sur 6 contrats plutôt que plus tard sur 9.*
- [ ] **Tests de propriétés Solidity** (`forge-std`, fuzzing) — verrou soulbound, invariants de quantité, comptabilité crédit.
- [ ] **Couverture réelle > 90 %** — trois axes par fonction (nominal / rôle / état) ; aujourd'hui ~95 % de *lignes* mais chemins d'erreur peu couverts (RAPPORT_V0 §8).
- [ ] **Rapport de gas** (`hardhat-gas-reporter`) — chiffrer le packing, les custom errors, le rappel O(1).
- [ ] **Vérification Etherscan** (`hardhat verify`) automatisée.
- [ ] `slither.config.json` justifié (sinon rouge permanent sur OZ).

### Durcissement
- [ ] **Multisig (Safe)** sur `DEFAULT_ADMIN_ROLE` dès Sepolia si possible.
- [ ] `AccessControlDefaultAdminRules` (transfert admin 2 temps + délai) — ferme l'attaque n°13 par le code.
- [ ] `Pausable` limité au mint et au rappel (jamais lectures ni accusés).

---

## 🟡 v2 — au-delà de la certification

- [ ] **Admission déléguée à l'échelle** (44 000 praticiens) — **EIP-712** (`SignatureChecker` + `Nonces`) de préférence à `MerkleProof` pour un annuaire vivant (SPEC §9.4). *Inutile avant l'échelle nationale ; RBAC + `REGISTRAR_ROLE` suffit pour la certification.*
- [ ] **Annuaire off-chain** (adresse → nom/RPPS/SIRET) résolu par le front pour afficher des noms au lieu d'adresses (jamais de RPPS on-chain).
- [ ] **IPFS réel** — ancrer certificats matière et scans (aujourd'hui seul le hash est calculé côté navigateur).
- [ ] **Indexeur d'events** (The Graph ou script) — le fan-out de notification « alerte nationale ».
- [ ] **Meta-transactions ERC-2771** — les cabinets n'ont pas d'ETH ; condition d'adoption réelle.
- [ ] **Co-signature EIP-712 au handoff** — parade au problème de l'oracle (attaque n°9).
- [ ] **`TimelockController`** sur les changements de rôle sensibles.
- [ ] **Récompenses crédits** (`rewardCredits` + event dédié) — mint bonus, jamais recyclage (décision D8).
- [ ] Déploiement L2 (Base / Arbitrum) pour un coût par passeport réaliste.

---

## 🔧 Dette technique / soin

- [ ] Le **crédit d'usage** rend l'ordre de démo sensible : sans crédits, aucune action. Envisager un `claimInitialCredits()` self-service (aujourd'hui l'admin doit créditer chaque acteur).
- [ ] **Aligner le PDF technique** (`Catenta_Implementation_v0.pdf`) et le PDF revue si le modèle évolue encore.
- [ ] **`npm audit`** — vulnérabilités transitives (dev deps) à regarder avant une mise en ligne publique.
- [ ] Front : découpage de bundle (le chunk AppKit dépasse 500 kB) — cosmétique.
