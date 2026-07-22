import { concat, getBytes, hexlify, keccak256, randomBytes, toUtf8Bytes } from 'ethers'

/**
 * Empreintes off-chain → on-chain.
 *
 * Deux usages distincts, à ne pas confondre :
 *
 * 1. `hashFile` / `hashText` — l'empreinte d'un DOCUMENT (certificat matière,
 *    dossier de conformité). Le document n'est pas secret, un keccak256 nu
 *    suffit : il sert à prouver qu'un fichier produit plus tard est bien celui
 *    qui a été ancré.
 *
 * 2. `makeCommitment` — l'engagement liant un dispositif à un PATIENT. Ici un
 *    keccak256 nu serait une faute : l'espace des identités est minuscule
 *    (nom, prénom, date de naissance), donc le hash est cassable par force
 *    brute — et resterait une donnée personnelle au sens du RGPD. On y ajoute
 *    un sel aléatoire de 32 octets, conservé UNIQUEMENT hors chaîne avec la
 *    donnée. Effacer la fiche patient détruit le sel et rend l'engagement
 *    on-chain définitivement inexploitable : c'est ce qui rend le droit à
 *    l'effacement compatible avec l'immuabilité de la chaîne.
 */

/** Empreinte d'un fichier, calculée entièrement dans le navigateur. */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return keccak256(new Uint8Array(buffer))
}

/** Empreinte d'un texte libre (référence de document, numéro de dossier…). */
export function hashText(text: string): string {
  return keccak256(toUtf8Bytes(text))
}

export interface Commitment {
  /** Le sel aléatoire — à conserver hors chaîne, avec la fiche patient. */
  salt: string
  /** keccak256(sel ‖ identité) — la seule valeur qui monte on-chain. */
  commitment: string
}

/** Génère un sel de 32 octets et l'engagement correspondant. */
export function makeCommitment(identity: string): Commitment {
  const salt = hexlify(randomBytes(32))
  return { salt, commitment: commitmentFrom(salt, identity) }
}

/** Recalcule un engagement à partir d'un sel conservé — pour vérifier. */
export function commitmentFrom(salt: string, identity: string): string {
  return keccak256(concat([getBytes(salt), toUtf8Bytes(identity)]))
}

/** Vrai si le couple (sel, identité) redonne bien l'engagement ancré. */
export function verifyCommitment(
  salt: string,
  identity: string,
  onChain: string,
): boolean {
  try {
    return commitmentFrom(salt, identity).toLowerCase() === onChain.toLowerCase()
  } catch {
    return false
  }
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/

export function isHash32(value: string): boolean {
  return HEX32.test(value.trim())
}
