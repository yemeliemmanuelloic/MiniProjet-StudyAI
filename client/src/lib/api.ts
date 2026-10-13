/**
 * Client HTTP unique.
 *
 * Toute la traduction des codes d'erreur de l'API en messages utilisateur vit
 * ICI. Aucune page ne compose de message elle-meme : c'est ce qui garantit que
 * les quatre cas LLM_* exiges par l'enonce s'affichent de la meme facon
 * partout, et qu'ils sont demontrables en soutenance.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3002/api';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'LLM_KEY_MISSING'
  | 'LLM_TIMEOUT'
  | 'LLM_QUOTA_EXCEEDED'
  | 'LLM_INVALID_OUTPUT'
  | 'LLM_UNAVAILABLE'
  | 'INTERNAL';

const MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Certaines informations sont invalides.',
  UNAUTHORIZED: 'Votre session a expire. Reconnectez-vous.',
  FORBIDDEN: "Vous n'avez pas acces a cette ressource.",
  NOT_FOUND: 'Ressource introuvable.',
  RATE_LIMITED: "Trop d'analyses demandees. Reessayez plus tard.",
  LLM_KEY_MISSING: "Le service d'analyse est momentanement indisponible.",
  LLM_TIMEOUT: "L'analyse a pris trop de temps. Reessayez.",
  LLM_QUOTA_EXCEEDED: "Le quota d'analyses est atteint pour aujourd'hui.",
  LLM_INVALID_OUTPUT: "L'analyse n'a pas pu etre produite. Reessayez.",
  LLM_UNAVAILABLE: "Le service d'analyse est indisponible.",
  INTERNAL: 'Une erreur est survenue.',
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? MESSAGES[code] ?? MESSAGES.INTERNAL);
  }
}

let token: string | null = localStorage.getItem('token');

export const setToken = (value: string | null): void => {
  token = value;
  if (value) localStorage.setItem('token', value);
  else localStorage.removeItem('token');
};

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; raw?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers['Content-Type'] = 'application/json';

  // Une panne reseau fait rejeter fetch avec un TypeError, qui n'a ni `code`
  // ni message utilisable. Sans ce garde, l'interface sortait de son propre
  // contrat d'erreur des que le serveur etait injoignable : le bandeau
  // affichait « Failed to fetch » et aucune conduite a tenir.
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: options.method ?? (options.body || options.raw ? 'POST' : 'GET'),
      headers,
      body: options.raw ?? (options.body ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError('INTERNAL', { cause: 'reseau' }, 'Le serveur est injoignable.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error?.code ?? 'INTERNAL', payload?.error?.details ?? {});
  }

  // 204 : une suppression ne renvoie aucun corps. Sans ce garde, response.json()
  // leve une erreur de syntaxe que l'appelant interpreterait comme un echec.
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

/**
 * Telecharge un fichier servi par une route protegee.
 *
 * Un simple <a href> ne transporterait pas l'en-tete Authorization : le
 * serveur repondrait 401. On recupere donc le contenu avec le jeton, puis on
 * declenche le telechargement depuis un objet blob.
 */
export async function telecharger(chemin: string, nomFichier: string): Promise<void> {
  const entetes: Record<string, string> = {};
  if (token) entetes.Authorization = `Bearer ${token}`;

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}${chemin}`, { headers: entetes });
  } catch {
    throw new ApiError('INTERNAL', { cause: 'reseau' }, 'Le serveur est injoignable.');
  }

  if (!reponse.ok) {
    const charge = await reponse.json().catch(() => null);
    throw new ApiError(charge?.error?.code ?? 'INTERNAL', charge?.error?.details ?? {});
  }

  const blob = await reponse.blob();
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Sans cette liberation, le blob reste en memoire jusqu'au rechargement.
  URL.revokeObjectURL(url);
}
