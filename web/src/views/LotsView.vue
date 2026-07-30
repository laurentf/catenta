<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">{{ t('lots.eyebrow') }}</p>
        <h1 class="mt-2">{{ t('lots.title') }}</h1>
        <p class="subtitle">{{ t('lots.subtitle') }}</p>
      </div>
      <UiButton
        v-if="roles.isManufacturer"
        :disabled="!credits.canAfford"
        @click="showForm = !showForm"
      >
        {{ showForm ? t('common.close') : t('lots.declare') }}
      </UiButton>
    </div>

    <UiAlert v-if="roles.isManufacturer && !credits.canAfford" tone="warn" class="mt-6">
      {{ t('credits.insufficient', { cost: credits.actionCost, balance: credits.balance }) }}
    </UiAlert>

    <!-- Déclaration : réservée au fabricant, premier maillon de la chaîne -->
    <UiCard
      v-if="showForm && roles.isManufacturer"
      tone="mint"
      class="mt-6"
      :title="t('lots.formTitle')"
      :subtitle="t('lots.formSubtitle')"
      badge="＋"
    >
      <form class="grid gap-5 sm:grid-cols-2" @submit.prevent="submitDeclare">
        <!-- Le sélecteur n'est qu'une aide : la matière part on-chain avec le lot -->
        <div>
          <label class="label">{{ t('lots.materialLabel') }}</label>
          <input v-model="material" class="input" list="material-picker" placeholder="Zircone Y-TZP A2" />
          <datalist id="material-picker">
            <option v-for="m in picker" :key="m.name" :value="m.name">{{ m.unit }}</option>
          </datalist>
          <p class="hint">{{ t('lots.materialHint') }}</p>
        </div>
        <div>
          <label class="label">{{ t('lots.quantityLabel') }}</label>
          <div class="flex items-center gap-2">
            <input v-model="quantity" class="input" type="number" min="1" step="1" placeholder="1000" />
            <input v-model="unit" class="input !w-28" placeholder="g" />
          </div>
          <p class="hint">{{ t('lots.quantityHint') }}</p>
        </div>
        <div class="sm:col-span-2">
          <HashInput v-model="certHash" :label="t('lots.certLabel')" />
        </div>
        <div class="sm:col-span-2">
          <UiButton type="submit" :loading="busy === 'declare'" :disabled="!canDeclare">
            {{ t('lots.declare') }}
          </UiButton>
        </div>
      </form>
    </UiCard>

    <UiAlert v-if="!roles.isManufacturer" tone="info" class="mt-6">{{ t('lots.readOnly') }}</UiAlert>

    <!-- Commander de la matière : c'est par là que le laboratoire s'approvisionne -->
    <UiCard
      v-if="roles.seesMaterial && !roles.isManufacturer"
      tone="mint"
      class="mt-6"
      :title="t('orders.placeTitle')"
      :subtitle="t('orders.placeSubtitle')"
      badge="⇄"
    >
      <form class="grid gap-4 sm:grid-cols-[1fr_1fr_140px_auto]" @submit.prevent="submitOrder">
        <ActorSelect
          v-model="orderSupplier"
          :roles="SUPPLIERS"
          :label="t('orders.supplier')"
          :placeholder="t('orders.supplierPlaceholder')"
        />
        <div>
          <label class="label">{{ t('lots.materialLabel') }}</label>
          <input v-model="orderMaterial" class="input" list="material-picker" placeholder="Zircone Y-TZP A2" />
        </div>
        <div>
          <label class="label">{{ t('lots.quantityLabel') }}</label>
          <input v-model="orderQuantity" class="input" type="number" min="1" step="1" placeholder="250" />
        </div>
        <UiButton
          type="submit"
          class="self-start sm:mt-6"
          :loading="busy === 'order'"
          :disabled="!canOrder"
        >
          {{ t('orders.place') }}
        </UiButton>
      </form>
    </UiCard>

    <!-- Commandes qu'on m'a passées -->
    <UiCard
      v-if="orders.incomingOrders.length"
      tone="panel"
      class="mt-5"
      :title="t('orders.incomingTitle')"
      :subtitle="t('orders.incomingSubtitle')"
      badge="◧"
      badge-tone="navy"
    >
      <ul class="space-y-3">
        <li v-for="o in orders.incomingOrders" :key="o.id" class="rounded-card bg-white/70 px-3 py-2.5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs">
              <p class="font-bold text-navy">
                {{ formatQuantity(o.quantity) }} — {{ o.material }}
                <span :class="orderTone(o.status)">{{ t(`orders.status.${o.status}`) }}</span>
              </p>
              <p class="mt-0.5 flex items-center gap-1.5 text-slate-label">
                {{ t('orders.from') }} <AddressChip :address="o.buyer" />
                <span v-if="o.parentOrderId">· {{ t('orders.escalatedFrom', { id: o.parentOrderId }) }}</span>
              </p>
              <p v-if="o.reason" class="mt-0.5 text-slate-muted">« {{ o.reason }} »</p>
            </div>
            <div v-if="o.status === OrderStatus.Pending" class="flex flex-wrap gap-2">
              <UiButton size="sm" :loading="busy === `fulfil-${o.id}`" @click="openFulfil(o.id)">
                {{ t('orders.fulfil') }}
              </UiButton>
              <UiButton size="sm" variant="ghost" @click="openRefuse(o.id)">
                {{ t('orders.refuse') }}
              </UiButton>
            </div>
          </div>

          <!-- Honorer : on choisit le lot dans lequel on puise -->
          <form v-if="fulfilFor === o.id" class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]" @submit.prevent="submitFulfil(o)">
            <select v-model="fulfilLot" class="input text-xs">
              <option value="">{{ t('orders.pickLot') }}</option>
              <option v-for="l in lotsMatching(o.material)" :key="l.id" :value="String(l.id)">
                {{ t('lots.lot') }} #{{ l.id }} — {{ formatQuantity(l.mine, l.unit) }}
              </option>
            </select>
            <UiButton type="submit" size="sm" :loading="busy === `fulfil-${o.id}`" :disabled="!fulfilLot">
              {{ t('orders.fulfil') }}
            </UiButton>
            <p v-if="!lotsMatching(o.material).length" class="hint sm:col-span-2">
              {{ t('orders.noMatchingLot') }}
            </p>
          </form>

          <!-- Refuser : le motif est obligatoire, et lisible par l'acheteur -->
          <form v-if="refuseFor === o.id" class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]" @submit.prevent="submitRefuse(o.id)">
            <input v-model="reason" class="input text-xs" :placeholder="t('orders.reasonPlaceholder')" />
            <UiButton type="submit" size="sm" variant="ghost" :loading="busy === `refuse-${o.id}`" :disabled="!reason.trim()">
              {{ t('orders.refuse') }}
            </UiButton>
            <p class="hint sm:col-span-2">{{ t('orders.escalateHint') }}</p>
          </form>
        </li>
      </ul>
    </UiCard>

    <!-- Mes commandes -->
    <UiCard
      v-if="orders.myOrders.length"
      tone="panel"
      class="mt-5"
      :title="t('orders.mineTitle')"
      badge="◨"
      badge-tone="navy"
    >
      <ul class="space-y-2">
        <li
          v-for="o in orders.myOrders"
          :key="o.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white/70 px-3 py-2 text-xs"
        >
          <div>
            <p class="font-bold text-navy">
              {{ formatQuantity(o.quantity) }} — {{ o.material }}
              <span :class="orderTone(o.status)">{{ t(`orders.status.${o.status}`) }}</span>
            </p>
            <p class="mt-0.5 flex items-center gap-1.5 text-slate-label">
              {{ t('orders.to') }} <AddressChip :address="o.supplier" />
            </p>
            <p v-if="o.reason" class="mt-0.5 text-slate-muted">« {{ o.reason }} »</p>
          </div>
          <UiButton
            v-if="o.status === OrderStatus.Pending"
            size="sm"
            variant="ghost"
            @click="openCancel(o.id)"
          >
            {{ t('orders.cancel') }}
          </UiButton>
          <form
            v-if="cancelFor === o.id"
            class="flex w-full gap-2"
            @submit.prevent="submitCancel(o.id)"
          >
            <input v-model="reason" class="input text-xs" :placeholder="t('orders.reasonPlaceholder')" />
            <UiButton type="submit" size="sm" variant="ghost" :loading="busy === `cancel-order-${o.id}`" :disabled="!reason.trim()">
              {{ t('orders.cancel') }}
            </UiButton>
          </form>
        </li>
      </ul>
    </UiCard>

    <!-- Réceptions en attente : sans ça, la matière n'arrive jamais -->
    <UiCard
      v-if="lots.incoming.length"
      tone="mint"
      class="mt-6"
      :title="t('lots.incomingTitle')"
      :subtitle="t('lots.incomingSubtitle')"
      badge="↓"
    >
      <ul class="space-y-3">
        <li
          v-for="s in lots.incoming"
          :key="s.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white/70 px-3 py-2.5"
        >
          <div class="text-xs">
            <p class="font-bold text-navy">
              {{ t('lots.lot') }} #{{ s.lotId }} — {{ formatQuantity(s.quantity, unitOfLot(s.lotId)) }}
            </p>
            <p class="mt-0.5 flex items-center gap-1.5 text-slate-label">
              {{ t('lots.shippedBy') }} <AddressChip :address="s.from" />
            </p>
          </div>
          <UiButton size="sm" :loading="busy === `accept-${s.id}`" @click="accept(s.id)">
            {{ t('lots.accept') }}
          </UiButton>
        </li>
      </ul>
    </UiCard>

    <!-- Expéditions déclarées, en attente d'acceptation -->
    <UiCard
      v-if="lots.outgoing.length"
      tone="panel"
      class="mt-5"
      :title="t('lots.outgoingTitle')"
      :subtitle="t('lots.outgoingSubtitle')"
      badge="↑"
      badge-tone="navy"
    >
      <ul class="space-y-3">
        <li
          v-for="s in lots.outgoing"
          :key="s.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white/70 px-3 py-2.5"
        >
          <div class="text-xs">
            <p class="font-bold text-navy">
              {{ t('lots.lot') }} #{{ s.lotId }} — {{ formatQuantity(s.quantity, unitOfLot(s.lotId)) }}
            </p>
            <p class="mt-0.5 flex items-center gap-1.5 text-slate-label">
              {{ t('lots.shippedTo') }} <AddressChip :address="s.to" />
            </p>
          </div>
          <UiButton size="sm" variant="ghost" :loading="busy === `cancel-${s.id}`" @click="cancel(s.id)">
            {{ t('lots.cancel') }}
          </UiButton>
        </li>
      </ul>
    </UiCard>

    <div v-if="lots.loading" class="mt-8 text-sm text-slate-muted">{{ t('common.loading') }}</div>

    <div v-else-if="!visibleLots.length" class="mt-8">
      <UiCard tone="panel">
        <p class="text-sm text-navy-soft">
          {{ roles.isManufacturer ? t('lots.emptyManufacturer') : t('lots.emptyHolder') }}
        </p>
      </UiCard>
    </div>

    <div v-else class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiCard
        v-for="lot in visibleLots"
        :id="`lot-${lot.id}`"
        :key="lot.id"
        class="!p-5 scroll-mt-24 transition"
        :class="lot.id === highlighted ? 'ring-2 ring-teal ring-offset-2' : ''"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <RouterLink
              :to="{ name: 'lot', params: { id: lot.id } }"
              class="text-xs font-bold uppercase tracking-wider text-slate-muted transition hover:text-teal"
            >
              {{ t('lots.lot') }} #{{ lot.id }} →
            </RouterLink>
            <!-- Nom et unité viennent du catalogue on-chain -->
            <p v-if="lot.material" class="truncate text-sm font-bold text-navy">
              {{ lot.material }}
            </p>
            <p
              class="mt-1 text-2xl font-extrabold"
              :class="headlineQuantity(lot) > 0n ? 'text-teal' : 'text-slate-muted'"
            >
              {{ formatQuantity(headlineQuantity(lot), lot.unit) }}
            </p>
            <p class="text-xs text-slate-label">{{ headlineLabel(lot) }}</p>
            <p v-if="!isOwnProduction(lot)" class="text-[0.7rem] text-slate-muted">
              {{
                t('lots.outOfCirculating', {
                  total: formatQuantity(lot.remaining, lot.unit),
                })
              }}
            </p>
          </div>
          <div class="flex flex-none flex-col items-end gap-1">
            <span
              v-if="isOwnProduction(lot) && lot.mine > 0n"
              class="rounded-full bg-teal-soft px-2 py-0.5 text-[0.65rem] font-bold uppercase text-teal-deep"
            >
              {{ t('lots.inMyCustody', { qty: formatQuantity(lot.mine, lot.unit) }) }}
            </span>
            <span
              v-if="lot.remaining === 0n"
              class="rounded-full bg-slate-panel px-2 py-0.5 text-[0.65rem] font-bold uppercase text-slate-muted"
            >
              {{ t('lots.exhausted') }}
            </span>
          </div>
        </div>

        <dl class="mt-4 space-y-2 text-xs">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-slate-label">{{ t('lots.manufacturer') }}</dt>
            <dd><AddressChip :address="lot.manufacturer" /></dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-slate-label">{{ t('lots.cert') }}</dt>
            <dd><HashChip :value="lot.certHash" /></dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-slate-label">{{ t('lots.declaredAt') }}</dt>
            <dd class="text-navy-soft">{{ formatDate(lot.declaredAt) }}</dd>
          </div>
        </dl>

        <!-- Expédier : ouvert à quiconque détient de la matière -->
        <UiButton
          v-if="lot.mine > 0n"
          size="sm"
          variant="secondary"
          class="mt-4 w-full"
          :disabled="!credits.canAfford"
          @click="openShip(lot.id)"
        >
          {{ shipFor === lot.id ? t('common.close') : t('lots.ship') }}
        </UiButton>

        <form v-if="shipFor === lot.id" class="mt-3 space-y-2" @submit.prevent="submitShip(lot)">
          <ActorSelect
            v-model="shipTo"
            :roles="MATERIAL_HOLDERS"
            :placeholder="t('lots.shipToPlaceholder')"
          />
          <input
            v-model="shipQty"
            class="input text-xs"
            type="number"
            min="1"
            step="1"
            :max="Number(lot.mine)"
            :placeholder="t('lots.quantityLabel')"
          />
          <p class="hint">{{ t('lots.shipHint') }}</p>
          <UiButton
            type="submit"
            size="sm"
            block
            :loading="busy === `ship-${lot.id}`"
            :disabled="!canShip(lot)"
          >
            {{ t('lots.ship') }}
          </UiButton>
        </form>

        <p
          v-if="lot.devices > 0 && !roles.seesPassports"
          class="mt-4 rounded-md bg-slate-panel px-2.5 py-2 text-xs font-semibold text-navy-soft"
        >
          {{ t('lots.devices', lot.devices) }}
        </p>
        <RouterLink
          v-else-if="lot.devices > 0"
          :to="{ name: 'passports', query: { lot: lot.id } }"
          class="mt-4 flex items-center justify-between gap-2 rounded-md bg-teal-soft px-2.5 py-2
                 text-xs font-semibold text-teal-deep transition hover:bg-teal hover:text-white"
        >
          {{ t('lots.devices', lot.devices) }}
          <span aria-hidden="true">→</span>
        </RouterLink>
        <p v-else class="mt-4 text-xs text-slate-muted">{{ t('lots.noDevice') }}</p>
      </UiCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import HashChip from '@/components/ui/HashChip.vue'
