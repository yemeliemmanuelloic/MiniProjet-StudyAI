/// <reference types="vite/client" />

/** Variables d'environnement exposees au navigateur. Prefixe VITE_ obligatoire. */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
