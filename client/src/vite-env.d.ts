/// <reference types="vite/client" />

/** Variables d'environnement exposees au navigateur. Prefixe VITE_ obligatoire. */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "1" : le site affiche la page de maintenance, sans appeler l'API. */
  readonly VITE_MAINTENANCE?: string;
  /** Adresse publique du front, sans barre finale. Hors depot, a dessein. */
  readonly VITE_SITE_URL?: string;
  /** "1" : le site s'ouvre aux moteurs de recherche (voir lib/referencement.ts). */
  readonly VITE_INDEXATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