import HashInput from '@/components/HashInput.vue'
import ActorSelect from '@/components/ActorSelect.vue'
import { eqAddress, formatDate, formatQuantity, isAddress } from '@/lib/format'
import { OrderStatus, parseError, type RoleKey } from '@/lib/contracts'

/** Les acteurs autorisés à détenir de la matière — le régulateur n'en est pas. */
const MATERIAL_HOLDERS: RoleKey[] = ['MANUFACTURER', 'DISTRIBUTOR', 'LAB', 'PRACTITIONER']
/** À qui l'on commande : un distributeur, ou le fabricant directement. */
const SUPPLIERS: RoleKey[] = ['DISTRIBUTOR', 'MANUFACTURER']
import { useCatentaStore } from '@/stores/catenta'
import { useLotsStore, type LotRow } from '@/stores/lots'
import { useRolesStore } from '@/stores/roles'
import { useToastsStore } from '@/stores/toasts'
import { useCreditsStore } from '@/stores/credits'
import { useOrdersStore } from '@/stores/orders'
import { useWalletStore } from '@/stores/wallet'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const catenta = useCatentaStore()
const lots = useLotsStore()
const roles = useRolesStore()
const toasts = useToastsStore()
const credits = useCreditsStore()
const orders = useOrdersStore()
const wallet = useWalletStore()

