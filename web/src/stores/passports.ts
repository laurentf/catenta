import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCatentaStore } from './catenta'
import { useCreditsStore } from './credits'
import { useWalletStore } from './wallet'
import { Status } from '@/lib/contracts'
import { ZERO_ADDRESS } from '@/lib/constants'
import { eqAddress } from '@/lib/format'

export interface PassportRow {
  id: number
  holder: string
  lotId: number
  mintedAt: bigint
  conformityHash: string
  /** Matière consommée — trait FIGÉ du passeport, lisible sans scan de logs. */
  quantity: bigint
  status: Status
  pendingHandoff: string | null
}

export interface PassportDetail extends PassportRow {
  patientCommitment: string
  /** L'acte clinique, en storage : qui a posé, quand, sur quelle dent. */
  practitioner: string
  placedAt: bigint
  tooth: number
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
  const credits = useCreditsStore()
  const wallet = useWalletStore()

  const list = ref<PassportRow[]>([])
  const current = ref<PassportDetail | null>(null)
  /** Les remises armées à mon nom — voir refreshPending(). */
  const pendingForMe = ref<PassportRow[]>([])
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
      quantity: traits.quantity as bigint,
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
      const [commitment, placement] = await Promise.all([
        c.lifecycle.patientCommitmentOf(id) as Promise<string>,
        c.lifecycle.placementOf(id),
      ])
      current.value = {
        ...row,
        patientCommitment: commitment,
        practitioner: placement.practitioner as string,
        placedAt: placement.placedAt as bigint,
        tooth: Number(placement.tooth),
      }
    } catch (err) {
      error.value = 'unknownPassport'
      console.error('[catenta] passport load failed', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Les passeports dont JE suis le destinataire armé.
   *
   * Sans cette lecture, une remise est introuvable : le destinataire ne détient
   * pas encore le token, donc `tokenOfOwnerByIndex` — qui alimente « les
   * miens » — ne le montrera jamais. Il devrait ouvrir les fiches une par une.
   *
   * Un appel par passeport (`pendingHandoff`, une seule lecture), puis on
   * n'hydrate que les touches : la boîte de réception coûte donc l'ordre d'un
   * scan léger, pas d'un chargement complet.
   */
  async function refreshPending() {
    const c = catenta.readOnly()
    const account = wallet.address
    if (!c || !account) {
      pendingForMe.value = []
      return
    }
    try {
      const count = Number(await c.passports.mintedCount())
      const armed = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          c.passports.pendingHandoff(i + 1) as Promise<string>,
        ),
      )
      const ids = armed
        .map((recipient, i) => (eqAddress(recipient, account) ? i + 1 : 0))
        .filter((id) => id > 0)
      const rows = await Promise.all(ids.map((id) => hydrate(id)))
      pendingForMe.value = rows.filter((r): r is PassportRow => r !== null).reverse()
    } catch (err) {
      console.error('[catenta] pending handoffs load failed', err)
    }
  }

  // ---- écritures ----
  //
  // Toutes les actions `costsCredit` du LifecycleModule brûlent du $CATENTA :
  // le solde affiché doit être relu dans la foulée, sinon le badge d'en-tête
  // reste sur la valeur d'avant la transaction. Seul `acceptHandoff` est
  // gratuit — c'est l'initiateur du transfert qui a déjà payé.

  /** `requestId` 0 : fabrication sans demande enregistrée (le labo produit pour son stock). */
  async function mintPassport(
    lotId: number,
    quantity: bigint,
    conformityHash: string,
    requestId = 0,
  ) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.mintPassport(requestId, lotId, quantity, conformityHash)
    await tx.wait()
    await credits.refresh()
    return tx.hash as string
  }

  async function initiateHandoff(id: number, to: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.initiateHandoff(id, to)
    await tx.wait()
    await Promise.all([loadOne(id), credits.refresh(), refreshPending()])
    return tx.hash as string
  }

  async function acceptHandoff(id: number) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.acceptHandoff(id)
    await tx.wait()
    // Pas de `costsCredit` sur l'acceptation : c'est l'initiateur qui a payé.
    await Promise.all([loadOne(id), refreshPending()])
    return tx.hash as string
  }

  async function attestConformity(id: number) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.attestConformity(id)
    await tx.wait()
    await Promise.all([loadOne(id), credits.refresh()])
    return tx.hash as string
  }

  async function markPlaced(id: number, tooth: number, commitment: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.markPlaced(id, tooth, commitment)
    await tx.wait()
    await Promise.all([loadOne(id), credits.refresh()])
    return tx.hash as string
  }

  return {
    list,
    current,
    pendingForMe,
    loading,
    error,
    loadMine,
    loadAll,
    loadOne,
    refreshPending,
    mintPassport,
    initiateHandoff,
    acceptHandoff,
    attestConformity,
    markPlaced,
  }
})
