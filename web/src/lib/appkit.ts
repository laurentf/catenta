import { createAppKit } from '@reown/appkit/vue'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { sepolia, holesky, mainnet, type AppKitNetwork } from '@reown/appkit/networks'
import { CHAIN_ID } from './constants'

/**
 * Initialise Reown AppKit une fois au démarrage : modale universelle
 * (extensions via EIP-6963 + wallets mobiles via WalletConnect QR).
 *
 * Câblé pour Sepolia / Holesky / mainnet — la chaîne active vient de
 * VITE_CHAIN_ID. Pour en ajouter une, l'importer de '@reown/appkit/networks'
 * et l'ajouter à `networks`.
 */
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID

export const SUPPORTED_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  sepolia,
  holesky,
  mainnet,
]

const defaultNetwork =
  SUPPORTED_NETWORKS.find((n) => Number(n.id) === CHAIN_ID) ?? sepolia

let kit: ReturnType<typeof createAppKit> | undefined

export function getAppKit(): ReturnType<typeof createAppKit> {
  if (!kit) throw new Error('AppKit has not been initialized yet')
  return kit
}

export function initAppKit() {
  if (kit) return kit

  if (!projectId) {
    console.warn(
      '[catenta] VITE_REOWN_PROJECT_ID est absent — la modale de connexion ne ' +
        "s'ouvrira pas. Project ID gratuit sur https://cloud.reown.com",
    )
  }

  kit = createAppKit({
    adapters: [new EthersAdapter()],
    networks: SUPPORTED_NETWORKS,
    defaultNetwork,
    projectId: projectId || 'missing-project-id',
    metadata: {
      name: 'Catenta',
      description: 'Passeport dentaire on-chain',
      url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:1338',
      icons: ['/favicon.svg'],
    },
    features: { analytics: false, email: false, socials: false },
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#0F766E',
      '--w3m-color-mix': '#E5F4F1',
      '--w3m-color-mix-strength': 8,
      '--w3m-border-radius-master': '3px',
      '--w3m-font-family': 'Inter, system-ui, sans-serif',
    },
  })

  return kit
}
