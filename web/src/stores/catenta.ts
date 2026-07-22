import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { JsonRpcProvider, type ContractRunner } from 'ethers'
import { useWalletStore } from './wallet'
import { LIFECYCLE_ADDRESS, isConfigured } from '@/lib/constants'
import * as C from '@/lib/contracts'

/**
 * Découverte de la pile de contrats.
 *
 * Le front ne connaît qu'UNE adresse — celle du LifecycleModule. Comme il
 * expose ROLES, PASSPORTS et LOTS en public immutable, les trois autres se
 * lisent au démarrage. Cela évite quatre variables d'environnement à tenir en
 * phase, et surtout : le jour où un module remplace celui-ci, une seule valeur
 * change dans le `.env`.
 */
export const useCatentaStore = defineStore('catenta', () => {
  const wallet = useWalletStore()

  const rolesAddress = ref<string | null>(null)
  const passportsAddress = ref<string | null>(null)
  const lotsAddress = ref<string | null>(null)

  const loading = ref(false)
  const error = ref<string | null>(null)
  const ready = computed(
    () => !!rolesAddress.value && !!passportsAddress.value && !!lotsAddress.value,
  )

  // shallowRef : ethers v6 utilise des champs #private que le Proxy réactif
  // de Vue casserait.
  const fallback = shallowRef<JsonRpcProvider | null>(null)

  /** Runner de lecture : le wallet s'il est là, sinon rien de bloquant. */
  const reader = computed<ContractRunner | null>(
    () => wallet.provider ?? fallback.value,
  )

  async function discover() {
    if (!isConfigured()) {
      error.value = 'notConfigured'
      return
    }
    const runner = reader.value
    if (!runner) return

    loading.value = true
    error.value = null
    try {
      const module = C.lifecycle(LIFECYCLE_ADDRESS, runner)
      const [r, p, l] = await Promise.all([
        module.ROLES(),
        module.PASSPORTS(),
        module.LOTS(),
      ])
      rolesAddress.value = r
      passportsAddress.value = p
      lotsAddress.value = l
    } catch (err) {
      // Cause la plus fréquente : adresse d'un contrat qui n'est pas un
      // LifecycleModule, ou mauvais réseau sélectionné dans le wallet.
      error.value = 'discoveryFailed'
      console.error('[catenta] discovery failed', err)
    } finally {
      loading.value = false
    }
  }

  /** Contrats en lecture. */
  function readOnly() {
    const runner = reader.value
    if (!runner || !ready.value) return null
    return {
      roles: C.roles(rolesAddress.value!, runner),
      passports: C.passports(passportsAddress.value!, runner),
      lots: C.lots(lotsAddress.value!, runner),
      lifecycle: C.lifecycle(LIFECYCLE_ADDRESS, runner),
    }
  }

  /** Contrats en écriture — nécessite un signer connecté. */
  function writable() {
    const signer = wallet.signer
    if (!signer || !ready.value) return null
    return {
      roles: C.roles(rolesAddress.value!, signer),
      lifecycle: C.lifecycle(LIFECYCLE_ADDRESS, signer),
    }
  }

  return {
    lifecycleAddress: LIFECYCLE_ADDRESS,
    rolesAddress,
    passportsAddress,
    lotsAddress,
    loading,
    error,
    ready,
    discover,
    readOnly,
    writable,
  }
})
