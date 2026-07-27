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
        <!-- La matière vient du catalogue on-chain, pas d'une saisie libre -->
        <div>
          <label class="label">{{ t('lots.materialLabel') }}</label>
          <select v-model="materialId" class="input">
            <option value="">{{ t('lots.materialPlaceholder') }}</option>
            <option v-for="m in myMaterials" :key="m.id" :value="String(m.id)">
              {{ m.name }} ({{ m.unit }})
            </option>
          </select>
          <p v-if="!myMaterials.length" class="hint">{{ t('lots.noMaterial') }}</p>
          <p v-else class="hint">{{ t('lots.materialHint') }}</p>
        </div>
        <div>
          <label class="label">{{ t('lots.quantityLabel') }}</label>
          <div class="flex items-center gap-2">
            <input v-model="quantity" class="input" type="number" min="1" step="1" placeholder="1000" />
            <span v-if="selectedUnit" class="whitespace-nowrap text-sm font-semibold text-slate-muted">
              {{ selectedUnit }}
            </span>
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

    <!-- Le catalogue : ce que le fabricant produit, décrit une fois par produit -->
    <UiCard
      v-if="roles.isManufacturer"
      tone="panel"
      class="mt-5"
      :title="t('lots.catalogTitle')"
      :subtitle="t('lots.catalogSubtitle')"
      badge="◆"
      badge-tone="navy"
    >
      <ul v-if="myMaterials.length" class="mb-4 space-y-2">
        <li
          v-for="m in myMaterials"
          :key="m.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-card bg-white/70 px-3 py-2 text-xs"
        >
          <span class="font-bold text-navy">{{ m.name }}</span>
          <span class="text-slate-label">{{ t('lots.countedIn', { unit: m.unit }) }}</span>
        </li>
      </ul>

      <form class="grid gap-3 sm:grid-cols-[1fr_140px_auto]" @submit.prevent="submitMaterial">
        <div>
          <label class="label">{{ t('lots.materialNameLabel') }}</label>
          <input v-model="materialName" class="input" placeholder="Zircone Y-TZP A2" />
        </div>
        <div>
          <label class="label">{{ t('lots.materialUnitLabel') }}</label>
          <input v-model="materialUnit" class="input" placeholder="g" />
        </div>
        <UiButton
          type="submit"
          class="self-start sm:mt-6"
          :loading="busy === 'material'"
          :disabled="!materialName.trim() || !materialUnit.trim()"
        >
          {{ t('lots.registerMaterial') }}
        </UiButton>
      </form>
      <p class="hint mt-2">{{ t('lots.unitHint') }}</p>
    </UiCard>

    <UiAlert v-if="!roles.isManufacturer" tone="info" class="mt-6">{{ t('lots.readOnly') }}</UiAlert>

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

    <div v-else-if="!lots.list.length" class="mt-8">
      <UiCard tone="panel">
        <p class="text-sm text-navy-soft">{{ t('lots.empty') }}</p>
      </UiCard>
    </div>

    <div v-else class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiCard
        v-for="lot in lots.list"
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
            <p v-if="materials.nameOf(lot.materialId)" class="truncate text-sm font-bold text-navy">
              {{ materials.nameOf(lot.materialId) }}
            </p>
            <p
              class="mt-1 text-2xl font-extrabold"
              :class="lot.remaining > 0n ? 'text-teal' : 'text-slate-muted'"
            >
              {{ formatQuantity(lot.remaining, materials.unitOf(lot.materialId)) }}
            </p>
            <p class="text-xs text-slate-label">{{ t('lots.remaining') }}</p>
          </div>
          <div class="flex flex-none flex-col items-end gap-1">
            <span
              v-if="lot.mine > 0n"
              class="rounded-full bg-teal-soft px-2 py-0.5 text-[0.65rem] font-bold uppercase text-teal-deep"
            >
              {{ t('lots.inMyCustody', { qty: formatQuantity(lot.mine, materials.unitOf(lot.materialId)) }) }}
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
          <input
            v-model="shipTo"
            class="input mono text-xs"
            list="material-recipients"
            placeholder="0x…"
          />
          <datalist id="material-recipients">
            <option v-for="a in eligible" :key="a" :value="a" />
          </datalist>
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

        <RouterLink
          v-if="lot.devices > 0"
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
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import HashChip from '@/components/ui/HashChip.vue'
import HashInput from '@/components/HashInput.vue'
import { eqAddress, formatDate, formatQuantity, isAddress } from '@/lib/format'
import { parseError } from '@/lib/contracts'
import { useCatentaStore } from '@/stores/catenta'
import { useLotsStore, type LotRow } from '@/stores/lots'
import { useMaterialsStore } from '@/stores/materials'
import { useRolesStore } from '@/stores/roles'
import { useToastsStore } from '@/stores/toasts'
import { useCreditsStore } from '@/stores/credits'
import { useWalletStore } from '@/stores/wallet'

