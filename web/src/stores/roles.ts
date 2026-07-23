import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useCatentaStore } from './catenta'
import { useWalletStore } from './wallet'
import { ACTOR_ROLES, MODULE_ROLES, ROLE, type RoleKey } from '@/lib/contracts'

/**
 * Le rôle est lu ON-CHAIN, jamais décidé côté client.
 *
 * Un front qui choisit lui-même ce que l'utilisateur a le droit de faire ment :
 * il n'a aucune autorité. Ici l'interface se contente de refléter ce que
 * `CatentaRoles.hasRole` répond — le contrat reste seul juge, et une personne
 * sans rôle voit l'application en lecture seule plutôt qu'un mur.
 */
export const useRolesStore = defineStore('roles', () => {
  const catenta = useCatentaStore()
  const wallet = useWalletStore()

  const held = ref<Record<RoleKey, boolean>>({
    ADMIN: false,
    LAB: false,
    PRACTITIONER: false,
    DISTRIBUTOR: false,
    REGULATOR: false,
    PASSPORT_MINTER: false,
    PASSPORT_CONTROLLER: false,
    LOT_MINTER: false,
    LOT_BURNER: false,
    CREDIT_MINTER: false,
    CREDIT_SPENDER: false,
    REGISTRAR: false,
  })

  /** Membres par rôle — offert par AccessControlEnumerable, sans indexeur. */
  const members = ref<Partial<Record<RoleKey, string[]>>>({})
  const loading = ref(false)

  const isAdmin = computed(() => held.value.ADMIN)
  const isLab = computed(() => held.value.LAB)
  const isPractitioner = computed(() => held.value.PRACTITIONER)
  const isRegulator = computed(() => held.value.REGULATOR)
  const isDistributor = computed(() => held.value.DISTRIBUTOR)
  const isRegistrar = computed(() => held.value.REGISTRAR)
  const isCreditMinter = computed(() => held.value.CREDIT_MINTER)

  /** Les rôles de l'utilisateur, pour l'affichage. */
  const myRoles = computed<RoleKey[]>(() =>
    (['ADMIN', ...ACTOR_ROLES, 'CREDIT_MINTER'] as RoleKey[]).filter((r) => held.value[r]),
  )
  /** Aucun rôle : spectateur, lecture seule. */
  const isSpectator = computed(() => myRoles.value.length === 0)

  async function refresh() {
    const c = catenta.readOnly()
    const account = wallet.address
    if (!c || !account) return

    loading.value = true
    try {
      const keys: RoleKey[] = ['ADMIN', ...ACTOR_ROLES, 'CREDIT_MINTER']
      const results = await Promise.all(
        keys.map((k) => c.roles.hasRole(ROLE[k], account) as Promise<boolean>),
      )
      keys.forEach((k, i) => {
        held.value[k] = results[i]
      })
    } finally {
      loading.value = false
    }
  }

  /** Charge la liste des titulaires — la vue /admin s'en sert. */
  async function loadMembers() {
    const c = catenta.readOnly()
    if (!c) return

    loading.value = true
    try {
      const keys: RoleKey[] = [...ACTOR_ROLES, ...MODULE_ROLES, 'CREDIT_MINTER']
      const next: Partial<Record<RoleKey, string[]>> = {}
      await Promise.all(
        keys.map(async (key) => {
          const count = Number(await c.roles.getRoleMemberCount(ROLE[key]))
          const addresses = await Promise.all(
            Array.from({ length: count }, (_, i) =>
              c.roles.getRoleMember(ROLE[key], i) as Promise<string>,
            ),
          )
          next[key] = addresses
        }),
      )
      members.value = next
    } finally {
      loading.value = false
    }
  }

  async function grant(role: RoleKey, account: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.roles.grantRole(ROLE[role], account)
    await tx.wait()
    await loadMembers()
    return tx.hash as string
  }

  async function revoke(role: RoleKey, account: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.roles.revokeRole(ROLE[role], account)
    await tx.wait()
    await loadMembers()
    return tx.hash as string
  }

  function reset() {
    for (const key of Object.keys(held.value) as RoleKey[]) held.value[key] = false
    members.value = {}
  }

  return {
    held,
    members,
    loading,
    isAdmin,
    isLab,
    isPractitioner,
    isRegulator,
    isDistributor,
    isRegistrar,
    isCreditMinter,
    isSpectator,
    myRoles,
    refresh,
    loadMembers,
    grant,
    revoke,
    reset,
  }
})
