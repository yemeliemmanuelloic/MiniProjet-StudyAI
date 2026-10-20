/**
 * Client HTTP unique.
 *
 * Toute la traduction des codes d'erreur de l'API en messages utilisateur vit
 * ICI. Aucune page ne compose de message elle-meme : c'est ce qui garantit que
 * les quatre cas LLM_* exiges par l'enonce s'affichent de la meme facon
 * partout, et qu'ils sont demontrables en soutenance.
 */

import { statutIndisponible, suivreRequete } from './etatServeur';
import { messagePour } from './messages';

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

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: Record<string, unknown> = {},
    /** La phrase composee par le serveur, quand il y en a une. */
    readonly messageServeur?: string,
  ) {
    super(messagePour(code, details, messageServeur));
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
  // Le suivi alimente le bandeau « le serveur se reveille » (etatServeur.ts).
  const terminer = suivreRequete();
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: options.method ?? (options.body || options.raw ? 'POST' : 'GET'),
      headers,
      body: options.raw ?? (options.body ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    terminer(false);
    throw new ApiError('INTERNAL', { cause: 'reseau' });
  }
  terminer(!statutIndisponible(response.status));

  // 502/503/504 : la passerelle de l'hebergeur repond, pas l'API. Le corps
  // n'est pas le notre ; on le dit tel quel plutot qu'« erreur interne ».
  if (statutIndisponible(response.status)) {
    throw new ApiError('INTERNAL', { cause: 'indisponible' });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    // Le message du serveur est TRANSMIS, pas jete : c'est lui qui porte le
    // detail utile quand le client ne sait pas composer mieux.
    throw new ApiError(
      payload?.error?.code ?? 'INTERNAL',
      payload?.error?.details ?? {},
      payload?.error?.message,
    );
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

  const terminer = suivreRequete();
  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}${chemin}`, { headers: entetes });
  } catch {
    terminer(false);
    throw new ApiError('INTERNAL', { cause: 'reseau' });
  }
  terminer(!statutIndisponible(reponse.status));
  if (statutIndisponible(reponse.status)) {
    throw new ApiError('INTERNAL', { cause: 'indisponible' });
  }

  if (!reponse.ok) {
    const charge = await reponse.json().catch(() => null);
    throw new ApiError(
      charge?.error?.code ?? 'INTERNAL',
      charge?.error?.details ?? {},
      charge?.error?.message,
    );
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
