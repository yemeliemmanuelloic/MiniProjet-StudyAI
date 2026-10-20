/// <reference types="vite/client" />

/** Variables d'environnement exposees au navigateur. Prefixe VITE_ obligatoire. */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "1" : le site affiche la page de maintenance, sans appeler l'API. */
  readonly VITE_MAINTENANCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
