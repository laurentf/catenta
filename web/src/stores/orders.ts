import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCatentaStore } from './catenta'
import { useCreditsStore } from './credits'
import { useWalletStore } from './wallet'
import { OrderStatus, RequestStatus } from '@/lib/contracts'
import { eqAddress } from '@/lib/format'

/**
 * Les deux flux de demande du parcours fonctionnel.
 *
 * Une COMMANDE DE MATIÈRE va d'un laboratoire ou d'un cabinet vers un
 * distributeur, et remonte au fabricant quand celui-ci est en rupture. Elle
 * aboutit à une expédition, que l'acheteur doit encore réceptionner.
 *
 * Une PRESCRIPTION va d'un praticien vers un laboratoire, et aboutit à un
 * passeport. C'est l'étape 0 du doc fonctionnel.
 *
 * Les deux se lisent par index borné, comme le reste : aucun log, aucun
 * indexeur. Chaque acteur ne garde que ce qui le concerne — ce qu'il a demandé,
 * et ce qu'on lui demande.
 */
export interface MaterialOrderRow {
  id: number
  buyer: string
  supplier: string
  material: string
  quantity: bigint
  status: OrderStatus
  parentOrderId: number
  shipmentId: number
  reason: string
}

export interface ProsthesisRequestRow {
  id: number
  practitioner: string
  lab: string
  material: string
  tooth: number
  shade: string
  description: string
  status: RequestStatus
  tokenId: number
  reason: string
}

export const useOrdersStore = defineStore('orders', () => {
  const catenta = useCatentaStore()
  const credits = useCreditsStore()
  const wallet = useWalletStore()

  /** Commandes que j'ai passées. */
  const myOrders = ref<MaterialOrderRow[]>([])
  /** Commandes qu'on m'a passées, en tant que fournisseur. */
  const incomingOrders = ref<MaterialOrderRow[]>([])
  /** Prescriptions que j'ai écrites, en tant que praticien. */
  const myRequests = ref<ProsthesisRequestRow[]>([])
  /** Prescriptions qu'on m'a adressées, en tant que laboratoire. */
  const incomingRequests = ref<ProsthesisRequestRow[]>([])
  const loading = ref(false)

  async function refresh() {
    const c = catenta.readOnly()
    const account = wallet.address
    if (!c || !account) return
    loading.value = true
    try {
      const [orderTotal, requestTotal] = await Promise.all([
        c.lifecycle.materialOrderCount(),
        c.lifecycle.prosthesisRequestCount(),
      ])

      const orders = await Promise.all(
        Array.from({ length: Number(orderTotal) }, async (_, i) => {
          const id = i + 1
          const o = await c.lifecycle.materialOrderOf(id)
          return {
            id,
            buyer: o.buyer as string,
            supplier: o.supplier as string,
            material: o.material as string,
            quantity: o.quantity as bigint,
            status: Number(o.status) as OrderStatus,
            parentOrderId: Number(o.parentOrderId),
            shipmentId: Number(o.shipmentId),
            reason: o.reason as string,
          } satisfies MaterialOrderRow
        }),
      )
      myOrders.value = orders.filter((o) => eqAddress(o.buyer, account)).reverse()
      incomingOrders.value = orders.filter((o) => eqAddress(o.supplier, account)).reverse()

      const requests = await Promise.all(
        Array.from({ length: Number(requestTotal) }, async (_, i) => {
          const id = i + 1
          const r = await c.lifecycle.prosthesisRequestOf(id)
          return {
            id,
            practitioner: r.practitioner as string,
            lab: r.lab as string,
            material: r.material as string,
            tooth: Number(r.tooth),
            shade: r.shade as string,
            description: r.description as string,
            status: Number(r.status) as RequestStatus,
            tokenId: Number(r.tokenId),
            reason: r.reason as string,
          } satisfies ProsthesisRequestRow
        }),
      )
      myRequests.value = requests.filter((r) => eqAddress(r.practitioner, account)).reverse()
      incomingRequests.value = requests.filter((r) => eqAddress(r.lab, account)).reverse()
    } catch (err) {
      console.error('[catenta] orders load failed', err)
    } finally {
      loading.value = false
    }
  }

  function writable() {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    return w
  }

  async function run(call: Promise<{ wait: () => Promise<unknown>; hash: string }>) {
    const tx = await call
    await tx.wait()
    await Promise.all([refresh(), credits.refresh()])
    return tx.hash
  }

  // ---- commandes de matière ----

  const placeOrder = (supplier: string, material: string, quantity: bigint) =>
    run(writable().lifecycle.placeMaterialOrder(supplier, material, quantity))

  /** Le distributeur en rupture commande en amont, en gardant le lien. */
  const escalateOrder = (parentOrderId: number, supplier: string, quantity: bigint) =>
    run(writable().lifecycle.escalateMaterialOrder(parentOrderId, supplier, quantity))

  const fulfilOrder = (orderId: number, lotId: number) =>
    run(writable().lifecycle.fulfilMaterialOrder(orderId, lotId))

  const refuseOrder = (orderId: number, reason: string) =>
    run(writable().lifecycle.refuseMaterialOrder(orderId, reason))

  const cancelOrder = (orderId: number, reason: string) =>
    run(writable().lifecycle.cancelMaterialOrder(orderId, reason))

  // ---- prescriptions ----

  const requestProsthesis = (
    lab: string,
    material: string,
    tooth: number,
    shade: string,
    description: string,
  ) => run(writable().lifecycle.requestProsthesis(lab, material, tooth, shade, description))

  const acceptRequest = (requestId: number) =>
    run(writable().lifecycle.acceptProsthesisRequest(requestId))

  const refuseRequest = (requestId: number, reason: string) =>
    run(writable().lifecycle.refuseProsthesisRequest(requestId, reason))

  const cancelRequest = (requestId: number, reason: string) =>
    run(writable().lifecycle.cancelProsthesisRequest(requestId, reason))

  return {
    myOrders,
    incomingOrders,
    myRequests,
    incomingRequests,
    loading,
    refresh,
    placeOrder,
    escalateOrder,
    fulfilOrder,
    refuseOrder,
    cancelOrder,
    requestProsthesis,
    acceptRequest,
    refuseRequest,
    cancelRequest,
  }
})
