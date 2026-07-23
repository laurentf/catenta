import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastTone = 'success' | 'error' | 'pending'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
  txHash?: string
}

/**
 * Petits toasts de confirmation en bas à droite : une transaction envoyée
 * affiche un toast « en cours », puis bascule en succès (avec lien explorateur)
 * ou en échec. Les erreurs déjà décodées par parseError arrivent en message.
 */
export const useToastsStore = defineStore('toasts', () => {
  const items = ref<Toast[]>([])
  let seq = 0
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function schedule(id: number, ms: number) {
    clearTimer(id)
    timers.set(id, setTimeout(() => remove(id), ms))
  }
  function clearTimer(id: number) {
    const t = timers.get(id)
    if (t) {
      clearTimeout(t)
      timers.delete(id)
    }
  }

  function remove(id: number) {
    clearTimer(id)
    items.value = items.value.filter((t) => t.id !== id)
  }

  function push(toast: Omit<Toast, 'id'>, ms = 6000): number {
    const id = ++seq
    items.value.push({ id, ...toast })
    if (toast.tone !== 'pending') schedule(id, ms)
    return id
  }

  function update(id: number, patch: Partial<Omit<Toast, 'id'>>, ms = 6000) {
    const t = items.value.find((x) => x.id === id)
    if (!t) return
    Object.assign(t, patch)
    if (patch.tone && patch.tone !== 'pending') schedule(id, ms)
  }

  function success(message: string, txHash?: string) {
    push({ tone: 'success', message, txHash })
  }
  function error(message: string) {
    push({ tone: 'error', message }, 8000)
  }

  /**
   * Enveloppe une action qui renvoie un hash de transaction : toast « en
   * cours » → succès (avec le hash) ou échec (message fourni par l'appelant).
   */
  async function run(
    fn: () => Promise<string | void>,
    opts: { pending: string; success: string; error: (err: unknown) => string },
  ): Promise<string | void> {
    const id = push({ tone: 'pending', message: opts.pending })
    try {
      const hash = await fn()
      update(id, {
        tone: 'success',
        message: opts.success,
        txHash: typeof hash === 'string' ? hash : undefined,
      })
      return hash
    } catch (err) {
      update(id, { tone: 'error', message: opts.error(err) }, 8000)
      throw err
    }
  }

  return { items, push, update, remove, success, error, run }
})