const showForm = ref(false)
const material = ref('')
const unit = ref('')
const certHash = ref('')
const quantity = ref('')
const busy = ref<string | null>(null)

/**
 * Le sélecteur de matières, hors chaîne et sans autorité : il sert à ce que
 * deux fabricants écrivent la même chose et à rattacher l'unité à la matière.
 * Le lot, lui, part on-chain avec les deux valeurs — perdre ce fichier ne rend
 * aucune quantité illisible.
 */
const picker = ref<{ name: string; unit: string }[]>([])

/** Choisir une matière connue remplit son unité, sans jamais l'imposer. */
watch(material, (name) => {
  const match = picker.value.find((m) => m.name === name)
  if (match) unit.value = match.unit
})

const unitOfLot = (lotId: number) => lots.list.find((l) => l.id === lotId)?.unit ?? ''

const orderSupplier = ref('')
const orderMaterial = ref('')
const orderQuantity = ref('')
const fulfilFor = ref<number | null>(null)
const fulfilLot = ref('')
const refuseFor = ref<number | null>(null)
const cancelFor = ref<number | null>(null)
const reason = ref('')

const canOrder = computed(
  () =>
    !!orderSupplier.value &&
    !!orderMaterial.value.trim() &&
    Number(orderQuantity.value) > 0 &&
    credits.canAfford,
)

