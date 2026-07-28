import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAddress } from 'ethers'
import { useCatentaStore } from './catenta'
import { useWalletStore } from './wallet'
import { ACTOR_REGISTRY_ADDRESS } from '@/lib/constants'
import * as C from '@/lib/contracts'

/**
 * Qui est derrière une adresse — lu ON-CHAIN dans ActorRegistry.
 *
 * Raison sociale et SIREN d'un acteur agréé, écrits par l'agent d'agrément
 * lui-même. Un fabricant n'y figure jamais : le contrat refuse de le nommer,
 * pour ne pas livrer sa clientèle à ses concurrents.
 *
 * Le registre n'expose pas d'énumération — on ne peut interroger qu'une adresse
 * à la fois. La résolution est donc paresseuse et mise en cache : chaque puce
 * d'adresse demande son propre libellé une fois, et les appels concurrents pour
 * la même adresse sont dédoublonnés.
 */
export interface ActorEntry {
  label: string
  siren: string
}

export const useActorsStore = defineStore('actors', () => {
  const catenta = useCatentaStore()
  const wallet = useWalletStore()

  /** adresse normalisée => identité, ou null si le registre ne la connaît pas. */
  const cache = ref<Record<string, ActorEntry | null>>({})
  const inflight = new Set<string>()

  const configured = () => !!ACTOR_REGISTRY_ADDRESS

  function normalize(address: string): string {
    try {
      return getAddress(address.trim())
    } catch {
      return address.trim().toLowerCase()
    }
  }

  function contract() {
    const runner = wallet.provider ?? null
    if (!runner || !configured()) return null
    return C.actorRegistry(ACTOR_REGISTRY_ADDRESS, runner)
  }

  /** Demande le libellé d'une adresse si on ne l'a pas déjà. */
  async function ensure(address?: string | null) {
    if (!address || !configured()) return
    const key = normalize(address)
    if (key in cache.value || inflight.has(key)) return
    const registry = contract()
    if (!registry) return

    inflight.add(key)
    try {
      const actor = await registry.actorOf(key)
      const label = actor.label as string
      cache.value[key] = label ? { label, siren: actor.siren as string } : null
    } catch {
      // Registre absent ou adresse inconnue : on retombe sur l'adresse brute.
      cache.value[key] = null
    } finally {
      inflight.delete(key)
    }
  }

  function get(address?: string | null): ActorEntry | null {
    if (!address) return null
    return cache.value[normalize(address)] ?? null
  }

  function label(address?: string | null): string | null {
    return get(address)?.label ?? null
  }

  async function setLabel(account: string, actorLabel: string, siren: string) {
    const runner = wallet.signer
    if (!runner || !configured()) throw new Error('no signer')
    const tx = await C.actorRegistry(ACTOR_REGISTRY_ADDRESS, runner).setLabel(
      account,
      actorLabel,
      siren,
    )
    await tx.wait()
    delete cache.value[normalize(account)]
    await ensure(account)
    return tx.hash as string
  }

  async function clearLabel(account: string) {
    const runner = wallet.signer
    if (!runner || !configured()) throw new Error('no signer')
    const tx = await C.actorRegistry(ACTOR_REGISTRY_ADDRESS, runner).clearLabel(account)
    await tx.wait()
    cache.value[normalize(account)] = null
    return tx.hash as string
  }

  /** Vide le cache — après un changement de compte ou de réseau. */
  function reset() {
    cache.value = {}
  }

  void catenta // le registre ne dépend pas de la découverte de la pile

  return { cache, configured, ensure, get, label, setLabel, clearLabel, reset }
})
