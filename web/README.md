# Catenta — dApp

Front de consultation et de pilotage du passeport dentaire on-chain. Déclarer des lots, émettre des passeports, remettre un dossier, attester la conformité, enregistrer la pose — et administrer les rôles.

> Stack reprise du projet précédent (`alyra-blockchain-projet-1`) : **Vue 3 + Vite + Reown AppKit + ethers v6 + Pinia + vue-i18n + Tailwind**. Le style vient des slides du projet (§ Design).

---

## Une seule adresse à configurer

`LifecycleModule` expose `ROLES()`, `PASSPORTS()` et `LOTS()` en `public immutable`. Le front lit donc les trois autres adresses au démarrage (`stores/catenta.ts`).

C'est le pendant du « la factory est la seule adresse à connaître » du projet précédent, appliqué à une architecture modulaire — et le jour où un module en remplace un autre, **une seule valeur change dans le `.env`**.

```bash
cp .env.example .env
```

| Variable | Rôle |
|---|---|
| `VITE_LIFECYCLE_ADDRESS` | **requis** — adresse du `LifecycleModule` déployé |
| `VITE_CHAIN_ID` | Sepolia = `11155111`, Holesky = `17000` |
| `VITE_CHAIN_NAME` · `VITE_CURRENCY_SYMBOL` · `VITE_EXPLORER_URL` | affichage et liens explorateur |
| `VITE_REOWN_PROJECT_ID` | **requis** — Project ID gratuit sur [cloud.reown.com](https://cloud.reown.com) |

> Sans `VITE_REOWN_PROJECT_ID`, la modale de connexion ne s'ouvre pas.

## Lancer

```bash
npm install
npm run dev          # http://localhost:1338
npm run type-check   # vue-tsc, bloquant en CI
npm run build        # type-check puis build de production
```

## Ce que fait l'application, par rôle

Le rôle est **lu on-chain** (`CatentaRoles.hasRole`) et détermine les panneaux affichés. Un front qui déciderait lui-même des droits mentirait : il n'a aucune autorité. Une adresse sans rôle voit le registre en lecture seule — cohérent avec une chaîne publique, où tout est lisible de toute façon.

| Rôle | Ce qui s'ouvre |
|---|---|
| **Laboratoire** | déclarer un lot · émettre un passeport (consomme la matière) · remettre le dossier |
| **Praticien** | accepter une remise · attester la conformité · enregistrer la pose |
| **Ordre / ARS**, **Distributeur** | lecture complète (leurs actions arrivent avec le module de rappel) |
| **Administrateur** | agréer et révoquer les acteurs, inspecter les rôles techniques et la pile déployée |
| **Sans rôle** | lecture seule |

## Architecture

```
src/
├── lib/
│   ├── appkit.ts      init Reown AppKit (réseaux supportés, thème clair)
│   ├── constants.ts   adresse du module, chaîne, helpers explorateur
│   ├── contracts.ts   ABIs, enum Status, constantes de rôles, parseError
│   ├── hash.ts        empreintes de documents + engagement patient salé
│   └── format.ts      shortAddress, eqAddress, formatDate
├── stores/
│   ├── wallet.ts      adaptateur Pinia sur AppKit (compte, chaîne, signer)
│   ├── catenta.ts     découverte de la pile depuis l'unique adresse
│   ├── roles.ts       rôles lus on-chain + administration
│   ├── lots.ts        lots ERC-1155
│   └── passports.ts   passeports ERC-721 + actions du cycle de vie
├── views/
│   ├── ConnectView.vue     connexion wallet
│   ├── PassportsView.vue   liste (les miens / tous) + émission
│   ├── PassportView.vue    fiche : timeline, traits figés, actions par rôle
│   ├── LotsView.vue        lots + déclaration
│   └── AdminView.vue       rôles acteurs, rôles techniques, pile déployée
└── components/
    ├── HashInput.vue           fichier / référence / empreinte → bytes32
    ├── CommitmentBuilder.vue   engagement patient salé
    └── ui/                     UiCard, UiButton, UiAlert, StatusBadge, chips
```

### Comment l'app lit la chaîne

- **Pile de contrats** : `ROLES()`, `PASSPORTS()`, `LOTS()` sur le module.
- **Lots** : `lotCount()` puis lecture par index — la quantité restante est `totalSupply(lotId)`, fourni gratuitement par `ERC1155Supply`.
- **Mes passeports** : `balanceOf` + `tokenOfOwnerByIndex`. C'est exactement ce pour quoi `ERC721Enumerable` a été retenu, et ce qui permet à cette version de fonctionner **sans indexeur**.
- **Tous les passeports** : itération de 1 à `mintedCount()`, les ids étant séquentiels.
- **Rôles** : `hasRole` pour l'utilisateur, `getRoleMember*` pour la vue admin — offert par `AccessControlEnumerable`.

**Aucun `getLogs` sur toute la chaîne** : tout se lit par index ou par appel direct, donc rien ne dépend de la générosité du RPC.

### Les erreurs sont décodées

Les ABIs embarquent les fragments `error` — sans eux, ethers ne sait pas nommer un revert. `lib/contracts.ts → parseError` traduit chaque erreur du contrat en phrase lisible : un utilisateur ne voit jamais `unknown custom error`, et un refus de signature dans le wallet n'est pas présenté comme une panne.

## Deux points qui ne sont pas cosmétiques

### L'empreinte des documents est calculée dans le navigateur

`HashInput` accepte un **fichier** (certificat matière, dossier de conformité), une **référence** textuelle, ou une empreinte déjà calculée. Le fichier ne quitte jamais le poste : seul son `keccak256` monte on-chain. C'est le stockage hybride, concrètement — la pièce reste chez son détenteur, la chaîne n'ancre que la preuve d'intégrité.

### L'engagement patient est salé, et le sel est rendu à l'utilisateur

`CommitmentBuilder` génère un sel aléatoire de 32 octets, calcule `keccak256(sel ‖ identité)`, et **propose de télécharger le sel** pour qu'il vive dans le système habituel du cabinet.

Un `keccak256` d'état civil serait cassable par force brute — l'espace des identités est minuscule — et resterait donc une donnée personnelle au sens du RGPD. Avec le sel, effacer la fiche patient détruit le lien et rend l'engagement on-chain définitivement inexploitable. **C'est ce qui rend le droit à l'effacement compatible avec l'immuabilité de la chaîne**, et c'est le point à tenir à l'oral.

## Design

La charte reprend celle des slides du projet, couleurs échantillonnées directement dans `docs/Slides_tech_Passeport_Dentaire.pdf` :

| Rôle | Valeur |
|---|---|
| Teal principal (titres, actions) | `#0F766E` |
| Navy (texte courant) | `#0F2540` |
| Accent (pastilles) | `#27BDAD` |
| Cartes menthe / panneau / pêche / lime | `#EAFAF5` · `#F2F4F6` · `#FCEDE6` · `#EDF5DE` |
| Gris libellés / sourdine | `#6B7280` · `#94A3B8` |

Les motifs des slides sont repris tels quels : bandeau majuscule espacé (« eyebrow »), gros titre gras teal, sous-titre en italique gris, cartes à coins arrondis avec pastille ronde, séparateurs `·` en pied.

## État

Cette version couvre le socle v0 des contrats. Les vues **rappel de lot**, **accusés de réception** et **caution qualité** arriveront avec leurs modules — et, l'architecture étant modulaire, sans changement d'adresse pour le front : le module expose déjà ses dépendances.
