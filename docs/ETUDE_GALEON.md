# Étude — Galeon : ce qu'on en retient pour Catenta

**Objet.** Galeon est *le* projet blockchain-santé français de référence. Un jury qui connaît le secteur y pensera en écoutant Catenta. Cette étude sert deux buts : en tirer ce qui est réutilisable (doctrine RGPD, mise sur le marché, mécanique de redistribution), et **savoir répondre à la question « votre projet, ce n'est pas un Galeon ? »** (§9).

**Méthode.** Recherche du 21 juillet 2026, sources primaires privilégiées : whitepaper Galeon, Document d'Information Synthétique (DIS) de l'offre obligataire 2026 avec comptes 2022-2024 en annexe, BscScan, liste blanche AMF, CoinGecko. Chaque affirmation porte sa source. Les points non recoupés sont marqués ⚠️ et regroupés en §10.

**Ce document n'est pas un conseil d'investissement**, et ne porte aucun jugement sur les personnes. Il analyse une architecture technique et un modèle économique documentés publiquement, dans le seul but d'en tirer des enseignements de conception.

---

## 1. Trois corrections de départ

| Idée reçue | Réalité |
|---|---|
| « le token GLEON » | Le token est **$GALEON**. Aucun actif « GLEON » n'existe pour ce projet. |
| « le modèle Care2Earn » | Le terme **n'apparaît nulle part** dans la documentation Galeon. Leur vocabulaire est « Blockchain Swarm Learning® », « Proof of Hospital », « DAO ». Une mécanique de redistribution existe, mais sous un autre nom (§4.4). |
| « fondé par Karim / Ludovic » | Cinq co-fondateurs en 2016, dont **Dr Loïc Brotons** (PDG, anesthésiste-réanimateur) et **Peter Bartos** (CTO). |

Ce genre d'écart est en soi une leçon : **la notoriété d'un projet crypto circule sous une forme déformée**. Vérifier à la source avant de citer un comparable à l'oral.

---

## 2. Galeon en un coup d'œil (au 21/07/2026)

| | |
|---|---|
| Société | GALEON, SIREN 821 546 835, RCS Annecy, créée le 20/06/2016 — SAS transformée en **SA** en décembre 2025 |
| Effectif | 10 à 19 salariés (INSEE) |
| Produit réel | **DPI (dossier patient informatisé) en SaaS**, certifié HDS, ISO 27001, Ségur, HL7, LAP — spécialisé gynéco-obstétrique à l'origine |
| Déploiements affichés | **19 hôpitaux publics français** dont 2 CHU, >10 000 professionnels, >3 M dossiers |
| Déploiement complet documenté | **Hôpital Saint-Joseph de Marseille**, démarré mars 2026, ~3 000 soignants |
| Token | **$GALEON**, ERC-20 + BEP-20, TGE 10/03/2022, prix ICO 0,03 $ |
| Prix / capitalisation | **0,005144 $** — 4,83 M$ de capitalisation, **volume 24 h : 3 036 $** |
| ATH / ATL | ATH 0,0414 $ (05/01/2025) · **ATL 0,004435 $ le 17/07/2026, il y a 4 jours** |
| Levées | 500 k$ (2021) · **ICO 15 M$ (janv. 2022)** · obligataire public 8 M€ (2026) · capital 3 M€ à 50 M€ de valorisation (clôture 10/07/2026) |
| Statut AMF | **PSAN enregistré n° E2023-098** — *conservation d'actifs numériques pour compte de tiers uniquement* |

*Sources : DIS (atlantis.galeon.care/documents/DIS.pdf), whitepaper.galeon.care, CoinGecko, BscScan, amf-france.org, hopital-saint-joseph.fr.*

---

## 3. L'architecture réelle — le point le plus instructif

### 3.1 Il n'y a pas de blockchain Galeon en production

Le token vit sur **BNB Smart Chain** (où est la liquidité) et **Ethereum**. La « blockchain Galeon » avec consensus **Proof of Hospital** — chaque hôpital étant un nœud validateur — est décrite **au futur**. La roadmap officielle place le **Blockchain Swarm Learning® en S2 2027** et la plateforme de vote DAO en **S1 2027**.

