/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin of the deployed forecast engine, e.g. https://spraysense-api.example.com.
   * Unset in local dev — the Vite proxy serves /api instead. Must be set in
   * Vercel, where no proxy exists.
   */
  readonly VITE_ENGINE_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
