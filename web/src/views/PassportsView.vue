<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">{{ t('passports.eyebrow') }}</p>
        <h1 class="mt-2">{{ t('passports.title') }}</h1>
        <p class="subtitle">{{ t('passports.subtitle') }}</p>
      </div>
      <UiButton v-if="roles.isLab" @click="showForm = !showForm">
        {{ showForm ? t('common.close') : t('passports.mint') }}
      </UiButton>
    </div>

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
              #{{ lot.id }} — {{ formatQuantity(lot.mine) }} {{ t('lots.remaining') }}
            </option>
          </select>
          <p v-if="!myLots.length" class="hint">{{ t('passports.noLot') }}</p>
        </div>
        <div>
          <label class="label">{{ t('passports.quantityLabel') }}</label>
          <input v-model="quantity" class="input" type="number" min="1" step="1" placeholder="150" />
          <p class="hint">{{ t('passports.quantityHint') }}</p>
        </div>
        <div class="sm:col-span-2">
          <HashInput v-model="conformityHash" :label="t('passports.conformityLabel')" />
        </div>
        <div class="sm:col-span-2 flex flex-wrap items-center gap-3">
          <UiButton type="submit" :loading="busy" :disabled="!canMint">
            {{ t('passports.mint') }}
          </UiButton>
        </div>
      </form>
    </UiCard>

    <!-- Filtre -->
    <div class="mt-6 flex flex-wrap gap-2">
      <button
        v-for="s in scopes"
        :key="s"
        type="button"
        :class="[
          'rounded-md px-3 py-1.5 text-xs font-semibold transition',
          scope === s ? 'bg-teal text-white' : 'bg-slate-panel text-navy-soft hover:bg-teal-soft',
        ]"
        @click="setScope(s)"
      >
        {{ t(`passports.scope.${s}`) }}
      </button>
    </div>

    <div v-if="passports.loading" class="mt-8 text-sm text-slate-muted">{{ t('common.loading') }}</div>

    <UiCard v-else-if="!passports.list.length" tone="panel" class="mt-6">
      <p class="text-sm text-navy-soft">{{ t(`passports.empty.${scope}`) }}</p>
    </UiCard>

    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="p in passports.list"
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
            <dd class="font-semibold text-navy">#{{ p.lotId }}</dd>
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
          {{ t('passports.handoffPending') }}
        </p>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import HashInput from '@/components/HashInput.vue'
import { formatDate, formatQuantity } from '@/lib/format'
import { parseError } from '@/lib/contracts'
import { eqAddress } from '@/lib/format'
import { useCatentaStore } from '@/stores/catenta'
import { usePassportsStore } from '@/stores/passports'
import { useLotsStore } from '@/stores/lots'
import { useRolesStore } from '@/stores/roles'
import { useWalletStore } from '@/stores/wallet'
import { useToastsStore } from '@/stores/toasts'

const { t } = useI18n()
const catenta = useCatentaStore()
const passports = usePassportsStore()
const lots = useLotsStore()
const roles = useRolesStore()
const wallet = useWalletStore()
const toasts = useToastsStore()

const scopes = ['mine', 'all'] as const
type Scope = (typeof scopes)[number]
const scope = ref<Scope>('mine')

const showForm = ref(false)
const lotId = ref('')
const quantity = ref('')
const conformityHash = ref('')
const busy = ref(false)

const myLots = computed(() =>
  lots.list.filter((l) => eqAddress(l.lab, wallet.address) && l.mine > 0n),
)
const canMint = computed(
  () => !!lotId.value && Number(quantity.value) > 0 && !!conformityHash.value,
)

function reload() {
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

async function boot() {
  if (!catenta.ready) return
  await Promise.all([reload(), lots.load()])
}
onMounted(boot)
watch(() => catenta.ready, boot)
</script>
