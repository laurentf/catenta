import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCatentaStore } from './catenta'
import { useWalletStore } from './wallet'

export interface LotRow {
  id: number
  lab: string
  declaredAt: bigint
  certHash: string
  /** Quantité restante = totalSupply(lotId), fourni par ERC1155Supply. */
  remaining: bigint
  /** Quantité détenue par le compte connecté. */
  mine: bigint
}

/**
 * Les lots se lisent par index, jamais par scan de logs : `lotCount()` donne
 * la borne, et chaque lot se relit directement. Aucun `getLogs` sur toute la
 * chaîne, donc aucune dépendance à la générosité du RPC.
 */
export const useLotsStore = defineStore('lots', () => {
  const catenta = useCatentaStore()
  const wallet = useWalletStore()

  const list = ref<LotRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const c = catenta.readOnly()
    if (!c) return

    loading.value = true
    error.value = null
    try {
      const count = Number(await c.lots.lotCount())
      const account = wallet.address
      const rows = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const id = i + 1 // les ids commencent à 1 : 0 reste la sentinelle
          const [info, remaining, mine] = await Promise.all([
            c.lots.lotOf(id),
            c.lots.totalSupply(id),
            account ? c.lots.balanceOf(account, id) : Promise.resolve(0n),
          ])
          return {
            id,
            lab: info.lab as string,
            declaredAt: info.declaredAt as bigint,
            certHash: info.certHash as string,
            remaining: remaining as bigint,
            mine: mine as bigint,
          } satisfies LotRow
        }),
      )
      list.value = rows.reverse() // le plus récent d'abord
    } catch (err) {
      error.value = 'loadFailed'
      console.error('[catenta] lots load failed', err)
    } finally {
      loading.value = false
    }
  }

  async function declareLot(certHash: string, quantity: bigint) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.declareLot(certHash, quantity)
    await tx.wait()
    await load()
    return tx.hash as string
  }

  return { list, loading, error, load, declareLot }
})
