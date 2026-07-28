/**
 * Une seule adresse est configurée : celle du LifecycleModule.
 * Il expose ROLES(), PASSPORTS() et LOTS() en public immutable, donc le front
 * découvre le reste de la pile au démarrage (voir stores/catenta.ts).
 * C'est l'équivalent de « la factory est la seule adresse à connaître » du
 * projet précédent, appliqué à une architecture modulaire.
 */
export const LIFECYCLE_ADDRESS = import.meta.env.VITE_LIFECYCLE_ADDRESS ?? ''

/**
 * Le registre d'acteurs, configuré à part.
 *
 * Le LifecycleModule ne le référence pas : il ne l'appelle jamais, et lui
 * donner un pointeur immuable vers un contrat inutilisé aurait été du bruit.
 * Facultatif — sans lui, l'application affiche des adresses, rien de plus.
 */
export const ACTOR_REGISTRY_ADDRESS = import.meta.env.VITE_ACTOR_REGISTRY_ADDRESS ?? ''

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || '11155111')
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Sepolia'
export const CURRENCY_SYMBOL = import.meta.env.VITE_CURRENCY_SYMBOL || 'ETH'
export const EXPLORER_URL =
  import.meta.env.VITE_EXPLORER_URL || 'https://sepolia.etherscan.io'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function txUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`
}

export function isConfigured(): boolean {
  return !!LIFECYCLE_ADDRESS && LIFECYCLE_ADDRESS !== ZERO_ADDRESS
}
