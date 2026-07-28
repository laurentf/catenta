<template>
  <div>
    <p class="eyebrow">{{ t('admin.eyebrow') }}</p>
    <h1 class="mt-2">{{ t('admin.title') }}</h1>
    <p class="subtitle">{{ t('admin.subtitle') }}</p>

    <UiAlert v-if="!roles.isAdmin && !roles.isRegistrar && !roles.isCreditMinter" tone="warn" class="mt-6">
      {{ t('admin.notAllowed') }}
    </UiAlert>

    <UiTabs v-else v-model="tab" :tabs="tabs" class="mt-8">
      <!-- Agréer un acteur : admin ET agent d'agrément -->
      <template v-if="tab === 'onboard'">
        <UiCard tone="mint" :title="t('admin.grantTitle')" :subtitle="t('admin.grantSubtitle')" badge="＋">
          <form class="grid gap-4 sm:grid-cols-[200px_1fr_auto]" @submit.prevent="grantActor">
            <div>
              <label class="label">{{ t('admin.roleLabel') }}</label>
              <select v-model="role" class="input">
                <option v-for="r in ONBOARDABLE_ROLES" :key="r" :value="r">{{ t(`roles.${r}`) }}</option>
              </select>
            </div>
            <div>
              <label class="label">{{ t('admin.addressLabel') }}</label>
              <input v-model="account" class="input mono" placeholder="0x…" />
            </div>
            <UiButton type="submit" class="self-start sm:mt-6" :loading="busy" :disabled="!isAddress(account)">
              {{ t('admin.grant') }}
            </UiButton>
          </form>
        </UiCard>

        <div class="mt-6 grid gap-4 sm:grid-cols-3">
          <UiCard v-for="r in ONBOARDABLE_ROLES" :key="r" :title="t(`roles.${r}`)" badge="◉">
            <p v-if="!roles.members[r]?.length" class="text-sm text-slate-muted">{{ t('admin.noMember') }}</p>
            <ul v-else class="space-y-2">
              <li v-for="addr in roles.members[r]" :key="addr" class="flex items-center justify-between gap-2">
                <AddressChip :address="addr" />
                <UiButton size="sm" variant="danger" :loading="busy" @click="revokeActor(r, addr)">
                  {{ t('admin.revoke') }}
                </UiButton>
              </li>
            </ul>
          </UiCard>
        </div>
      </template>

      <!-- Opérateurs & régulateur : racine uniquement -->
      <template v-else-if="tab === 'operators'">
        <UiCard tone="panel" :title="t('admin.rootTitle')" :subtitle="t('admin.rootSubtitle')" badge="⚑" badge-tone="navy">
          <form class="grid gap-4 sm:grid-cols-[200px_1fr_auto]" @submit.prevent="grantRoot">
            <div>
              <label class="label">{{ t('admin.roleLabel') }}</label>
              <select v-model="rootRole" class="input">
                <option v-for="r in ROOT_MANAGED_ROLES" :key="r" :value="r">{{ t(`roles.${r}`) }}</option>
              </select>
            </div>
            <div>
              <label class="label">{{ t('admin.addressLabel') }}</label>
              <input v-model="rootAccount" class="input mono" placeholder="0x…" />
            </div>
            <UiButton type="submit" class="self-start sm:mt-6" :loading="rootBusy" :disabled="!isAddress(rootAccount)">
              {{ t('admin.grant') }}
            </UiButton>
          </form>
          <p class="hint">{{ t('admin.rootHint') }}</p>
        </UiCard>

        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <UiCard v-for="r in ROOT_MANAGED_ROLES" :key="r" tone="panel" :title="t(`roles.${r}`)" badge="⚑" badge-tone="navy">
            <p v-if="!roles.members[r]?.length" class="text-sm text-slate-muted">{{ t('admin.noMember') }}</p>
            <ul v-else class="space-y-2">
              <li v-for="addr in roles.members[r]" :key="addr" class="flex items-center justify-between gap-2">
                <AddressChip :address="addr" />
                <UiButton size="sm" variant="danger" :loading="rootBusy" @click="revokeRoot(r, addr)">
                  {{ t('admin.revoke') }}
                </UiButton>
              </li>
            </ul>
          </UiCard>
        </div>
      </template>

      <!-- Crédits $CATENTA : racine ou émetteur de crédits (CREDIT_MINTER) -->
      <template v-else-if="tab === 'credits'">
        <UiCard tone="mint" :title="t('admin.creditsFormTitle')" :subtitle="t('admin.creditsSubtitle')" badge="◈">
          <form class="grid gap-4 sm:grid-cols-[1fr_140px_auto]" @submit.prevent="mintCredits">
            <div>
              <label class="label">{{ t('admin.creditAddressLabel') }}</label>
              <input v-model="creditTo" class="input mono" placeholder="0x…" />
            </div>
            <div>
              <label class="label">{{ t('admin.creditAmountLabel') }}</label>
              <input v-model="creditAmount" class="input" type="number" min="1" step="1" placeholder="100" />
            </div>
            <UiButton type="submit" class="self-end" :loading="creditBusy" :disabled="!isAddress(creditTo) || Number(creditAmount) <= 0">
              {{ t('admin.mintCredits') }}
            </UiButton>
          </form>
          <p class="hint mt-3">{{ t('admin.creditHint') }}</p>
        </UiCard>
      </template>

      <!-- Contrats & rôles techniques : racine uniquement -->
      <template v-else-if="tab === 'system'">
        <UiAlert tone="warn">{{ t('admin.modulesWarning') }}</UiAlert>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <UiCard v-for="r in MODULE_ROLES" :key="r" tone="panel" :title="t(`roles.${r}`)" badge="⚙" badge-tone="navy">
            <p v-if="!roles.members[r]?.length" class="text-sm text-slate-muted">{{ t('admin.noMember') }}</p>
            <ul v-else class="space-y-2">
              <li v-for="addr in roles.members[r]" :key="addr" class="flex items-center gap-2">
                <AddressChip :address="addr" />
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase',
                    isKnownModule(addr) ? 'bg-teal-soft text-teal-deep' : 'bg-peach text-amber-deep',
                  ]"
                >
                  {{ isKnownModule(addr) ? t('admin.knownModule') : t('admin.unknownModule') }}
                </span>
              </li>
            </ul>
          </UiCard>
        </div>

        <h2 class="mt-8 text-base font-extrabold uppercase tracking-wider text-navy">{{ t('admin.stackTitle') }}</h2>
        <p class="subtitle">{{ t('admin.stackSubtitle') }}</p>
        <UiCard class="mt-4">
          <dl class="grid gap-3 sm:grid-cols-2">
            <div v-for="entry in stack" :key="entry.label" class="flex items-center justify-between gap-3">
              <dt class="text-xs font-bold uppercase tracking-wider text-slate-label">{{ entry.label }}</dt>
              <dd><AddressChip :address="entry.address" /></dd>
            </div>
          </dl>
        </UiCard>
      </template>
    </UiTabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import UiTabs, { type TabDef } from '@/components/ui/UiTabs.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import {
  MODULE_ROLES,
  ONBOARDABLE_ROLES,
  ROOT_MANAGED_ROLES,
  parseError,
  type RoleKey,
} from '@/lib/contracts'
import { eqAddress, isAddress } from '@/lib/format'
import { useCatentaStore } from '@/stores/catenta'
import { useRolesStore } from '@/stores/roles'
import { useCreditsStore } from '@/stores/credits'
import { useToastsStore } from '@/stores/toasts'