const { t } = useI18n()
const route = useRoute()
const catenta = useCatentaStore()
const lots = useLotsStore()
const roles = useRolesStore()
const toasts = useToastsStore()
const credits = useCreditsStore()
const wallet = useWalletStore()
const materials = useMaterialsStore()

const showForm = ref(false)
const materialId = ref('')
const certHash = ref('')
const quantity = ref('')
const busy = ref<string | null>(null)

const materialName = ref('')
const materialUnit = ref('')

/** Un fabricant ne déclare des lots que de SES propres matières. */
const myMaterials = computed(() =>
  materials.list.filter((m) => m.active && eqAddress(m.manufacturer, wallet.address)),
)
const selectedUnit = computed(() => materials.unitOf(Number(materialId.value) || null))
const unitOfLot = (lotId: number) =>
  materials.unitOf(lots.list.find((l) => l.id === lotId)?.materialId)

const shipFor = ref<number | null>(null)
const shipTo = ref('')
const shipQty = ref('')

const canDeclare = computed(
  () =>
    !!materialId.value &&
    !!certHash.value &&
    Number(quantity.value) > 0 &&
    credits.canAfford,
)

/** Arrivée depuis une fiche passeport : on met le lot en évidence. */
const highlighted = computed(() => Number(route.query.lot) || 0)

/**
 * Les acteurs autorisés à détenir de la matière, lus on-chain. Le régulateur
 * n'en fait pas partie : il lit et rappelle, il ne prend jamais la garde.
 */
const eligible = computed(() => {
  const unique = new Map<string, string>()
  for (const address of [
    ...(roles.members.MANUFACTURER ?? []),
    ...(roles.members.DISTRIBUTOR ?? []),
    ...(roles.members.LAB ?? []),
    ...(roles.members.PRACTITIONER ?? []),
  ]) {
    if (eqAddress(address, wallet.address)) continue
    unique.set(address.toLowerCase(), address)
  }
  return [...unique.values()]
})

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
  if (shipFor.value !== null) void roles.loadMembers()
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
    () => lots.declareLot(Number(materialId.value), certHash.value, BigInt(quantity.value)),
    'lots.declared',
  )
  materialId.value = ''
  certHash.value = ''
  quantity.value = ''
  showForm.value = false
}

async function submitMaterial() {
  await run(
    'material',
    () => materials.registerMaterial(materialName.value.trim(), materialUnit.value.trim()),
    'lots.materialRegistered',
  )
  materialName.value = ''
  materialUnit.value = ''
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

const accept = (id: number) => run(`accept-${id}`, () => lots.acceptShipment(id), 'lots.accepted')
const cancel = (id: number) => run(`cancel-${id}`, () => lots.cancelShipment(id), 'lots.cancelled')

async function load() {
  if (!catenta.ready) return
  await Promise.all([lots.load(), lots.refreshIncoming(), materials.load()])
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
