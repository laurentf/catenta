import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCatentaStore } from './catenta'
import { useCreditsStore } from './credits'
import { useWalletStore } from './wallet'
import { eqAddress } from '@/lib/format'
import { ShipmentStatus } from '@/lib/contracts'

export interface LotRow {
  id: number
  /** L'ORIGINE du lot — le fabricant qui l'a produit. Ne bouge jamais. */
  manufacturer: string
  /** Ce dont le lot est fait, et l'unité de sa quantité — inscrits sur le lot. */
  material: string
  unit: string
  declaredAt: bigint
  certHash: string
  /** Quantité restante en circulation = totalSupply(lotId) (ERC1155Supply). */
  remaining: bigint
  /** Quantité dont le compte connecté a la garde. */
  mine: bigint
  /** Nombre de dispositifs déjà fabriqués à partir de ce lot. */
  devices: number
}

/** Le parcours complet d'un lot, reconstitué depuis le storage. */
export interface LotJourney {
  id: number
  manufacturer: string
  material: string
  unit: string
  declaredAt: bigint
  certHash: string
  remaining: bigint
  shipments: ShipmentRow[]
  devices: { id: number; quantity: bigint; mintedAt: bigint; holder: string }[]
  holders: { address: string; quantity: bigint }[]
}

/** Une quantité de matière en transit entre deux acteurs. */
export interface ShipmentRow {
  id: number
  from: string
  to: string
  lotId: number
  quantity: bigint
  status: ShipmentStatus
}

/**
 * Les lots se lisent par index, jamais par scan de logs : `lotCount()` donne
 * la borne, et chaque lot se relit directement. Aucun `getLogs` sur toute la
 * chaîne, donc aucune dépendance à la générosité du RPC.
 */
