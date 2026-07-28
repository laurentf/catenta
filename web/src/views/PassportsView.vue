<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">{{ t('passports.eyebrow') }}</p>
        <h1 class="mt-2">{{ t('passports.title') }}</h1>
        <p class="subtitle">{{ t('passports.subtitle') }}</p>
      </div>
      <UiButton v-if="roles.isLab" :disabled="!credits.canAfford" @click="showForm = !showForm">
        {{ showForm ? t('common.close') : t('passports.mint') }}
      </UiButton>
    </div>

    <UiAlert v-if="roles.isLab && !credits.canAfford" tone="warn" class="mt-6">
      {{ t('credits.insufficient', { cost: credits.actionCost, balance: credits.balance }) }}
    </UiAlert>

    <!-- Mint : réservé au laboratoire, et il consomme de la matière -->
    <UiCard
      v-if="showForm && roles.isLab"
      tone="mint"
      class="mt-6"
      :title="t('passports.formTitle')"
      :subtitle="t('passports.formSubtitle')"
      badge="＋"
    >
      <form class="grid gap-5 sm:grid-cols-2" @submit.prevent="submitMint">
        <div>
          <label class="label">{{ t('passports.lotLabel') }}</label>
          <select v-model="lotId" class="input">
            <option value="">{{ t('passports.lotPlaceholder') }}</option>
            <option v-for="lot in myLots" :key="lot.id" :value="String(lot.id)">
              #{{ lot.id }} — {{ lot.material }} — {{ formatQuantity(lot.mine, lot.unit) }}
            </option>
          </select>
          <p v-if="!myLots.length" class="hint">{{ t('passports.noLot') }}</p>
        </div>
        <div>
          <label class="label">{{ t('passports.quantityLabel') }}</label>
          <div class="flex items-center gap-2">
            <input v-model="quantity" class="input" type="number" min="1" step="1" placeholder="150" />
            <span v-if="selectedUnit" class="whitespace-nowrap text-sm font-semibold text-slate-muted">
              {{ selectedUnit }}
            </span>
          </div>
          <!-- Ce qu'il restera : la conséquence de la signature, avant la signature -->
          <p v-if="preview" class="hint font-semibold text-teal-deep">{{ preview }}</p>
          <p v-else class="hint">{{ t('passports.quantityHint') }}</p>
        </div>
        <div class="sm:col-span-2">
          <HashInput v-model="conformityHash" :label="t('passports.conformityLabel')" />
        </div>
        <div class="sm:col-span-2 flex flex-wrap items-center gap-3">
          <UiButton type="submit" :loading="busy" :disabled="!canMint">
            {{ t('passports.mint') }}
          </UiButton>
          <p v-if="overdraft" class="text-xs font-semibold text-amber-deep">
            {{ t('passports.overdraft') }}
          </p>
        </div>
      </form>
    </UiCard>

    <!-- Filtre -->
    <div class="mt-6 flex flex-wrap items-center gap-2">
      <button
        v-for="s in scopes"
        :key="s"
        type="button"
        :class="[
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
          scope === s ? 'bg-teal text-white' : 'bg-slate-panel text-navy-soft hover:bg-teal-soft',
        ]"
        @click="setScope(s)"
      >
        {{ t(`passports.scope.${s}`) }}
        <span
          v-if="s === 'pending' && passports.pendingForMe.length"
          :class="[
            'rounded-full px-1.5 text-[0.65rem] font-bold',
            scope === s ? 'bg-white text-teal-deep' : 'bg-amber-deep text-white',
          ]"
        >
          {{ passports.pendingForMe.length }}
        </span>
      </button>

      <!-- Arrivée depuis une carte de lot -->
      <RouterLink
        v-if="lotFilter"
        :to="{ name: 'passports' }"
        class="inline-flex items-center gap-1.5 rounded-md bg-teal-soft px-3 py-1.5
               text-xs font-semibold text-teal-deep transition hover:bg-teal hover:text-white"
      >
        {{ t('lots.lot') }} #{{ lotFilter }}
        <span aria-hidden="true">✕</span>
      </RouterLink>
    </div>

    <UiAlert v-if="scope === 'pending'" tone="info" class="mt-4">
      {{ t('passports.pendingHint') }}
    </UiAlert>

    <div v-if="passports.loading" class="mt-8 text-sm text-slate-muted">{{ t('common.loading') }}</div>

    <UiCard v-else-if="!displayed.length" tone="panel" class="mt-6">
      <p class="text-sm text-navy-soft">
        {{ lotFilter ? t('passports.empty.lot', { lot: lotFilter }) : t(`passports.empty.${scope}`) }}
      </p>
    </UiCard>

    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="p in displayed"
        :key="p.id"
        :to="{ name: 'passport', params: { id: p.id } }"
        class="card block transition hover:-translate-y-0.5 hover:shadow-lift"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-muted">
              {{ t('passports.passport') }}
            </p>
            <p class="text-2xl font-extrabold text-teal">#{{ p.id }}</p>
          </div>
          <StatusBadge :status="p.status" />
        </div>

        <dl class="mt-4 space-y-2 text-xs">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-slate-label">{{ t('passports.lot') }}</dt>
            <dd class="min-w-0 truncate font-semibold text-navy">
              #{{ p.lotId }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-slate-label">{{ t('passports.holder') }}</dt>
            <dd><AddressChip :address="p.holder" /></dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-slate-label">{{ t('passports.mintedAt') }}</dt>
            <dd class="text-navy-soft">{{ formatDate(p.mintedAt) }}</dd>
          </div>
        </dl>

        <p
          v-if="p.pendingHandoff"
          class="mt-3 rounded-md bg-peach px-2.5 py-1.5 text-[0.7rem] font-semibold text-amber-deep"
        >
          {{
            eqAddress(p.pendingHandoff, wallet.address)
              ? t('passports.handoffForMe')
              : t('passports.handoffPendingFor', { who: shortAddress(p.pendingHandoff) })
          }}
        </p>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import HashInput from '@/components/HashInput.vue'
