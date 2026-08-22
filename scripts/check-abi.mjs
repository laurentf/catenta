/**
 * Vérifie que l'ABI écrite à la main dans le front correspond aux contrats compilés.
 *
 * `web/src/lib/contracts.ts` déclare des fragments *human-readable* tenus en
 * phase avec `contracts/` À LA MAIN. Rien ne le garantit : `vue-tsc` valide du
 * TypeScript, pas des signatures Solidity. Renommer un paramètre, changer un
 * type ou ajouter un argument compile des deux côtés et casse le front À
 * L'EXÉCUTION, devant le jury.
 *
 * Ce script compare les sélecteurs 4 octets (et les topics d'events) déclarés
 * par le front à ceux des artefacts de compilation. C'est le seul contrôle qui
 * relie vraiment les deux moitiés du dépôt.
 *
 * Usage : node scripts/check-abi.mjs      (après `npx hardhat compile`)
 */
import { readFileSync, existsSync } from 'node:fs'
import { Interface } from 'ethers'

const FRONT = 'web/src/lib/contracts.ts'

/** Quelle constante du front décrit quel contrat. */
const MAPPING = {
  ROLES_ABI: 'artifacts/contracts/access/CatentaRoles.sol/CatentaRoles.json',
  PASSPORT_ABI: 'artifacts/contracts/tokens/PassportNFT.sol/PassportNFT.json',
  ACTOR_REGISTRY_ABI: 'artifacts/contracts/registry/ActorRegistry.sol/ActorRegistry.json',
  LOTS_ABI: 'artifacts/contracts/tokens/MaterialLots.sol/MaterialLots.json',
  CREDIT_ABI: 'artifacts/contracts/tokens/CatentaCredit.sol/CatentaCredit.json',
  LIFECYCLE_ABI: 'artifacts/contracts/modules/LifecycleModule.sol/LifecycleModule.json',
}

if (!existsSync(FRONT)) {
  console.error(`✖ ${FRONT} introuvable.`)
  process.exit(1)
}
// Les commentaires sont retirés d'abord : une apostrophe française dans un
// commentaire ressemble à un début de chaîne pour l'extraction naïve.
const source = readFileSync(FRONT, 'utf8').replace(/\/\/[^\n]*/g, '')

/** Extrait les fragments d'un `export const X_ABI = [ … ] as const`. */
function fragmentsOf(name) {
  const start = source.indexOf(`export const ${name} = [`)
  if (start === -1) return null
  const end = source.indexOf(']', start)
  const body = source.slice(start, end)
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/**
 * Toutes les erreurs du projet, quel que soit le contrat qui les déclare.
 *
 * Une erreur peut remonter d'un contrat APPELÉ : sans crédits, `mintPassport`
 * échoue sur `CatentaCredit.spend` et le revert traverse le module. Le front a
 * donc raison de déclarer `InsufficientCredits` dans l'ABI du LifecycleModule
 * — c'est l'interface avec laquelle ethers décodera le revert. La règle est
 * donc : une erreur doit exister quelque part dans la pile, pas forcément dans
 * le contrat appelé ; une fonction ou un event, si.
 */
const ALL_ERRORS = new Set()
for (const artifactPath of Object.values(MAPPING)) {
  if (!existsSync(artifactPath)) continue
  const iface = new Interface(JSON.parse(readFileSync(artifactPath, 'utf8')).abi)
  iface.forEachError((e) => ALL_ERRORS.add(`error ${e.format('sighash')}`))
}

let problems = 0
let checked = 0

for (const [name, artifactPath] of Object.entries(MAPPING)) {
  const fragments = fragmentsOf(name)
  if (!fragments) {
    console.error(`✖ ${name} : constante absente de ${FRONT}`)
    problems++
    continue
  }
  if (!existsSync(artifactPath)) {
    console.error(`✖ ${artifactPath} absent — lancer d'abord : npx hardhat compile`)
    process.exit(1)
  }

  const onchain = new Interface(JSON.parse(readFileSync(artifactPath, 'utf8')).abi)
  const known = new Set()
  onchain.forEachFunction((f) => known.add(`function ${f.format('sighash')}`))
  onchain.forEachEvent((e) => known.add(`event ${e.format('sighash')}`))
  onchain.forEachError((e) => known.add(`error ${e.format('sighash')}`))

  const missing = []
  for (const fragment of fragments) {
    let parsed
    try {
      parsed = new Interface([fragment])
    } catch {
      missing.push(`${fragment}   (fragment illisible)`)
      continue
    }
    let key = null
    parsed.forEachFunction((f) => (key = `function ${f.format('sighash')}`))
    parsed.forEachEvent((e) => (key = `event ${e.format('sighash')}`))
    parsed.forEachError((e) => (key = `error ${e.format('sighash')}`))
    checked++
    if (!key) continue
    const ok = key.startsWith('error ') ? ALL_ERRORS.has(key) : known.has(key)
    if (!ok) missing.push(fragment)
  }

  if (missing.length === 0) {
    console.log(`  ✔ ${name.padEnd(20)} ${fragments.length} fragments alignés`)
  } else {
    problems += missing.length
    console.error(`  ✖ ${name} — ${missing.length} fragment(s) absent(s) du contrat compilé :`)
    for (const m of missing) console.error(`      ${m}`)
  }
}

console.log(`\n  ${checked} fragments vérifiés contre les artefacts de compilation.`)
if (problems > 0) {
  console.error(`\n✖ Le front et les contrats ont divergé (${problems}).`)
  process.exit(1)
}
console.log('\n✔ Le front parle exactement aux contrats compilés.')