> **C'est le fait central du dossier : au 21/07/2026, le cœur technologique qui justifiait l'ICO de janvier 2022 n'est pas déployé. Cinq ans après la levée.**

### 3.2 Leur doctrine RGPD — et elle est bonne

Le whitepaper est explicite :

> « **Les données restent sur les serveurs des hôpitaux, elles ne sont pas mises sur une blockchain.** » — seuls « les algorithmes d'intelligence artificielle se "déplacent" via la blockchain pour être entraînés de façon décentralisée ».

C'est une architecture RGPD **irréprochable** : aucune donnée de santé, **ni même un hash de donnée personnelle**, n'est écrite sur une chaîne publique. La chaîne sert à tracer l'entraînement et à répartir la valeur créée.

C'est aussi l'aveu que **la blockchain ne touche pas au produit**. Le DPI est un SaaS hébergé HDS, classique. La chaîne est une couche d'attestation pour un usage à venir.

### 3.3 Ce que ça vaut pour Catenta

| Enseignement | Conséquence pour Catenta |
|---|---|
| **Aucune PII on-chain, pas même hachée** | Notre engagement patient est un `bytes32` **salé** (SPEC §9.2). C'est un cran plus on-chain que Galeon — donc **c'est à nous de justifier le sel**, et le sel est précisément ce qui rend la position tenable. Sans lui, Galeon serait plus rigoureux que nous. |
| **Le SaaS métier est le cheval de Troie** | Confirme la stratégie « plugin de Julie / Logos » des slides : l'adoption passe par le logiciel déjà installé, jamais par un outil de plus. |
| **Les certifications sont le vrai ticket d'entrée** | HDS, ISO 27001, Ségur, HL7 pour eux ; pour nous **MDR 2017/745** sur les dispositifs sur mesure et l'hébergement HDS si des données de santé transitent. **La blockchain est la plus petite partie du problème réglementaire** — le dire à l'oral vaut mieux que se le faire dire. |

---

## 4. Le token $GALEON — anatomie

### 4.1 Répartition

| Poste | % |
|---|---|
| Staking & Rewards | 23 % |
| Operations | 20 % |
| DAO Treasury | 15 % |
| **Équipe** | **15 %** |
| Ecosystem & Airdrops | 10 % |
| Public Sale 1 + 2 | 13,75 % |
| Private Sale | 1,25 % |
| Advisors | 2 % |

**Les investisseurs représentent 15 % du supply. La société en contrôle 50 %** (équipe + operations + trésorerie DAO). Supply max 4 Md, circulant ~940 M au 21/07/2026 contre 744 M en septembre 2025 : **+195 M de jetons en 10 mois**, soit ~+26 % de flottant — sur un marché dont le volume quotidien est de **3 036 $**.

### 4.2 Le staking est de la dilution, pas un rendement

Programme relancé en octobre 2025 : blocage **5 ans → +60 %**, 4 ans → +24 %, 3 ans → +9 %. Ces intérêts sont payés **en $GALEON prélevés sur l'allocation « Staking & Rewards » de 920 M**.

Ce n'est donc **pas** une distribution de revenus : c'est une émission. Bloquer 5 ans pour +60 % (~9,9 %/an en jetons) sur un actif à **−87,6 % de son plus haut** et dont le plus bas historique date de quatre jours.

### 4.3 Le buyback & burn : bonne idée, exécution interrompue

Mécanique élégante : **à chaque déploiement hospitalier, l'équivalent d'au moins 10 000 $ de prestations sert à racheter et détruire des $GALEON.** Le mécanisme est ancré sur un **événement commercial réel** — c'est le bon réflexe de conception.

Cumul déclaré : **67,8 M de jetons brûlés**, ~1,81 M$, sur 18 transactions vérifiables, **d'octobre 2022 à mai 2025**.

⚠️ **Aucun burn documenté depuis mai 2025**, soit ~14 mois — alors que le déploiement de Saint-Joseph Marseille a eu lieu en mars 2026. Aucune explication officielle trouvée.

### 4.4 La clé de répartition — l'idée à retenir

Lors d'un futur contrat d'entraînement IA payé par un tiers (laboratoire pharmaceutique, industriel), la valeur serait répartie :

