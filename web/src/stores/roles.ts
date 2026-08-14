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
    MANUFACTURER: false,
    LAB: false,
    PRACTITIONER: false,
    DISTRIBUTOR: false,
    REGULATOR: false,
    PASSPORT_MINTER: false,
    PASSPORT_CONTROLLER: false,
    LOT_MINTER: false,
    LOT_BURNER: false,
    LOT_CUSTODIAN: false,
    CREDIT_MINTER: false,
    CREDIT_SPENDER: false,
    REGISTRAR: false,
  })

  /** Membres par rôle — offert par AccessControlEnumerable, sans indexeur. */
  const members = ref<Partial<Record<RoleKey, string[]>>>({})
  const loading = ref(false)

  const isAdmin = computed(() => held.value.ADMIN)
  const isManufacturer = computed(() => held.value.MANUFACTURER)
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

  /**
   * Ce que chaque rôle a besoin de voir.
   *
   * Additif, jamais exclusif : une adresse qui est à la fois laboratoire et
   * praticien — le cas de l'usinage au cabinet — cumule les deux vues. C'est
   * pourquoi ce sont des `||` et non un aiguillage sur un rôle principal.
   *
   * Le fabricant est le seul acteur métier vraiment restreint : il produit de
   * la matière et n'a rien à faire des prothèses. Lui montrer des passeports
   * qu'il ne peut ni lire utilement ni modifier ne fait qu'ajouter du bruit.
   *
   * ADMINISTRER N'EST PAS UN DROIT DE LECTURE. L'administrateur, l'agent
   * d'agrément et l'émetteur de crédits gouvernent le registre ; ils n'y
   * exercent aucun métier. Leurs écrans se limitent donc à Administration —
   * sauf s'ils portent aussi un rôle acteur, auquel cas les vues s'ajoutent,
   * ces rôles se cumulant comme les autres.
   *
   * Sans aucun rôle, on voit tout en lecture : le registre est public, et
   * prétendre le contraire serait mentir sur ce qu'est une chaîne publique.
   */
  const seesPassports = computed(
    () => isLab.value || isPractitioner.value || isRegulator.value || isSpectator.value,
  )

  /**
   * Le praticien seul n'y a rien à faire : `mintPassport` est `onlyRole(LAB)`,
   * donc il pourrait commander de la matière, la recevoir, la détenir — et n'en
   * rien faire. L'usinage au fauteuil (cas 2b) suppose un cabinet qui est aussi
   * laboratoire ; ce cumul passe par `isLab`, déjà dans la liste.
   */
  const seesMaterial = computed(
    () =>
      isManufacturer.value ||
      isDistributor.value ||
      isLab.value ||
      isRegulator.value ||
      isSpectator.value,
  )

  /** Lecture totale du registre, sans filtrage par garde. */
  const seesEverything = computed(() => isRegulator.value || isSpectator.value)

  /** Où atterrir après connexion : le premier écran qui concerne ce compte. */
  const homeRoute = computed(() => {
    if (seesPassports.value) return 'passports'
    if (seesMaterial.value) return 'lots'
    return 'admin'
  })

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
    isManufacturer,
    isLab,
    isPractitioner,
    isRegulator,
    isDistributor,
    isRegistrar,
    isCreditMinter,
    isSpectator,
    seesPassports,
    seesMaterial,
    seesEverything,
    homeRoute,
    myRoles,
    refresh,
    loadMembers,
    grant,
    revoke,
    reset,
  }
})