const { t } = useI18n()
const catenta = useCatentaStore()
const roles = useRolesStore()
const credits = useCreditsStore()
const toasts = useToastsStore()

const tab = ref('onboard')
const hint = computed(() => t('admin.tabLocked'))
// Chaque onglet s'ouvre pour la capacité qui lui correspond ; les autres
// restent affichés mais grisés (cadenas). La racine a tout.
const tabs = computed<TabDef[]>(() => [
  { key: 'onboard', label: t('admin.tabs.onboard'), locked: !(roles.isAdmin || roles.isRegistrar), hint: hint.value },
  { key: 'operators', label: t('admin.tabs.operators'), locked: !roles.isAdmin, hint: hint.value },
  { key: 'credits', label: t('admin.tabs.credits'), locked: !(roles.isAdmin || roles.isCreditMinter), hint: hint.value },
  { key: 'system', label: t('admin.tabs.system'), locked: !roles.isAdmin, hint: hint.value },
])

// Si l'onglet actif est verrouillé pour ce compte, basculer sur le premier
// onglet réellement utilisable (ex. un émetteur de crédits arrive sur Crédits).
watchEffect(() => {
  const current = tabs.value.find((x) => x.key === tab.value)
  if (current?.locked) {
    const open = tabs.value.find((x) => !x.locked)
    if (open) tab.value = open.key
  }
})

const role = ref<RoleKey>('LAB')
const account = ref('')
const busy = ref(false)

const rootRole = ref<RoleKey>('REGISTRAR')
const rootAccount = ref('')
const rootBusy = ref(false)

const creditTo = ref('')
const creditAmount = ref('100')
const creditBusy = ref(false)

const stack = computed(() => [
  { label: 'LifecycleModule', address: catenta.lifecycleAddress },
  { label: 'CatentaRoles', address: catenta.rolesAddress ?? '' },
  { label: 'PassportNFT', address: catenta.passportsAddress ?? '' },
  { label: 'MaterialLots', address: catenta.lotsAddress ?? '' },
  { label: 'CatentaCredit', address: catenta.creditAddress ?? '' },
])

function isKnownModule(address: string) {
  return eqAddress(address, catenta.lifecycleAddress)
}

/** Enveloppe une action tx dans un toast en cours → succès / échec. */
function tx(fn: () => Promise<string>, successKey: string) {
  return toasts.run(fn, {
    pending: t('toast.pending'),
    success: t(successKey),
    error: (err) => t(parseError(err).key),
  })
}

async function grantActor() {
  busy.value = true
  try {
    await tx(() => roles.grant(role.value, account.value.trim()), 'admin.granted')
    account.value = ''
  } catch {
    /* toast déjà affiché */
  } finally {
    busy.value = false
  }
}
async function revokeActor(r: RoleKey, addr: string) {
  busy.value = true
  try {
    await tx(() => roles.revoke(r, addr), 'admin.revoked')
  } catch {
    /* */
  } finally {
    busy.value = false
  }
}

async function grantRoot() {
  rootBusy.value = true
  try {
    await tx(() => roles.grant(rootRole.value, rootAccount.value.trim()), 'admin.granted')
    rootAccount.value = ''
  } catch {
    /* */
  } finally {
    rootBusy.value = false
  }
}
async function revokeRoot(r: RoleKey, addr: string) {
  rootBusy.value = true
  try {
    await tx(() => roles.revoke(r, addr), 'admin.revoked')
  } catch {
    /* */
  } finally {
    rootBusy.value = false
  }
}

async function mintCredits() {
  creditBusy.value = true
  try {
    await tx(() => credits.mint(creditTo.value.trim(), BigInt(creditAmount.value)), 'admin.creditsMinted')
  } catch {
    /* */
  } finally {
    creditBusy.value = false
  }
}

function load() {
  if (catenta.ready) void roles.loadMembers()
}
onMounted(load)
watch(() => catenta.ready, load)
</script>