- **40 %** aux hôpitaux ayant fourni et structuré les données
- **30 %** au fonds DAO (patients + détenteurs de jetons)
- **20 %** en buyback & burn

**C'est le meilleur élément de design du projet** : une clé explicite, publique, qui rémunère celui qui produit la donnée. C'est le concept que la question désignait par « Care2Earn », et c'est directement transposable (§8).

**Statut opérationnel : nul.** Aucun contrat d'entraînement IA payant n'a été publiquement documenté. Aucun soignant ni patient n'a été rémunéré en $GALEON. Le vote DAO est prévu S1 2027.

---

## 5. Le modèle économique réel

Les comptes 2022-2024 sont publiés en annexe du DIS. Ils sont établis par un cabinet comptable ; **le seul rapport de commissaire joint est un rapport de commissaire à la transformation** (décembre 2025), pas un audit légal annuel.

| € | 2022 | 2023 | 2024 |
|---|---|---|---|
| Chiffre d'affaires | 3 639 508 | 5 022 879 | 4 904 885 |
| **Différences positives de change** | 531 204 | 547 812 | **4 486 543** |
| Résultat net | 469 242 | 1 152 369 | **2 229 202** |
| **Disponibilités** | **5 774 173** | 3 279 792 | **324 645** |
| Titres & instruments de trésorerie (crypto) | — | 5 828 674 | 10 188 990 |
| **Produits constatés d'avance** | **11 095 143** | 8 118 958 | 5 947 458 |

### 5.1 L'ICO est comptabilisée en chiffre d'affaires

Les 15 M$ de l'ICO ont été enregistrés en **produits constatés d'avance** puis étalés en produits. Le prévisionnel de janvier 2026 (DIS) isole d'ailleurs une ligne **« Produits ICO »** : 3 000 000 € en 2025, 2 900 000 € en 2026, **0 en 2027**. La somme — 5,9 M€ — correspond exactement au solde de produits constatés d'avance au 31/12/2024.

En reconstituant par la variation de ce poste : **~2,98 M€ d'ICO reconnus en 2023 (≈59 % du CA)** et **~2,17 M€ en 2024 (≈44 % du CA)**. ⚠️ *Reconstitution à partir du bilan, non explicitée dans le DIS ; une enquête de presse avance 92-95 %, le PDG conteste et avance ~1,8 M€ de revenus santé réels en 2025 — chiffre cohérent avec le prévisionnel du DIS lui-même (2 022 776 €).*

### 5.2 Le résultat 2024 tient à une réévaluation

Sur 2 229 202 € de résultat net, **4 486 543 € de « différences positives de change »** — la revalorisation de la trésorerie crypto. **Sans ce gain latent, l'exercice serait déficitaire.** Dans le même temps, la **trésorerie liquide chute de 3 279 792 € à 324 645 €, soit −90 % en un an**.

### 5.3 Le DIS reconnaît la tension

> « l'Emetteur dispose d'un fonds de roulement net suffisant […] **pour les 6 prochains mois** » — et à la date du **13 mars 2026**, « les disponibilités de l'Emetteur s'élèvent à **618 453 €** ».

### 5.4 Synthèse

- **Revenu fiat réel** : licences SaaS du DPI, **~2 M€ en 2025** selon le prévisionnel du DIS, pour 19 établissements ≈ **~105 k€/hôpital/an**. C'est modeste mais réel.
- **Le token n'est pas un revenu récurrent** : c'est un **instrument de financement** de 2022 dont le produit est étalé comptablement, et qui **s'épuise fin 2026** — ce qui explique mécaniquement les deux levées de 2026.
- **Aucune articulation opérationnelle fiat ↔ token.** Le seul flux réel est *fiat → rachat/burn*, interrompu depuis mai 2025.

---

## 6. Le test décisif : retirer la blockchain

C'est l'outil d'évaluation le plus utile qu'on tire de ce dossier, et c'est **exactement le critère C1** du référentiel (« l'apport de la technologie blockchain est démontré »).

> **Question : on supprime la chaîne. Qu'est-ce qui casse ?**

