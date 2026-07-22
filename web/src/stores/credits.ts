import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCatentaStore } from './catenta'
import { useWalletStore } from './wallet'

/**
 * Le crédit d'usage $CATENTA.
 *
 * Rappel de conception : non transférable (donc ni coté ni échangeable),
 * brûlé à chaque action, émis par l'admin contre un abonnement hors chaîne.
 * Décimales = 0, donc les soldes sont des entiers — pas de formatUnits.
 */
export const useCreditsStore = defineStore('credits', () => {
  const catenta = useCatentaStore()
  const wallet = useWalletStore()

  const balance = ref<bigint>(0n)
  const actionCost = ref<bigint>(1n)
  const loading = ref(false)

  async function refresh() {
    const c = catenta.readOnly()
    const account = wallet.address
    if (!c || !account) return
    loading.value = true
    try {
      const [bal, cost] = await Promise.all([
        c.credit.balanceOf(account) as Promise<bigint>,
        c.lifecycle.actionCost() as Promise<bigint>,
      ])
      balance.value = bal
      actionCost.value = cost
    } finally {
      loading.value = false
    }
  }

  /** Solde d'une adresse arbitraire — pour la vue admin. */
  async function balanceOf(address: string): Promise<bigint> {
    const c = catenta.readOnly()
    if (!c) return 0n
    return (await c.credit.balanceOf(address)) as bigint
  }

  async function grantInitial(to: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.credit.grantInitialCredits(to)
    await tx.wait()
    await refresh()
    return tx.hash as string
  }

  async function mint(to: string, amount: bigint) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.credit.mintCredits(to, amount)
    await tx.wait()
    await refresh()
    return tx.hash as string
  }

  return { balance, actionCost, loading, refresh, balanceOf, grantInitial, mint }
})
