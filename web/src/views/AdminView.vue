<template>
  <div>
    <p class="eyebrow">{{ t('admin.eyebrow') }}</p>
    <h1 class="mt-2">{{ t('admin.title') }}</h1>
    <p class="subtitle">{{ t('admin.subtitle') }}</p>

    <UiAlert v-if="!roles.isAdmin" tone="warn" class="mt-6">{{ t('admin.notAdmin') }}</UiAlert>

    <template v-else>
      <UiCard tone="mint" class="mt-6" :title="t('admin.grantTitle')" badge="＋">
        <form class="grid gap-4 sm:grid-cols-[200px_1fr_auto]" @submit.prevent="submit">
          <div>
            <label class="label">{{ t('admin.roleLabel') }}</label>
            <select v-model="role" class="input">
              <option v-for="r in ACTOR_ROLES" :key="r" :value="r">{{ t(`roles.${r}`) }}</option>
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
        <p v-if="feedback" class="mt-3 text-sm" :class="ok ? 'text-teal-deep' : 'text-amber-deep'">
          {{ feedback }}
        </p>
      </UiCard>

      <!-- Rôles acteurs : accordés à des humains -->
      <h2 class="mt-10">{{ t('admin.actorsTitle') }}</h2>
      <p class="subtitle">{{ t('admin.actorsSubtitle') }}</p>
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <UiCard v-for="r in ACTOR_ROLES" :key="r" :title="t(`roles.${r}`)" badge="◉">
          <p v-if="!roles.members[r]?.length" class="text-sm text-slate-muted">
            {{ t('admin.noMember') }}
          </p>
          <ul v-else class="space-y-2">
            <li v-for="addr in roles.members[r]" :key="addr" class="flex items-center justify-between gap-2">
              <AddressChip :address="addr" />
              <UiButton size="sm" variant="danger" :loading="busy" @click="revoke(r, addr)">
                {{ t('admin.revoke') }}
              </UiButton>
            </li>
          </ul>
        </UiCard>
      </div>

      <!-- Rôles modules : accordés à des CONTRATS -->
      <h2 class="mt-10">{{ t('admin.modulesTitle') }}</h2>
      <p class="subtitle">{{ t('admin.modulesSubtitle') }}</p>
      <UiAlert tone="warn" class="mt-4">{{ t('admin.modulesWarning') }}</UiAlert>
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <UiCard v-for="r in MODULE_ROLES" :key="r" tone="panel" :title="t(`roles.${r}`)" badge="⚙" badge-tone="navy">
          <p v-if="!roles.members[r]?.length" class="text-sm text-slate-muted">
            {{ t('admin.noMember') }}
          </p>
          <ul v-else class="space-y-2">
            <li v-for="addr in roles.members[r]" :key="addr" class="flex items-center gap-2">
              <AddressChip :address="addr" />
              <span
                v-if="isKnownModule(addr)"
                class="rounded-full bg-teal-soft px-2 py-0.5 text-[0.65rem] font-bold uppercase text-teal-deep"
              >
                {{ t('admin.knownModule') }}
              </span>
              <span
                v-else
                class="rounded-full bg-peach px-2 py-0.5 text-[0.65rem] font-bold uppercase text-amber-deep"
              >
                {{ t('admin.unknownModule') }}
              </span>
            </li>
          </ul>
        </UiCard>
      </div>

      <!-- La pile déployée, découverte depuis l'unique adresse configurée -->
      <h2 class="mt-10">{{ t('admin.stackTitle') }}</h2>
      <p class="subtitle">{{ t('admin.stackSubtitle') }}</p>
      <UiCard class="mt-5">
        <dl class="grid gap-3 sm:grid-cols-2">
          <div v-for="entry in stack" :key="entry.label" class="flex items-center justify-between gap-3">
            <dt class="text-xs font-bold uppercase tracking-wider text-slate-label">{{ entry.label }}</dt>
            <dd><AddressChip :address="entry.address" /></dd>
          </div>
        </dl>
      </UiCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import { ACTOR_ROLES, MODULE_ROLES, parseError, type RoleKey } from '@/lib/contracts'
import { eqAddress, isAddress } from '@/lib/format'
import { useCatentaStore } from '@/stores/catenta'
import { useRolesStore } from '@/stores/roles'

const { t } = useI18n()
const catenta = useCatentaStore()
const roles = useRolesStore()

const role = ref<RoleKey>('LAB')
const account = ref('')
const busy = ref(false)
const feedback = ref('')
const ok = ref(false)

const stack = computed(() => [
  { label: 'LifecycleModule', address: catenta.lifecycleAddress },
  { label: 'CatentaRoles', address: catenta.rolesAddress ?? '' },
  { label: 'PassportNFT', address: catenta.passportsAddress ?? '' },
  { label: 'MaterialLots', address: catenta.lotsAddress ?? '' },
])

/**
 * Un rôle module accordé à autre chose qu'un module connu court-circuite la
 * logique métier. Le contrat ne peut pas l'empêcher — l'interface le signale.
 */
function isKnownModule(address: string) {
  return eqAddress(address, catenta.lifecycleAddress)
}

async function submit() {
  busy.value = true
  feedback.value = ''
  try {
    await roles.grant(role.value, account.value.trim())
    ok.value = true
    feedback.value = t('admin.granted')
    account.value = ''
  } catch (err) {
    ok.value = false
    const { key, raw } = parseError(err)
    feedback.value = raw ? `${t(key)} (${raw})` : t(key)
  } finally {
    busy.value = false
  }
}

async function revoke(r: RoleKey, addr: string) {
  busy.value = true
  feedback.value = ''
  try {
    await roles.revoke(r, addr)
    ok.value = true
    feedback.value = t('admin.revoked')
  } catch (err) {
    ok.value = false
    const { key } = parseError(err)
    feedback.value = t(key)
  } finally {
    busy.value = false
  }
}

function load() {
  if (catenta.ready) void roles.loadMembers()
}
onMounted(load)
watch(() => catenta.ready, load)
</script>