| | Galeon | Catenta |
|---|---|---|
| Produit sans la chaîne | **Le DPI fonctionne à l'identique.** C'est un SaaS hébergé HDS. | **Le registre s'effondre.** Il faudrait qu'un laboratoire héberge la base de ses concurrents, ou qu'un tiers privé la détienne — les deux sont refusés par les acteurs. |
| Ce que la chaîne apporte réellement | une couche d'attestation pour un usage futur (2027) + un canal de financement | la **neutralité entre parties non coopératives** et la **non-réécriture de l'historique après l'incident** |
| Verdict C1 | l'apport reste **à démontrer** en l'état | l'apport est **structurel** |

Catenta passe le test — et c'est la formulation à retenir pour l'oral : *« la blockchain ne nous sert pas à stocker, elle nous sert à ce qu'aucun concurrent n'ait à faire confiance à un autre. »*

---

## 7. Les six leçons transférables

### ✅ À reprendre

**1. La donnée de santé ne monte jamais sur la chaîne.** Galeon va au bout : pas même un hash. Nous inscrivons un engagement **salé** — plus permissif, donc à justifier explicitement. Le sel n'est pas un détail technique, c'est ce qui rend notre position défendable face à la leur.

**2. Ancrer la mécanique du jeton sur un événement métier réel.** Le buyback de 10 k$ *par déploiement* est une bonne idée de design. Chez nous, l'équivalent existe déjà nativement : **le burn ERC-1155 au mint du passeport** est déclenché par un acte de fabrication réel, pas par une décision de trésorerie. C'est plus solide, parce que c'est **inévitable par construction**.

**3. La clé de répartition explicite (40/30/20).** Si Catenta devait un jour redistribuer de la valeur, publier une clé chiffrée, lisible, qui rémunère le producteur de la donnée, est la bonne forme. À reprendre si le sujet vient à l'oral — voir §8.

### ❌ À éviter

**4. Le jeton comme financement déguisé.** 15 M$ levés en 2022, étalés en chiffre d'affaires sur quatre exercices, épuisés fin 2026, suivis de deux levées d'urgence en 2026. **La leçon de conception : dès qu'un jeton est vendu au public, sa raison d'être devient le financement, et son utilité produit passe au second plan.** Les trois jetons de Catenta ne sont **jamais vendus** — ils sont émis à l'acte, contre un fait métier.

**5. L'utilité promise pour un futur qui recule.** L'ICO de janvier 2022 était justifiée par le BSL, la DAO et le Proof of Hospital. Roadmap actuelle : 2027. **Directement applicable à nous** : les slides Catenta annoncent une « alerte nationale instantanée ». Une chaîne ne pousse rien. Nous avons corrigé en amont — statut dérivé en O(1) + accusés de réception on-chain, et le fan-out assumé comme hors chaîne (SPEC §6.3). **La règle : ne jamais présenter une capacité v2 avec le vocabulaire d'une capacité v1.**

**6. Le rendement payé dans son propre jeton.** +60 % sur 5 ans financés par une allocation de 920 M jetons, c'est de la dilution habillée en rendement. **C'est la démonstration empirique de notre arbitrage SPEC §8.3** : une caution libellée dans un jeton auto-émis n'a aucune valeur. Le laboratoire pourrait s'en émettre, le régulateur en imprimer pour le sanctionner. Notre registre accepte un `IERC20` **injecté** — mock stablecoin sur Sepolia, stablecoin réel en production.

**7. La DAO fantôme.** 15 % du supply en « DAO Treasury », plateforme de vote prévue pour 2027. Nous avons écarté la gouvernance par jetons dès la spécification (SPEC §1.4, §8.7) : **l'Ordre et l'ARS sont des autorités désignées par la loi, pas élues par des porteurs de jetons.** Une DAO serait ici un contresens réglementaire, pas une modernité.

---

## 8. Faut-il un modèle économique à jeton pour Catenta ?

### 8.1 Réponse courte : non, et c'est un choix, pas une timidité

Catenta a **trois jetons dont aucun n'est un actif d'investissement** :