/** Les lots dont j'ai la garde et qui portent la matière commandée. */
const lotsMatching = (material: string) =>
  lots.list.filter((l) => l.mine > 0n && l.material === material)

function orderTone(status: OrderStatus) {
  const base = 'ml-2 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase '
  if (status === OrderStatus.Fulfilled) return base + 'bg-teal-soft text-teal-deep'
  if (status === OrderStatus.Pending) return base + 'bg-peach text-amber-deep'
  return base + 'bg-slate-panel text-slate-muted'
}

function closeOrderForms() {
  fulfilFor.value = null
  refuseFor.value = null
  cancelFor.value = null
  reason.value = ''
  fulfilLot.value = ''
}
const openFulfil = (id: number) => {
  const open = fulfilFor.value === id
  closeOrderForms()
  fulfilFor.value = open ? null : id
}
const openRefuse = (id: number) => {
  const open = refuseFor.value === id
  closeOrderForms()
  refuseFor.value = open ? null : id
}
const openCancel = (id: number) => {
  const open = cancelFor.value === id
  closeOrderForms()
  cancelFor.value = open ? null : id
}

const shipFor = ref<number | null>(null)
const shipTo = ref('')
const shipQty = ref('')

/**
 * Ce que chaque acteur a besoin de voir dans « Matière ».
 *
 * Un fabricant suit SA production — y compris les lots qu'il a entièrement
 * expédiés, dont il reste l'origine et donc le responsable en cas de rappel.
 * Les autres ne voient que ce dont ils ont la garde : un distributeur n'a que
 * faire du catalogue de lots d'un concurrent. Le régulateur, l'admin et un
 * visiteur sans rôle voient tout — le registre est public.
 */
