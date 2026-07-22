/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIFECYCLE_ADDRESS: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_CHAIN_NAME: string
  readonly VITE_CURRENCY_SYMBOL: string
  readonly VITE_EXPLORER_URL: string
  readonly VITE_DEPLOY_BLOCK: string
  readonly VITE_REOWN_PROJECT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