| Jeton | Ce qu'il est | Vendu au public ? |
|---|---|---|
| `PassportNFT` (ERC-721) | l'objet lui-même — un dispositif médical | non, et non transférable |
| `MaterialLots` (ERC-1155) | la matière, brûlée à la consommation | non, circulation fermée entre agréés |
| Caution (ERC-20) | un collatéral **externe** au projet | non — nous n'en émettons pas |

**Aucune offre au public, aucune promesse de rendement, aucune allocation « équipe ».** C'est exactement ce qui sépare Catenta de la trajectoire décrite aux §4 et §5.

### 8.2 Le modèle économique fiat, si le projet devenait un produit

| Source | Payeur | Ordre de grandeur |
|---|---|---|
| Abonnement laboratoire | labo de prothèse | licence annuelle + frais par passeport émis |
| Module cabinet | éditeur (Julie, Logos) en marque blanche | redevance par siège, distribution portée par l'éditeur |
| Accès régulateur | Ordre / ARS | **gratuit** — c'est ce qui rend le registre légitime |
| Gas | **sponsorisé** par la plateforme via meta-transactions ERC-2771 | condition d'adoption : un cabinet n'aura jamais d'ETH |

Repère utile tiré de Galeon : **~105 k€ par établissement et par an** pour un DPI complet. Un module de traçabilité est un ordre de grandeur en dessous — ce qui situe le prix réaliste et évite les projections fantaisistes.

### 8.3 Et si on voulait quand même un jeton fongible ?

Alors la clé de répartition de Galeon serait le bon modèle, **appliquée à un flux qui existe** : les frais payés par les laboratoires, répartis entre le régulateur (fonctionnement), les cabinets qui alimentent le registre (les producteurs de donnée), et un rachat. Mais cela suppose un flux de revenus réel — c'est-à-dire **après** le produit, jamais avant. **L'erreur n'est pas d'émettre un jeton : c'est de l'émettre pour financer ce qui devra le rendre utile.**

---

## 9. MiCA et cadre réglementaire

- Galeon est **PSAN enregistré à l'AMF, n° E2023-098** (02/10/2023) — vérifié sur la liste blanche. **Portée : conservation d'actifs numériques pour compte de tiers, uniquement.** Un enregistrement **n'est pas un agrément** : l'AMF ne contrôle pas l'activité. Galeon le reconnaît sur sa propre page.
- Le régime PSAN « enregistrement simple » issu de la loi PACTE devait s'éteindre au **30 juin 2026** au profit de l'agrément **PSCA/CASP** de MiCA. ⚠️ **Aucune information trouvée sur l'obtention d'un agrément MiCA par Galeon** — point ouvert au 21/07/2026.
- L'offre obligataire de 2026 relève du **Document d'Information Synthétique** (offre exemptée de prospectus) : **légale, mais hors du champ de contrôle de l'AMF** — c'est précisément l'objet des critiques publiques.

**Lecture pour Catenta** (analyse, pas un avis juridique) : en **n'offrant aucun jeton au public**, Catenta reste hors du régime d'offre de MiCA. Le passeport ERC-721, unique et non fongible, est *a priori* hors périmètre ; les lots ERC-1155 circulent en cercle fermé entre acteurs agréés ; le jeton de caution est émis par un tiers. **La conformité vient ici de la conception, pas d'une démarche administrative** — et c'est un point fort à énoncer clairement.

---

## 10. Argumentaire d'oral

**« Votre projet, ce n'est pas la même chose que Galeon ? »**

> Non, et sur trois points précis.
>
> **Un.** Galeon vend un DPI en SaaS : retirez la blockchain, le produit fonctionne à l'identique. Retirez-la chez nous, il faudrait qu'un laboratoire héberge la base de ses concurrents — aucun n'accepterait. Notre apport blockchain est structurel, pas additionnel.
>
> **Deux.** Leur jeton a été vendu au public en 2022 pour financer une technologie annoncée pour 2027. Nos trois jetons ne sont jamais vendus : ils sont émis à l'acte, contre un fait métier — une prothèse fabriquée, un lot consommé, une caution déposée. Et notre caution est libellée dans un jeton **que nous n'émettons pas**, parce qu'une garantie dans sa propre monnaie ne garantit rien.
>
> **Trois.** Nous n'avons pas de DAO. L'Ordre et l'ARS sont des autorités désignées par la loi ; les faire élire par des porteurs de jetons serait un contresens réglementaire.