const visibleLots = computed(() => {
  if (roles.seesEverything) return lots.list
  return lots.list.filter(
    (l) => l.mine > 0n || eqAddress(l.manufacturer, wallet.address),
  )
})

/** Un lot que J'AI produit — par opposition à un lot dont j'ai seulement la garde. */
const isOwnProduction = (lot: LotRow) => eqAddress(lot.manufacturer, wallet.address)

/**
 * Le chiffre mis en avant n'est pas le même selon qui regarde : le fabricant
 * suit ce qu'il reste de SON lot en circulation, un détenteur suit ce qu'il a
 * en stock. Afficher le total à un labo qui n'en détient que 200 g le
 * tromperait sur ce qu'il peut consommer.
 */
function headlineQuantity(lot: LotRow): bigint {
  return isOwnProduction(lot) ? lot.remaining : lot.mine
}
function headlineLabel(lot: LotRow): string {
  return isOwnProduction(lot) ? t('lots.remaining') : t('lots.inCustody')
}

const canDeclare = computed(
  () =>
    !!material.value.trim() &&
    !!unit.value.trim() &&
    !!certHash.value &&
    Number(quantity.value) > 0 &&
    credits.canAfford,
)

/** Arrivée depuis une fiche passeport : on met le lot en évidence. */
const highlighted = computed(() => Number(route.query.lot) || 0)

