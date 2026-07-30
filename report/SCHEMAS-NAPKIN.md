# Textes à coller dans Napkin

Trois blocs, à coller **un par un** dans Napkin. Le texte est rédigé pour que Napkin détecte la structure tout seul : étapes numérotées pour un flux, paires « avantage / limite » pour une grille comparative.

Conseil : coller le bloc entier, puis sélectionner le corps (sans le titre) pour laisser Napkin proposer plusieurs visuels.

---

## Bloc A — Le parcours d'une prothèse *(slide 7)*

> Type de visuel à viser : **flux séquentiel horizontal** — un pré-requis en amont, puis cinq étapes, avec les cinq acteurs comme jalons.

```text
Le parcours d'une prothèse dentaire dans Catenta relie cinq acteurs, du fabricant de matière jusqu'au patient. Chaque étape est enregistrée dans le registre, et chaque changement de main doit être accepté par celui qui reçoit.

Pré-requis — Déclaration des lots. Les fabricants déclarent des lots de matière première. Chaque lot porte lui-même sa matière, son unité de comptage, l'empreinte de son certificat CE ou ISO, et sa quantité produite. Les distributeurs peuvent alors acquérir tout ou partie d'un lot pour le revendre aux laboratoires. Quand une commande de matière est passée à un fabricant, celui-ci déclare l'expédition et le distributeur confirme la réception à l'arrivée : la garde de la matière ne change qu'à cet instant.

Étape 1 — Prescription. Le praticien commande la prothèse au laboratoire : la matière voulue, la dent concernée en notation FDI, la teinte, et une description courte. Le laboratoire accepte ou refuse en motivant son refus.

Étape 2 — Approvisionnement du laboratoire. Le laboratoire commande la matière au distributeur. Si le distributeur est en rupture, il commande lui-même au fabricant, et cette commande conserve le lien vers celle qui l'a motivée : la chaîne des acteurs reste complète de bout en bout. Un praticien peut posséder son propre laboratoire, et commander alors directement à un distributeur s'il en a le rôle.

Étape 3 — Fabrication. Le laboratoire consomme la matière et crée le passeport de la prothèse dans la même transaction. La matière est brûlée : le lien entre le lot et la prothèse ne peut plus être reconstruit après coup.

Étape 4 — Remise au praticien. Le laboratoire remet le dossier, le praticien accepte. Personne ne peut se voir imposer une prothèse.

Étape 5 — Conformité et pose. Le praticien atteste le contrôle de conformité, puis pose la prothèse en enregistrant la dent, la date, et une empreinte anonyme du patient.

Le patient repart avec un QR code qui donne accès à tout l'historique : la matière, son fabricant, le laboratoire, la dent et la date de pose.
```

---

## Bloc B — L'architecture en trois couches *(slide 8)*

> Type de visuel à viser : **hiérarchie ou pyramide à trois niveaux**.

```text
L'architecture de Catenta sépare trois couches, selon ce qui doit survivre et ce qui va évoluer.

Couche 1 — L'autorité. Un contrat unique, CatentaRoles, répond à une seule question : cette adresse a-t-elle ce rôle ? Aucun autre contrat ne connaît l'adresse de ses pairs ; tous interrogent l'autorité. C'est le point de découplage de tout le système.

Couche 2 — Les stockages permanents. Quatre contrats déployés une fois et jamais remplacés, parce qu'ils détiennent ce qui doit survivre : PassportNFT pour les passeports de prothèses, MaterialLots pour les lots de matière et leur garde, ActorRegistry pour l'identité des acteurs agréés, CatentaCredit pour le crédit d'usage.

Couche 3 — Les modules remplaçables. LifecycleModule porte toute la logique métier : déclaration des lots, expéditions, commandes, prescriptions, cycle de vie de la prothèse. C'est la partie la plus susceptible d'évoluer avec la réglementation, donc c'est la partie conçue pour être remplacée.

Remplacer un module se fait en trois gestes : déployer le nouveau, lui accorder ses rôles techniques, les révoquer à l'ancien. Les passeports, les lots et les rôles ne bougent pas. Ajouter une fonctionnalité comme le rappel de lot ne touche aucun contrat existant.

La contrepartie est assumée : l'état que le module détient en propre, les statuts et les commandes, serait perdu lors d'un remplacement. C'est le prix de ne pas utiliser de proxy.
```