**« Alors pourquoi trois standards de jetons, si ce n'est pas pour faire joli ? »**

> Parce que chacun porte une fonctionnalité qui n'existerait pas sans lui. L'ERC-721 *est* le dispositif — soulbound, parce qu'un dispositif médical n'est pas un actif échangeable. L'ERC-1155 modélise une quantité de matière consommable, brûlée à la fabrication : c'est le lien matière → prothèse, établi dans la transaction même. L'ERC-20 met un enjeu économique derrière la qualité. Retirez-en un, une fonctionnalité disparaît.

**Sur le RGPD, si on nous compare à eux :**

> Galeon ne met rien du tout sur la chaîne, pas même un hash — c'est irréprochable, et c'est possible parce que leur chaîne ne sert pas au produit. Nous inscrivons un engagement, donc nous devons être plus précis : c'est un hash **salé**, avec un sel de 32 octets conservé uniquement hors chaîne. Effacer la donnée détruit le sel et rend l'engagement définitivement inexploitable. Sans sel, un hash d'état civil serait cassable par force brute — et resterait une donnée personnelle.

---

## 11. Ce qui reste incertain

À ne pas affirmer sans réserve, faute de source primaire :

1. **Montant réellement collecté par l'obligataire 2026** (objectif 8 M€) — le chiffre de ~1 M€ vient de forums, non confirmé par Galeon.
2. **Résultat de la levée en actions clôturant le 10/07/2026** (3 M€ visés) — aucune communication de closing trouvée.
3. **Part exacte de l'ICO dans le chiffre d'affaires** — une enquête de presse avance 92-95 %, ma reconstitution donne 44-59 %, le PDG avance ~1,8 M€ de revenus santé réels en 2025. La ventilation n'est pas fournie dans le DIS. **Divergence non résolue.**
4. **Liste nominative des 19 hôpitaux** et périmètre exact de chaque déploiement — non publiés. Seul Saint-Joseph Marseille est documenté comme établissement complet.
5. **Statut MiCA / agrément PSCA** au-delà du 30 juin 2026 — introuvable.
6. **Hébergeur HDS retenu**, spécification du Proof of Hospital, schéma cryptographique du swarm learning — non publiés.
7. **Audit postérieur à Hacken (février 2022)** — non identifié. Une page CertiK Skynet existe (note 3,9 relevée sur CoinMarketCap), contenu non vérifié.
8. **Absence de burn depuis mai 2025** — le fait est vérifiable sur BscScan ; l'absence d'explication officielle ne préjuge pas de l'absence de raison.

---

## 12. Sources principales

| Source | Nature |
|---|---|
| [whitepaper.galeon.care](https://whitepaper.galeon.care/) | primaire — tokenomics, doctrine RGPD, buyback, clé 40/30/20 |
| [atlantis.galeon.care/documents/DIS.pdf](https://atlantis.galeon.care/documents/DIS.pdf) | primaire — statuts, actionnariat, comptes 2022-2024, prévisionnel, facteurs de risque |
| [galeon.care/roadmap](https://www.galeon.care/roadmap) | primaire — calendrier BSL (S2 2027), DAO (S1 2027) |
| BscScan — `0x1d0Ac23F03870f768ca005c84cBb6FB82aa884fD` | primaire — supply, détenteurs, burns, audit Hacken 2022 |
| [amf-france.org — liste blanche PSAN](https://www.amf-france.org/en/warnings/white-lists/daspcasp/galeon-sas) | primaire — enregistrement E2023-098 et sa portée |
| [CoinGecko — galeon](https://www.coingecko.com/en/coins/galeon) | marché au 21/07/2026 |
| [ticsante.com](https://www.ticsante.com/story?ID=7035), [dsih.fr](https://dsih.fr/), [hopital-saint-joseph.fr](https://www.hopital-saint-joseph.fr/) | presse spécialisée santé — déploiements |
| [zero-bullshit.fr — « Galeon : l'étrange levée de 8M€ »](https://www.zero-bullshit.fr/p/galeon-letrange-levee-de-8m) | enquête critique, partiellement recoupée (§5.1) |
</content>