import { formatDate, formatQuantity, eqAddress, shortAddress } from '@/lib/format'
import { parseError } from '@/lib/contracts'
import { useCatentaStore } from '@/stores/catenta'
import { usePassportsStore } from '@/stores/passports'
import { useLotsStore } from '@/stores/lots'
import { useRolesStore } from '@/stores/roles'
import { useWalletStore } from '@/stores/wallet'
import { useToastsStore } from '@/stores/toasts'
import { useCreditsStore } from '@/stores/credits'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const catenta = useCatentaStore()
const passports = usePassportsStore()
const lots = useLotsStore()
const roles = useRolesStore()
const wallet = useWalletStore()
const toasts = useToastsStore()
const credits = useCreditsStore()

/**
 * « En attente pour moi » n'est pas un confort : le destinataire d'une remise
 * ne détient pas encore le token, donc il n'apparaît dans AUCUNE des deux
 * autres listes. Sans cet onglet, une remise est introuvable.
 */
const scopes = ['mine', 'pending', 'all'] as const
type Scope = (typeof scopes)[number]
const scope = ref<Scope>('mine')

const showForm = ref(false)
const lotId = ref('')
const quantity = ref('')
const conformityHash = ref('')
const busy = ref(false)

const lotFilter = computed(() => Number(route.query.lot) || 0)

const displayed = computed(() => {
  const rows = scope.value === 'pending' ? passports.pendingForMe : passports.list
  return lotFilter.value ? rows.filter((p) => p.lotId === lotFilter.value) : rows
})

/**
 * Les lots dont J'AI LA GARDE. Ce n'est plus « les lots que j'ai déclarés » :
 * un laboratoire ne produit pas la matière, il la reçoit d'un distributeur.
 */
const myLots = computed(() => lots.list.filter((l) => l.mine > 0n))
const selectedLot = computed(() => myLots.value.find((l) => String(l.id) === lotId.value) ?? null)
const selectedUnit = computed(() => selectedLot.value?.unit ?? '')

/** Ce qu'il restera dans le lot — la conséquence, montrée avant la signature. */
const preview = computed(() => {
  const lot = selectedLot.value
  const qty = Number(quantity.value)
  if (!lot || !Number.isInteger(qty) || qty <= 0) return ''
  const left = lot.mine - BigInt(qty)
  if (left < 0n) return ''
  const unit = lot.unit
  return `${formatQuantity(lot.mine, unit)} → ${formatQuantity(left, unit)} ${t('lots.remaining')}`
})

/** La matière manque : le contrat refuserait, autant le dire tout de suite. */
const overdraft = computed(() => {
  const lot = selectedLot.value
  const qty = Number(quantity.value)
  if (!lot || !Number.isInteger(qty) || qty <= 0) return false
  return BigInt(qty) > lot.mine
})

const canMint = computed(
  () =>
    !!lotId.value &&
    Number(quantity.value) > 0 &&
    !!conformityHash.value &&
    !overdraft.value &&
    credits.canAfford,
)

function reload() {
  if (scope.value === 'pending') return passports.refreshPending()
  return scope.value === 'mine' ? passports.loadMine() : passports.loadAll()
}
function setScope(s: Scope) {
  scope.value = s
  void reload()
}

async function submitMint() {
  busy.value = true
  try {
    await toasts.run(
      () => passports.mintPassport(Number(lotId.value), BigInt(quantity.value), conformityHash.value),
      { pending: t('toast.pending'), success: t('passports.minted'), error: (err) => t(parseError(err).key) },
    )
    lotId.value = ''
    quantity.value = ''
    conformityHash.value = ''
    showForm.value = false
    await Promise.all([reload(), lots.load()])
  } catch {
    /* toast déjà affiché */
  } finally {
    busy.value = false
  }
}

/**
 * Un fabricant atterrit ici après connexion (c'est la route par défaut) alors
 * que les prothèses ne le concernent pas. On le renvoie vers la matière plutôt
 * que de lui afficher un écran sans usage.
 *
 * On ne bloque en revanche PAS la fiche d'une prothèse : un enregistrement
 * public reste lisible par qui l'ouvre délibérément. Ce qu'on retire, c'est le
 * bruit, pas un droit — la chaîne est publique de toute façon.
 */
watch(
  () => [roles.loading, roles.seesPassports] as const,
  ([loading, sees]) => {
    if (!loading && !sees) void router.replace({ name: 'lots' })
  },
  { immediate: true },
)

async function boot() {
  if (!catenta.ready) return
  // « Les dispositifs de ce lot » porte sur tout le registre : arriver depuis
  // une carte de lot sur l'onglet « les miens » ne montrerait presque rien.
  if (lotFilter.value && scope.value === 'mine') scope.value = 'all'
  // La pastille « à accepter » doit être juste quel que soit l'onglet ouvert.
  const tasks = [reload(), lots.load()]
  if (scope.value !== 'pending') tasks.push(passports.refreshPending())
  await Promise.all(tasks)
}
onMounted(boot)
watch(() => [catenta.ready, route.query.lot], boot)
</script>