---

## Bloc C — Les quatre jetons, usage et limites *(slide 9)*

> Type de visuel à viser : **grille comparative** ou **quatre cartes**, avec une ligne avantage et une ligne limite.

```text
Catenta utilise quatre standards de jetons. Aucun n'est décoratif : chacun rend effective une fonctionnalité qui n'existerait pas sans lui.

Le passeport de la prothèse utilise ERC-721 non transférable, dit soulbound. Un jeton égale une prothèse. Son avantage est de rendre la pièce unique, traçable et non spéculable : tout transfert direct est bloqué, seule une remise de dossier acceptée déplace la garde. Sa limite est double : l'extension qui permet de lister les prothèses d'un cabinet sans indexeur coûte environ cinquante mille unités de gas à chaque création, et le passeport suit la pièce et non la bouche du patient, si bien que le remplacement d'une prothèse cassée n'est pas encore modélisé.

Les lots de matière utilisent ERC-1155. Un lot est par nature une quantité semi-fongible : dix grammes de zircone du lot numéro sept. Son avantage est que la quantité restante est fournie gratuitement par le standard, et que la matière consommée est brûlée dans la transaction même qui crée la prothèse. Sa limite est que l'identifiant du lot n'est pas indexé dans l'événement de transfert du standard, ce qui empêche de filtrer l'historique d'un lot par les journaux : Catenta lit donc cet historique directement dans le stockage.

Le crédit d'usage utilise ERC-20 non transférable. C'est le modèle économique du projet : l'abonnement est encaissé hors chaîne, l'administrateur émet des crédits, et chaque action utile en brûle un. Son avantage est de financer le registre sans jamais vendre de jeton : sans transfert possible, il n'y a ni marché, ni cours, ni spéculation, et le risque réglementaire disparaît par construction. Sa limite est la dépendance à un émetteur central : si personne ne crédite un acteur, cet acteur ne peut plus rien faire.

La caution qualité utilisera un ERC-20 externe, prévu pour la version suivante. Son avantage est d'apporter un enjeu économique réel : un laboratoire immobilise une caution saisissable en cas de rappel. Sa limite est double : elle n'est pas encore implémentée, et elle dépend d'un stablecoin tiers. Ce choix est délibéré, car une caution libellée dans un jeton que le projet émettrait lui-même ne vaudrait rien : le laboratoire pourrait s'en émettre autant qu'il veut.
```

---

## Bloc D — Bonus : la chaîne de responsabilité, en deux temps

> Utile si le jury creuse sur la sécurité. Type de visuel : **cycle** ou **flux en deux étapes**.

```text
Dans Catenta, ni une prothèse ni un lot de matière ne peut être poussé sur un acteur. Chaque changement de main se fait en deux temps.

Premier temps, l'expéditeur déclare. Il désigne un destinataire, qui doit être un acteur agréé, et la quantité concernée. La responsabilité commence à courir, mais la matière n'a pas bougé : elle reste chez l'expéditeur.

Second temps, le destinataire accepte. C'est seulement à cet instant que la garde est transférée. L'expéditeur peut annuler tant que personne n'a accepté, en motivant l'annulation.

Ce mécanisme n'est pas du confort d'interface. Il empêche un acteur de se débarrasser d'un lot défectueux ou rappelé en l'expédiant chez un concurrent qui ne l'a jamais demandé. Et il garantit qu'à tout instant, la personne responsable d'une matière est celle qui a explicitement accepté de la prendre.
```