export const useLotsStore = defineStore('lots', () => {
  const catenta = useCatentaStore()
  const credits = useCreditsStore()
  const wallet = useWalletStore()

  const list = ref<LotRow[]>([])
  /** Expéditions à réceptionner par le compte connecté. */
  const incoming = ref<ShipmentRow[]>([])
  /** Expéditions déclarées par le compte connecté, pas encore acceptées. */
  const outgoing = ref<ShipmentRow[]>([])
  const loading = ref(false)
  const journeyLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Combien de dispositifs sont sortis de chaque lot.
   *
   * C'est le sens même du registre — « cette matière est devenue ces prothèses »
   * — et il n'était visible nulle part. Le lot d'origine est un trait figé du
   * passeport, donc une lecture par passeport suffit : pas de log, pas
   * d'indexeur, cohérent avec le reste des chargements.
   */
  async function countDevicesByLot(): Promise<Record<number, number>> {
    const c = catenta.readOnly()
    if (!c) return {}
    const minted = Number(await c.passports.mintedCount())
    const traits = await Promise.all(
      Array.from({ length: minted }, (_, i) => c.passports.traitsOf(i + 1)),
    )
    return traits.reduce<Record<number, number>>((acc, t) => {
      const lotId = Number(t.lotId)
      acc[lotId] = (acc[lotId] ?? 0) + 1
      return acc
    }, {})
  }

  async function load() {
    const c = catenta.readOnly()
    if (!c) return

    loading.value = true
    error.value = null
    try {
      const count = Number(await c.lots.lotCount())
      const account = wallet.address
      const [rows, devices] = await Promise.all([
        Promise.all(
          Array.from({ length: count }, async (_, i) => {
            const id = i + 1 // les ids commencent à 1 : 0 reste la sentinelle
            const [info, remaining, mine] = await Promise.all([
              c.lots.lotOf(id),
              c.lots.totalSupply(id),
              account ? c.lots.balanceOf(account, id) : Promise.resolve(0n),
            ])
            return {
              id,
              manufacturer: info.manufacturer as string,
              material: info.material as string,
              unit: info.unit as string,
              declaredAt: info.declaredAt as bigint,
              certHash: info.certHash as string,
              remaining: remaining as bigint,
              mine: mine as bigint,
            }
          }),
        ),
        countDevicesByLot(),
      ])
      list.value = rows
        .map((row) => ({ ...row, devices: devices[row.id] ?? 0 } satisfies LotRow))
        .reverse() // le plus récent d'abord
    } catch (err) {
      error.value = 'loadFailed'
      console.error('[catenta] lots load failed', err)
    } finally {
      loading.value = false
    }
  }

  async function declareLot(
    material: string,
    unit: string,
    certHash: string,
    quantity: bigint,
  ) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.declareLot(material, unit, certHash, quantity)
    await tx.wait()
    // `declareLot` est `costsCredit` : le solde du badge doit suivre.
    await Promise.all([load(), credits.refresh()])
    return tx.hash as string
  }

  /**
   * Le parcours complet d'un lot, reconstitué SANS AUCUN EVENT.
   *
   * Les expéditions sont en storage (`shipmentCount` / `shipmentOf`), donc la
   * chaîne de garde se relit comme le reste : un scan borné, aucun `getLogs`,
   * aucune dépendance à la générosité d'un RPC public. C'est ce qui a motivé de
   * remplacer le booléen `settled` par un statut : une expédition annulée et une
   * expédition acceptée ne racontent pas la même histoire.
   *
   * La garde actuelle se déduit ensuite : tous ceux qui ont un jour reçu, plus
   * le fabricant, interrogés en `balanceOf`.
   */
  async function loadJourney(lotId: number): Promise<LotJourney | null> {
    const c = catenta.readOnly()
    if (!c) return null
    journeyLoading.value = true
    try {
      const [info, remaining, shipmentTotal, mintedTotal] = await Promise.all([
        c.lots.lotOf(lotId),
        c.lots.totalSupply(lotId),
        c.lifecycle.shipmentCount(),
        c.passports.mintedCount(),
      ])

      const allShipments = await Promise.all(
        Array.from({ length: Number(shipmentTotal) }, async (_, i) => {
          const id = i + 1
          const s = await c.lifecycle.shipmentOf(id)
          return {
            id,
            from: s.from as string,
            to: s.to as string,
            lotId: Number(s.lotId),
            quantity: s.quantity as bigint,
            status: Number(s.status) as ShipmentStatus,
          } satisfies ShipmentRow
        }),
      )
      const shipments = allShipments.filter((s) => s.lotId === lotId)

      // Les prothèses issues de ce lot, avec la matière que chacune a consommée.
      const traits = await Promise.all(
        Array.from({ length: Number(mintedTotal) }, (_, i) => c.passports.traitsOf(i + 1)),
      )
      const devices = await Promise.all(
        traits
          .map((t, i) => ({ t, id: i + 1 }))
          .filter(({ t }) => Number(t.lotId) === lotId)
          .map(async ({ t, id }) => ({
            id,
            quantity: t.quantity as bigint,
            mintedAt: t.mintedAt as bigint,
            holder: (await c.passports.ownerOf(id)) as string,
          })),
      )

      // Qui détient quoi aujourd'hui : le fabricant plus tous les destinataires.
      const candidates = new Map<string, string>()
      candidates.set((info.manufacturer as string).toLowerCase(), info.manufacturer as string)
      for (const s of shipments) candidates.set(s.to.toLowerCase(), s.to)
      const holders = (
        await Promise.all(
          [...candidates.values()].map(async (address) => ({
            address,
            quantity: (await c.lots.balanceOf(address, lotId)) as bigint,
          })),
        )
      ).filter((h) => h.quantity > 0n)

      return {
        id: lotId,
        manufacturer: info.manufacturer as string,
        material: info.material as string,
        unit: info.unit as string,
        declaredAt: info.declaredAt as bigint,
        certHash: info.certHash as string,
        remaining: remaining as bigint,
        shipments,
        devices,
        holders,
      }
    } catch (err) {
      console.error('[catenta] lot journey load failed', err)
      return null
    } finally {
      journeyLoading.value = false
    }
  }

  // ---- circulation de la matière ----

  /**
   * Les expéditions qui M'ATTENDENT.
   *
   * Même problème que la remise de passeport : tant que je n'ai pas accepté, la
   * matière n'est pas à moi, donc elle n'apparaît dans aucune de mes balances.
   * Sans cette lecture, une expédition est introuvable. Un scan borné par
   * `shipmentCount`, sans log ni indexeur, comme le reste des chargements.
   */
  async function refreshIncoming() {
    const c = catenta.readOnly()
    const account = wallet.address
    if (!c || !account) {
      incoming.value = []
      return
    }
    try {
      const count = Number(await c.lifecycle.shipmentCount())
      const rows = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const id = i + 1
          const s = await c.lifecycle.shipmentOf(id)
          return {
            id,
            from: s.from as string,
            to: s.to as string,
            lotId: Number(s.lotId),
            quantity: s.quantity as bigint,
            status: Number(s.status) as ShipmentStatus,
          } satisfies ShipmentRow
        }),
      )
      incoming.value = rows
        .filter((s) => s.status === ShipmentStatus.Pending && eqAddress(s.to, account))
        .reverse()
      outgoing.value = rows
        .filter((s) => s.status === ShipmentStatus.Pending && eqAddress(s.from, account))
        .reverse()
    } catch (err) {
      console.error('[catenta] shipments load failed', err)
    }
  }

  async function declareShipment(lotId: number, quantity: bigint, to: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.declareShipment(lotId, quantity, to)
    await tx.wait()
    await Promise.all([load(), credits.refresh(), refreshIncoming()])
    return tx.hash as string
  }

  async function acceptShipment(id: number) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.acceptShipment(id)
    await tx.wait()
    // Gratuit : l'expéditeur a déjà payé la déclaration.
    await Promise.all([load(), refreshIncoming()])
    return tx.hash as string
  }

  async function cancelShipment(id: number) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.lifecycle.cancelShipment(id)
    await tx.wait()
    await Promise.all([load(), refreshIncoming()])
    return tx.hash as string
  }

  return {
    list,
    incoming,
    outgoing,
    loading,
    journeyLoading,
    error,
    load,
    loadJourney,
    declareLot,
    refreshIncoming,
    declareShipment,
    acceptShipment,
    cancelShipment,
  }
})