function canShip(lot: LotRow): boolean {
  const qty = Number(shipQty.value)
  return (
    isAddress(shipTo.value) &&
    Number.isInteger(qty) &&
    qty > 0 &&
    BigInt(qty) <= lot.mine &&
    credits.canAfford
  )
}

function openShip(lotId: number) {
  shipFor.value = shipFor.value === lotId ? null : lotId
  shipTo.value = ''
  shipQty.value = ''
}

function run(key: string, fn: () => Promise<string>, successKey: string) {
  busy.value = key
  return toasts
    .run(fn, {
      pending: t('toast.pending'),
      success: t(successKey),
      error: (err) => t(parseError(err).key),
    })
    .catch(() => {
      /* toast déjà affiché */
    })
    .finally(() => {
      busy.value = null
    })
}

async function submitDeclare() {
  await run(
    'declare',
    () =>
      lots.declareLot(
        material.value.trim(),
        unit.value.trim(),
        certHash.value,
        BigInt(quantity.value),
      ),
    'lots.declared',
  )
  material.value = ''
  unit.value = ''
  certHash.value = ''
  quantity.value = ''
  showForm.value = false
}

async function submitShip(lot: LotRow) {
  await run(
    `ship-${lot.id}`,
    () => lots.declareShipment(lot.id, BigInt(shipQty.value), shipTo.value.trim()),
    'lots.shipped',
  )
  shipFor.value = null
  shipTo.value = ''
  shipQty.value = ''
}

async function submitOrder() {
  await run(
    'order',
    () => orders.placeOrder(orderSupplier.value, orderMaterial.value.trim(), BigInt(orderQuantity.value)),
    'orders.placed',
  )
  orderSupplier.value = ''
  orderMaterial.value = ''
  orderQuantity.value = ''
}

async function submitFulfil(order: { id: number }) {
  await run(`fulfil-${order.id}`, () => orders.fulfilOrder(order.id, Number(fulfilLot.value)), 'orders.fulfilled')
  closeOrderForms()
  await lots.refreshIncoming()
}
async function submitRefuse(id: number) {
  await run(`refuse-${id}`, () => orders.refuseOrder(id, reason.value.trim()), 'orders.refused')
  closeOrderForms()
}
async function submitCancel(id: number) {
  await run(`cancel-order-${id}`, () => orders.cancelOrder(id, reason.value.trim()), 'orders.cancelled')
  closeOrderForms()
}

const accept = (id: number) => run(`accept-${id}`, () => lots.acceptShipment(id), 'lots.accepted')
const cancel = (id: number) => run(`cancel-${id}`, () => lots.cancelShipment(id), 'lots.cancelled')

/** Le sélecteur est un simple fichier statique ; son absence ne bloque rien. */
async function loadPicker() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}materials.json`, { cache: 'no-cache' })
    if (!res.ok) return
    picker.value = (await res.json()).materials ?? []
  } catch {
    /* saisie libre, simplement */
  }
}

/** Symétrique de la vue Prothèses : personne ne reste sur un écran sans usage. */
watch(
  () => [roles.loading, roles.seesMaterial] as const,
  ([loading, sees]) => {
    if (!loading && !sees) void router.replace({ name: roles.homeRoute })
  },
  { immediate: true },
)

async function load() {
  if (!catenta.ready) return
  await Promise.all([lots.load(), lots.refreshIncoming(), orders.refresh(), loadPicker()])
  if (!highlighted.value) return
  await nextTick()
  document.getElementById(`lot-${highlighted.value}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

onMounted(load)
watch(() => [catenta.ready, route.query.lot], load)
</script>
