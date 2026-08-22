/**
 * Transforme la couverture en chiffre opposable.
 *
 * `hardhat test --coverage` affiche un tableau, mais ne sait pas échouer sous
 * un seuil : sans ce garde-fou, la couverture est une affirmation de slide et
 * non une contrainte. Le script lit `coverage/lcov.info` et sort en erreur si
 * le taux de lignes passe sous le seuil.
 *
 * Les contrats de `contracts/test/` sont exclus : ReentrantLab est un
 * attaquant écrit pour un seul test, sa couverture ne dit rien du registre.
 *
 * Usage : node scripts/check-coverage.mjs [seuil]      (défaut : 90)
 */
import { readFileSync } from 'node:fs'

const THRESHOLD = Number(process.argv[2] ?? 90)
const LCOV = 'coverage/lcov.info'

let raw
try {
  raw = readFileSync(LCOV, 'utf8')
} catch {
  console.error(`✖ ${LCOV} introuvable — lancer d'abord : npx hardhat test --coverage`)
  process.exit(1)
}

const files = []
let current = null
for (const line of raw.split('\n')) {
  if (line.startsWith('SF:')) current = { file: line.slice(3).trim(), hit: 0, found: 0 }
  else if (line.startsWith('LH:') && current) current.hit = Number(line.slice(3))
  else if (line.startsWith('LF:') && current) current.found = Number(line.slice(3))
  else if (line.startsWith('end_of_record') && current) {
    if (!current.file.startsWith('contracts/test/')) files.push(current)
    current = null
  }
}

if (files.length === 0) {
  console.error('✖ Aucun contrat mesuré dans le rapport de couverture.')
  process.exit(1)
}

const hit = files.reduce((n, f) => n + f.hit, 0)
const found = files.reduce((n, f) => n + f.found, 0)
const pct = (hit / found) * 100

for (const f of files) {
  const p = f.found === 0 ? 100 : (f.hit / f.found) * 100
  console.log(`  ${p.toFixed(2).padStart(6)} %  ${f.file}`)
}
console.log(`\n  Couverture des lignes : ${pct.toFixed(2)} % (${hit}/${found}) — seuil ${THRESHOLD} %`)

if (pct < THRESHOLD) {
  console.error(`\n✖ Sous le seuil de ${THRESHOLD} %.`)
  process.exit(1)
}
console.log('\n✔ Seuil respecté.')
