import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCatentaStore } from './catenta'

/**
 * Le catalogue matière, lu ON-CHAIN.
 *
 * Ce que le fabricant déclare une fois par produit : son nom commercial et son
 * unité. Contrairement à l'identité des acteurs, une référence produit n'est pas
 * une donnée personnelle — la doctrine RGPD de la SPEC §9.4 ne s'y applique pas,
 * donc rien n'interdit de l'inscrire.
 *
 * Et l'unité DOIT être ici : c'est elle qui décide comment se lit une quantité
 * inscrite dans la blockchain. Dans un fichier modifiable, elle rendrait un
 * nombre immuable réinterprétable après coup.
 *
 * Lecture par index, comme partout ailleurs : `materialCount()` borne, chaque
 * entrée se relit directement. Aucun scan de logs, aucun indexeur.
 */
export interface MaterialRow {
  id: number
  manufacturer: string
  active: boolean
  name: string
  unit: string
}

export const useMaterialsStore = defineStore('materials', () => {
  const catenta = useCatentaStore()

  const list = ref<MaterialRow[]>([])
  const loading = ref(false)

  async function load() {
    const c = catenta.readOnly()
    if (!c) return
    loading.value = true
    try {
      const count = Number(await c.catalog.materialCount())
      const rows = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const id = i + 1 // les ids commencent à 1 : 0 reste la sentinelle
          const m = await c.catalog.materialOf(id)
          return {
            id,
            manufacturer: m.manufacturer as string,
            active: m.active as boolean,
            name: m.name as string,
            unit: m.unit as string,
          } satisfies MaterialRow
        }),
      )
      list.value = rows
    } catch (err) {
      console.error('[catenta] material catalogue load failed', err)
    } finally {
      loading.value = false
    }
  }

  function byId(id?: number | null): MaterialRow | null {
    if (!id) return null
    return list.value.find((m) => m.id === id) ?? null
  }

  /** Le nom d'une matière, ou null si le catalogue ne la connaît pas encore. */
  function nameOf(id?: number | null): string | null {
    return byId(id)?.name ?? null
  }

  /** L'unité dans laquelle se comptent les quantités de cette matière. */
  function unitOf(id?: number | null): string {
    return byId(id)?.unit ?? ''
  }

  async function registerMaterial(name: string, unit: string) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.catalog.registerMaterial(name, unit)
    await tx.wait()
    await load()
    return tx.hash as string
  }

  async function setActive(id: number, active: boolean) {
    const w = catenta.writable()
    if (!w) throw new Error('no signer')
    const tx = await w.catalog.setMaterialActive(id, active)
    await tx.wait()
    await load()
    return tx.hash as string
  }

  return { list, loading, load, byId, nameOf, unitOf, registerMaterial, setActive }
})
