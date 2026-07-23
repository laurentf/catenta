<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">{{ t('lots.eyebrow') }}</p>
        <h1 class="mt-2">{{ t('lots.title') }}</h1>
        <p class="subtitle">{{ t('lots.subtitle') }}</p>
      </div>
      <UiButton v-if="roles.isLab" @click="showForm = !showForm">
        {{ showForm ? t('common.close') : t('lots.declare') }}
      </UiButton>
    </div>

    <UiCard v-if="showForm && roles.isLab" tone="mint" class="mt-6" :title="t('lots.formTitle')" badge="＋">
      <form class="grid gap-5 sm:grid-cols-2" @submit.prevent="submit">
        <HashInput v-model="certHash" :label="t('lots.certLabel')" />
        <div>
          <label class="label">{{ t('lots.quantityLabel') }}</label>
          <input v-model="quantity" class="input" type="number" min="1" step="1" placeholder="1000" />
          <p class="hint">{{ t('lots.quantityHint') }}</p>
        </div>
        <div class="sm:col-span-2 flex flex-wrap items-center gap-3">
          <UiButton type="submit" :loading="busy" :disabled="!canSubmit">
            {{ t('lots.declare') }}
          </UiButton>
        </div>
      </form>
    </UiCard>

    <UiAlert v-if="!roles.isLab" tone="info" class="mt-6">{{ t('lots.readOnly') }}</UiAlert>

    <div v-if="lots.loading" class="mt-8 text-sm text-slate-muted">{{ t('common.loading') }}</div>

    <div v-else-if="!lots.list.length" class="mt-8">
      <UiCard tone="panel">
        <p class="text-sm text-navy-soft">{{ t('lots.empty') }}</p>
      </UiCard>
    </div>

    <div v-else class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiCard v-for="lot in lots.list" :key="lot.id" class="!p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-muted">
              {{ t('lots.lot') }} #{{ lot.id }}
            </p>
            <p class="mt-1 text-2xl font-extrabold text-teal">
              {{ formatQuantity(lot.remaining) }}
            </p>
            <p class="text-xs text-slate-label">{{ t('lots.remaining') }}</p>
          </div>
          <span
            v-if="lot.mine > 0n"
            class="rounded-full bg-teal-soft px-2 py-0.5 text-[0.65rem] font-bold uppercase text-teal-deep"
          >
            {{ t('lots.mine') }}
          </span>
        </div>

        <dl class="mt-4 space-y-2 text-xs">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-slate-label">{{ t('lots.lab') }}</dt>
            <dd><AddressChip :address="lot.lab" /></dd>
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
      </UiCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import HashChip from '@/components/ui/HashChip.vue'
import HashInput from '@/components/HashInput.vue'
import { formatDate, formatQuantity } from '@/lib/format'
import { parseError } from '@/lib/contracts'
import { useCatentaStore } from '@/stores/catenta'
import { useLotsStore } from '@/stores/lots'
import { useRolesStore } from '@/stores/roles'
import { useToastsStore } from '@/stores/toasts'

const { t } = useI18n()
const catenta = useCatentaStore()
const lots = useLotsStore()
const roles = useRolesStore()
const toasts = useToastsStore()

const showForm = ref(false)
const certHash = ref('')
const quantity = ref('')
const busy = ref(false)

const canSubmit = computed(() => !!certHash.value && Number(quantity.value) > 0)

async function submit() {
  busy.value = true
  try {
    await toasts.run(() => lots.declareLot(certHash.value, BigInt(quantity.value)), {
      pending: t('toast.pending'),
      success: t('lots.declared'),
      error: (err) => t(parseError(err).key),
    })
    certHash.value = ''
    quantity.value = ''
    showForm.value = false
  } catch {
    /* toast déjà affiché */
  } finally {
    busy.value = false
  }
}

onMounted(() => catenta.ready && lots.load())
watch(() => catenta.ready, (ready) => ready && lots.load())
</script>
