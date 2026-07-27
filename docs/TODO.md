# Catenta — TODO

Liste actionnable de ce qui reste. Le découpage v0/v1/v2 raisonné et chiffré est dans [ROADMAP.md](ROADMAP.md) ; ce fichier est la checklist courte.

**État au dernier commit** — la chaîne du [parcours fonctionnel](Catenta%20Parcours%20Prothese%20Tracabilite.pdf) est implémentée de bout en bout : **7 contrats, 28 tests**, front aligné.

- **Fabricant** (`MANUFACTURER_ROLE`) — seul à pouvoir faire naître un lot ; un laboratoire reçoit la matière, il ne la déclare plus.
- **Catalogue matière on-chain** (`MaterialCatalog`) — nom commercial et **unité**, déclarés par le fabricant. Le lot n'en porte qu'un `uint32`, logé dans un slot qu'il payait déjà.
- **Chaîne de garde** — expédition en deux temps, acceptée par le destinataire ; transfert direct refusé par le store. Le distributeur est un maillon complet, y compris la vente directe au cabinet (cas 2b du doc).
- **Acte clinique en storage** — dent (FDI / ISO 3950), date, praticien : lisibles en un appel, plus aucun scan de logs (`VITE_DEPLOY_BLOCK` a disparu).
- **QR code par prothèse**, **vocabulaire** aligné sur le doc, **crédits** simplifiés (un seul chemin d'émission).

> ⚠️ **Le déploiement Sepolia est périmé** — l'ABI a changé partout. Redéployer, reporter `VITE_LIFECYCLE_ADDRESS`, et ré-agréer les acteurs dont **au moins un fabricant**.

---

## 🔴 Prioritaire — le rappel de lot (`RecallModule`)

**C'est le point d'architecture le plus distinctif du projet, et il manque.** Il ne touche aucun contrat existant : on déploie, on lui accorde un rôle. Le scénario 1 du doc fonctionnel repose entièrement dessus.

- [ ] **`RecallModule`** — `declareRecall(lotId, evidenceHash)` : **une seule écriture** sur le lot, coût O(1) quel que soit le nombre de prothèses (aucune boucle → aucun DoS gas).
- [ ] **Statut « rappelé » dérivé** — jamais stocké sur le passeport ; calculé à la lecture (`isRecalled(lotId)`). La chaîne de garde le rend maintenant traçable jusqu'au détenteur courant de la matière non consommée.
- [ ] **`liftRecall(lotId, evidenceHash)`** — un faux positif ne condamne pas un lot à vie (décision D3).
- [ ] **Accusés de réception** — `acknowledgeRecall(lotId)` pour `PRACTITIONER_ROLE` / `DISTRIBUTOR_ROLE` / `LAB_ROLE`, via `EnumerableSet.AddressSet` : le tableau « X/Y acteurs prévenus », la **preuve d'exécution** qui manque au processus papier.
- [ ] **`CatentaLens`** — vue pure qui compose Lifecycle + Recall (`statusOf` recall-aware) sans coupler les modules.
- [ ] **Front** — vue `/recalls`, badge « rappelé » dérivé sur la fiche prothèse et sur le QR patient.
- [ ] **Tests** — coût constant de `declareRecall`, statut dérivé, double accusé, `liftRecall`.

Réf : [SPEC §6.3–6.4](SPEC.md), scénario 1 du doc fonctionnel.

---

## 🟠 Le reste du parcours fonctionnel

### Étape 0 — la commande du praticien
Le doc part du dentiste qui scanne la dent et transmet l'empreinte au laboratoire. Aujourd'hui le labo crée une prothèse sans commande ni empreinte.

- [ ] À cadrer : une **commande** adressée à un laboratoire, portant l'empreinte du scan 3D (`bytes32`), que le mint consomme ?
- [ ] **Jamais le scan lui-même on-chain** — c'est de la donnée biométrique (SPEC §9.2). Empreinte uniquement.

### Scénario 2 — le lot en bouche peut changer
La prothèse casse ou est refaite. Le doc veut que l'historique conserve les deux, et que le passeport « suive la bouche ».

- [ ] Statut **`Removed`** + **lien successeur** entre l'ancienne prothèse et la nouvelle.
- [ ] « Ce qui est en bouche aujourd'hui » **composé à la lecture** à partir du commitment patient — jamais stocké en double, même doctrine que le statut rappelé.

### Nommage des acteurs
- [ ] **À concevoir.** Le registre affiche des adresses nues. Un annuaire hors chaîne (SPEC §9.4 niveau 1) a été prototypé puis retiré : il n'était relié à rien, et l'agrément on-chain ne le peuplait pas. Reprendre le sujet proprement — l'écueil est de lier l'acte d'agrément et l'entrée d'annuaire sans backend.

---

## 🟠 v1 — le reste du rendu attendu

### Caution qualité (`BondModule`)
- [ ] `stakeBond` / `requestBondWithdrawal` / `withdrawBond` avec **délai de retrait** (sinon slashing contournable).
- [ ] `slash(lab, amount, lotId)` — plafonné, preuve requise, journalisé.
- [ ] **`IERC20` externe injecté** (stablecoin / `MockEUR` sur testnet) — jamais un jeton maison (SPEC §8.3).
- [ ] `ReentrancyGuardTransient` + CEI ; `ERC20Permit` pour le dépôt en 1 tx.
- [ ] Contrat attaquant réentrant en test ; `time.increase` autour du cooldown.

### Qualité & livrables C4/C6
- [ ] **CI GitHub Actions** — `lint → compile → test → coverage (seuil bloquant) → slither → build front`. *Seul livrable C5, à monter maintenant sur 7 contrats plutôt que plus tard sur 9.*
- [ ] **Tests de propriétés Solidity** (`forge-std`, fuzzing) — verrou soulbound, invariants de quantité le long de la chaîne de garde, comptabilité crédit.
- [ ] **Couverture réelle > 90 %** — trois axes par fonction (nominal / rôle / état).
- [ ] **Rapport de gas** (`hardhat-gas-reporter`) — chiffrer le packing (dont `materialId` et `Placement`, logés sans slot supplémentaire), les custom errors, le rappel O(1).
- [ ] **Vérification Etherscan** (`hardhat verify`) automatisée.
- [ ] `slither.config.json` justifié (sinon rouge permanent sur OZ).

### Durcissement
- [ ] **Multisig (Safe)** sur `DEFAULT_ADMIN_ROLE` dès Sepolia si possible.
- [ ] `AccessControlDefaultAdminRules` (transfert admin 2 temps + délai) — ferme l'attaque n°13 par le code.
- [ ] `Pausable` limité au mint et au rappel (jamais lectures ni accusés).

---

## 🟡 v2 — au-delà de la certification

- [ ] **Admission déléguée à l'échelle** (44 000 praticiens) — **EIP-712** (`SignatureChecker` + `Nonces`) de préférence à `MerkleProof` pour un annuaire vivant (SPEC §9.4).
- [ ] **IPFS réel** (preuve / audit) — certificats matière, dossiers de conformité, preuves de rappel ancrés par CID. Un CIDv1 sha2-256 tient dans les `bytes32` **déjà présents**. **Pas de scan patient** (RGPD).
- [ ] **Indexeur d'events** (The Graph ou script) — le fan-out de notification « alerte nationale ».
- [ ] **Meta-transactions ERC-2771** — les cabinets n'ont pas d'ETH ; condition d'adoption réelle.
- [ ] **Co-signature EIP-712 au handoff** — parade au problème de l'oracle (attaque n°9).
- [ ] **`TimelockController`** sur les changements de rôle sensibles.
- [ ] **Récompenses crédits** (`rewardCredits` + event dédié) — mint bonus, jamais recyclage (décision D8).
- [ ] Déploiement L2 (Base / Arbitrum) pour un coût par prothèse réaliste.

---

## 💡 Évolutions notées (à cadrer)

### Retours de matière et de prothèses (flux inverse)
La chaîne de garde rend le flux inverse presque gratuit — `declareShipment` fonctionne déjà dans les deux sens, le destinataire acceptant toujours.

- [ ] À cadrer : un **motif** sur l'expédition (retour SAV, lot rappelé renvoyé au fabricant, quarantaine) ?
- [ ] **Distinct du rappel** : rappel = sécurité, piloté par le régulateur ; retour = qualité / logistique, piloté par les acteurs.

### Documents IPFS (preuve / audit)
Attacher des **documents content-addressés** là où une pièce justificative a de la valeur — le **CID est à la fois le pointeur et la preuve d'intégrité**, et il tient dans les `bytes32` déjà présents (`certHash`, `conformityHash`, `evidenceHash`). Quasi rien à changer côté contrat.

- [ ] **Où** : certificat matière (lot), dossier de conformité (prothèse), preuve de rappel, fiche technique ; option `tokenURI` JSON (interop NFT).
- [ ] **Jamais de donnée patient** sur IPFS (public + permanent). Scan 3D de la bouche = biométrique → **exclu**.
- [ ] **Persistance = épinglage** — décider qui *pin*. Sans épinglage le fichier peut disparaître ; le hash on-chain survit et l'intégrité reste prouvable, mais on perd la pièce.
- [ ] **Impl** : faire évoluer `HashInput` (calcule déjà un keccak256 en navigateur) pour **calculer le CID + épingler** ; bouton « Voir le document » avec vérification d'intégrité ; correction = **nouveau CID**, jamais d'écrasement.

---

## 🔧 Dette technique / soin

- [ ] **Aligner SPEC.md** — elle décrit encore un laboratoire qui déclare les lots, des lots non transférables, ni fabricant ni catalogue, et une allocation initiale de crédits. C'est le document de conception, il mérite une passe dédiée.
- [ ] **Aligner les PDF** (`Catenta_Implementation_v0.pdf`, revue) sur le modèle actuel.
- [ ] **`npm audit`** — vulnérabilités transitives (dev deps) à regarder avant une mise en ligne publique.
- [ ] Front : découpage de bundle (le chunk AppKit dépasse 500 kB) — cosmétique.
