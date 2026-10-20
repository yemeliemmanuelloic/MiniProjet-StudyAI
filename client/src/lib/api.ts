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

/**
 * L'erreur portee par une reponse non 2xx.
 *
 * PIEGE (corrige le 20 octobre) : l'API elle-meme repond 502, 503 ou 504
 * pour les erreurs du modele (LLM_KEY_MISSING en 503, LLM_TIMEOUT en 504,
 * LLM_INVALID_OUTPUT et LLM_UNAVAILABLE en 502). Ces statuts ne veulent donc
 * PAS dire « serveur indisponible » a eux seuls. Ce qui distingue la
 * passerelle de l'hebergeur, c'est le corps : elle ne renvoie pas notre
 * enveloppe `{ error: { code } }`.
 */
async function erreurDeReponse(reponse: Response): Promise<ApiError> {
  const charge = await reponse.json().catch(() => null);
  const code = charge?.error?.code as ErrorCode | undefined;
  if (!code && statutIndisponible(reponse.status)) {
    return new ApiError('INTERNAL', { cause: 'indisponible' });
  }
  // Le message du serveur est TRANSMIS, pas jete : c'est lui qui porte le
  // detail utile quand le client ne sait pas composer mieux.
  return new ApiError(code ?? 'INTERNAL', charge?.error?.details ?? {}, charge?.error?.message);
}

const indisponible = (e: ApiError) => e.details.cause === 'indisponible';

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

  if (!response.ok) {
    const erreur = await erreurDeReponse(response);
    terminer(!indisponible(erreur));
    throw erreur;
  }
  terminer(true);

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

  if (!reponse.ok) {
    const erreur = await erreurDeReponse(reponse);
    terminer(!indisponible(erreur));
    throw erreur;
  }
  terminer(true);

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
