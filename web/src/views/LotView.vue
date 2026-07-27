<template>
  <div>
    <RouterLink :to="{ name: 'lots' }" class="text-xs font-semibold text-slate-muted hover:text-teal">
      ← {{ t('common.back') }}
    </RouterLink>

    <div v-if="lots.journeyLoading" class="mt-6 text-sm text-slate-muted">
      {{ t('common.loading') }}
    </div>

    <UiAlert v-else-if="!journey" tone="warn" class="mt-6">{{ t('errors.unknownLot') }}</UiAlert>

    <template v-else>
      <div class="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <p class="eyebrow">{{ t('lot.eyebrow') }}</p>
          <h1 class="mt-2">{{ t('lots.lot') }} #{{ journey.id }}</h1>
          <p class="subtitle">
            {{ materials.nameOf(journey.materialId) ?? t('lot.unknownMaterial') }}
          </p>
        </div>
        <div class="text-right">
          <p
            class="text-3xl font-extrabold"
            :class="journey.remaining > 0n ? 'text-teal' : 'text-slate-muted'"
          >
            {{ formatQuantity(journey.remaining, unit) }}
          </p>
          <p class="text-xs text-slate-label">{{ t('lots.remaining') }}</p>
        </div>
      </div>

      <div class="mt-8 grid gap-5 lg:grid-cols-3">
        <!-- Le parcours, reconstitué depuis le storage : aucun event lu -->
        <UiCard class="lg:col-span-2" :title="t('lot.journeyTitle')" :subtitle="t('lot.journeySubtitle')" badge="⟶">
          <ol class="space-y-4">
            <li v-for="(step, i) in steps" :key="i" class="flex gap-4">
              <span
                :class="[
                  'mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold',
                  step.tone === 'done' ? 'bg-teal text-white' : '',
                  step.tone === 'void' ? 'bg-slate-panel text-slate-muted line-through' : '',
                  step.tone === 'wait' ? 'bg-peach text-amber-deep' : '',
                ]"
              >
                {{ step.icon }}
              </span>
              <div class="min-w-0 flex-1">
                <p
                  class="text-sm font-bold"
                  :class="step.tone === 'void' ? 'text-slate-muted' : 'text-navy'"
                >
                  {{ step.title }}
                </p>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-label">
                  <template v-if="step.from">
                    <AddressChip :address="step.from" />
                    <span aria-hidden="true">→</span>
                  </template>
                  <AddressChip v-if="step.to" :address="step.to" />
                  <span v-if="step.note">{{ step.note }}</span>
                </div>
              </div>
            </li>
          </ol>
        </UiCard>

        <div class="space-y-5">
          <UiCard tone="panel" :title="t('lot.factsTitle')" badge="≡" badge-tone="navy">
            <dl class="space-y-3 text-xs">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-slate-label">{{ t('lots.manufacturer') }}</dt>
                <dd><AddressChip :address="journey.manufacturer" /></dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-slate-label">{{ t('lots.declaredAt') }}</dt>
                <dd class="text-navy-soft">{{ formatDate(journey.declaredAt) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-slate-label">{{ t('lots.cert') }}</dt>
                <dd><HashChip :value="journey.certHash" /></dd>
              </div>
              <div v-if="unit" class="flex items-center justify-between gap-2">
                <dt class="text-slate-label">{{ t('lots.materialUnitLabel') }}</dt>
                <dd class="font-semibold text-navy-soft">{{ unit }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- Qui détient quoi aujourd'hui : déduit des balances, pas d'un event -->
          <UiCard :title="t('lot.custodyTitle')" :subtitle="t('lot.custodySubtitle')" badge="◉">
            <p v-if="!journey.holders.length" class="text-xs text-slate-muted">
              {{ t('lot.noCustody') }}
            </p>
            <ul v-else class="space-y-2">
              <li
                v-for="h in journey.holders"
                :key="h.address"
                class="flex items-center justify-between gap-2 text-xs"
              >
                <AddressChip :address="h.address" />
                <span class="font-bold text-navy">{{ formatQuantity(h.quantity, unit) }}</span>
              </li>
            </ul>
          </UiCard>
        </div>
      </div>

      <!-- Ce que la matière est devenue -->
      <UiCard
        class="mt-5"
        :title="t('lot.devicesTitle')"
        :subtitle="t('lot.devicesSubtitle', { consumed: formatQuantity(consumed, unit) })"
        badge="◈"
      >
        <p v-if="!journey.devices.length" class="text-sm text-slate-muted">
          {{ t('lots.noDevice') }}
        </p>
        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="d in journey.devices"
            :key="d.id"
            :to="{ name: 'passport', params: { id: d.id } }"
            class="rounded-card bg-white/70 px-3 py-2.5 transition hover:bg-teal-soft"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-extrabold text-teal">
                {{ t('passports.passport') }} #{{ d.id }}
              </span>
              <span class="text-xs font-bold text-navy">{{ formatQuantity(d.quantity, unit) }}</span>
            </div>
            <p class="mt-1 text-[0.7rem] text-slate-label">{{ formatDate(d.mintedAt) }}</p>
            <div class="mt-1.5"><AddressChip :address="d.holder" /></div>
          </RouterLink>
        </div>
      </UiCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import HashChip from '@/components/ui/HashChip.vue'
import { formatDate, formatQuantity } from '@/lib/format'
import { ShipmentStatus } from '@/lib/contracts'
import { useCatentaStore } from '@/stores/catenta'
import { useLotsStore, type LotJourney } from '@/stores/lots'
import { useMaterialsStore } from '@/stores/materials'

const { t } = useI18n()
const route = useRoute()
const catenta = useCatentaStore()
const lots = useLotsStore()
const materials = useMaterialsStore()

const id = computed(() => Number(route.params.id))
const journey = ref<LotJourney | null>(null)

const unit = computed(() => materials.unitOf(journey.value?.materialId))

/** Ce qui a été consommé en fabrication — la somme des traits figés. */
const consumed = computed(() =>
  (journey.value?.devices ?? []).reduce((sum, d) => sum + d.quantity, 0n),
)

type Step = {
  icon: string
  title: string
  tone: 'done' | 'void' | 'wait'
  from?: string
  to?: string
  note?: string
}

/**
 * Le parcours dans l'ordre où il s'est produit. Les expéditions ont des ids
 * séquentiels, donc leur ordre EST l'ordre chronologique — pas besoin d'un
 * horodatage supplémentaire ni de trier des events.
 */
const steps = computed<Step[]>(() => {
  const j = journey.value
  if (!j) return []
  const out: Step[] = [
    {
      icon: '◆',
      title: t('lot.stepDeclared', { date: formatDate(j.declaredAt) }),
      tone: 'done',
      to: j.manufacturer,
    },
  ]

  for (const s of j.shipments) {
    if (s.status === ShipmentStatus.Accepted) {
      out.push({
        icon: '✓',
        title: t('lot.stepAccepted', { qty: formatQuantity(s.quantity, unit.value) }),
        tone: 'done',
        from: s.from,
        to: s.to,
      })
    } else if (s.status === ShipmentStatus.Cancelled) {
      out.push({
        icon: '✕',
        title: t('lot.stepCancelled', { qty: formatQuantity(s.quantity, unit.value) }),
        tone: 'void',
        from: s.from,
        to: s.to,
        note: t('lot.stepCancelledNote'),
      })
    } else {
      out.push({
        icon: '…',
        title: t('lot.stepPending', { qty: formatQuantity(s.quantity, unit.value) }),
        tone: 'wait',
        from: s.from,
        to: s.to,
        note: t('lot.stepPendingNote'),
      })
    }
  }

  for (const d of j.devices) {
    out.push({
      icon: '◈',
      title: t('lot.stepManufactured', {
        qty: formatQuantity(d.quantity, unit.value),
        id: d.id,
      }),
      tone: 'done',
      note: formatDate(d.mintedAt),
    })
  }
  return out
})

async function load() {
  if (!catenta.ready) return
  const [j] = await Promise.all([lots.loadJourney(id.value), materials.load()])
  journey.value = j
}
onMounted(load)
watch(() => [catenta.ready, route.params.id], load)
</script>
