import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCatentaStore } from './catenta'
import { useWalletStore } from './wallet'
import { Status } from '@/lib/contracts'
import { ZERO_ADDRESS } from '@/lib/constants'

export interface PassportRow {
  id: number
  holder: string
  lotId: number
  mintedAt: bigint
  conformityHash: string
  status: Status
  pendingHandoff: string | null
}

export interface PassportDetail extends PassportRow {
  patientCommitment: string
}

/**
 * Deux chemins de lecture, aucun scan de logs :
 *
 * - « mes passeports » passe par `tokenOfOwnerByIndex` — c'est exactement ce
 *   pour quoi ERC721Enumerable a été retenu, et ce qui permet à cette v1 de
 *   fonctionner sans indexeur ;
 * - « tous » itère de 1 à `mintedCount()`, les ids étant séquentiels.
 */
export const usePassportsStore = defineStore('passports', () => {
  const catenta = useCatentaStore()
  const wallet = useWalletStore()

  const list = ref<PassportRow[]>([])
  const current = ref<PassportDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function hydrate(id: number): Promise<PassportRow | null> {
    const c = catenta.readOnly()
    if (!c) return null
    const [holder, traits, status, pending] = await Promise.all([
      c.passports.ownerOf(id) as Promise<string>,
      c.passports.traitsOf(id),
      c.lifecycle.statusOf(id) as Promise<bigint>,
      c.passports.pendingHandoff(id) as Promise<string>,
    ])
    return {
      id,
      holder,
      lotId: Number(traits.lotId),
      mintedAt: traits.mintedAt as bigint,
      conformityHash: traits.conformityHash as string,
      status: Number(status) as Status,
      pendingHandoff: pending && pending !== ZERO_ADDRESS ? pending : null,
    }
  }

  async function loadMine() {
    const c = catenta.readOnly()
    const account = wallet.address
    if (!c || !account) return

    loading.value = true
    error.value = null
    try {
      const balance = Number(await c.passports.balanceOf(account))
      const ids = await Promise.all(
        Array.from({ length: balance }, (_, i) =>
          c.passports.tokenOfOwnerByIndex(account, i) as Promise<bigint>,
        ),
      )
      const rows = await Promise.all(ids.map((id) => hydrate(Number(id))))
      list.value = rows.filter((r): r is PassportRow => r !== null).reverse()
    } catch (err) {
      error.value = 'loadFailed'
      console.error('[catenta] passports (mine) load failed', err)
    } finally {
      loading.value = false
    }
  }

  async function loadAll() {
    const c = catenta.readOnly()
    if (!c) return

    loading.value = true
    error.value = null
    try {
      const count = Number(await c.passports.mintedCount())
      const rows = await Promise.all(
        Array.from({ length: count }, (_, i) => hydrate(i + 1)),
      )
      list.value = rows.filter((r): r is PassportRow => r !== null).reverse()
    } catch (err) {
      error.value = 'loadFailed'
      console.error('[catenta] passports (all) load failed', err)
    } finally {
      loading.value = false
    }
  }

  async function loadOne(id: number) {
    const c = catenta.readOnly()
    if (!c) return

    loading.value = true
    error.value = null
    current.value = null
    try {
      const row = await hydrate(id)
      if (!row) return
      const commitment = (await c.lifecycle.patientCommitmentOf(id)) as string
      current.value = { ...row, patientCommitment: commitment }
    } catch (err) {
      error.value = 'unknownPassport'
      console.error('[catenta] passport load failed', err)
    } finally {
      loading.value = false
    }
  }

  // ---- écritures ----

  async function mintPassport(lotId: number, quantity: bigint, conformityHash: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.mintPassport(lotId, quantity, conformityHash)
    await tx.wait()
    return tx.hash as string
  }

  async function initiateHandoff(id: number, to: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.initiateHandoff(id, to)
    await tx.wait()
    await loadOne(id)
    return tx.hash as string
  }

  async function acceptHandoff(id: number) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.acceptHandoff(id)
    await tx.wait()
    await loadOne(id)
    return tx.hash as string
  }

  async function attestConformity(id: number) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.attestConformity(id)
    await tx.wait()
    await loadOne(id)
    return tx.hash as string
  }

  async function markPlaced(id: number, commitment: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.markPlaced(id, commitment)
    await tx.wait()
    await loadOne(id)
    return tx.hash as string
  }

  return {
    list,
    current,
    loading,
    error,
    loadMine,
    loadAll,
    loadOne,
    mintPassport,
    initiateHandoff,
    acceptHandoff,
    attestConformity,
    markPlaced,
  }
})
