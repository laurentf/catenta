import { getAddress } from 'ethers'

export function shortAddress(address?: string | null, size = 4): string {
  if (!address) return '—'
  if (address.length < 2 * size + 2) return address
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`
}

export function shortHash(hash?: string | null, size = 6): string {
  if (!hash) return '—'
  return `${hash.slice(0, 2 + size)}…${hash.slice(-4)}`
}

export function eqAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  try {
    return getAddress(a) === getAddress(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

export function isAddress(value: string): boolean {
  try {
    getAddress(value.trim())
    return true
  } catch {
    return false
  }
}

/** Horodatage on-chain (uint40, en secondes) → date locale lisible. */
export function formatDate(timestamp: bigint | number, locale = 'fr-FR'): string {
  const seconds = Number(timestamp)
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatQuantity(value: bigint | number): string {
  return new Intl.NumberFormat('fr-FR').format(Number(value))
}
