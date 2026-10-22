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
import type { Message } from './types';

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

/** Les evenements de la reponse du tuteur au fil de l'eau (23 octobre). */
export type EvenementTuteur =
  | { type: 'conversation'; conversationId: string }
  | { type: 'texte'; texte: string }
  | { type: 'fin'; message: Message }
  | { type: 'erreur'; error: { code: ErrorCode; message?: string; details?: Record<string, unknown> } };

/**
 * Requete dont la reponse arrive en NDJSON : une ligne JSON par evenement,
 * transmise a `surEvenement` des qu'elle est complete.
 *
 * Les erreurs AVANT le flux (droits, quota, cours inexistant) gardent leur
 * statut HTTP et passent par le meme chemin que `api()`. Une fois le flux
 * ouvert, un echec arrive comme evenement `erreur` : il est leve ici comme
 * une ApiError ordinaire, si bien que l'appelant n'a qu'une facon de gerer
 * une erreur.
 */
export async function apiFlux(
  path: string,
  body: unknown,
  surEvenement: (evenement: EvenementTuteur) => void,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const terminer = suivreRequete();
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
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

  const traiter = (ligne: string) => {
    if (!ligne.trim()) return;
    const evenement = JSON.parse(ligne) as EvenementTuteur;
    if (evenement.type === 'erreur') {
      const { code, details, message } = evenement.error;
      throw new ApiError(code ?? 'INTERNAL', details ?? {}, message);
    }
    surEvenement(evenement);
  };

  // Navigateur sans flux lisible : tout arrive d'un bloc, le resultat est le meme.
  if (!response.body) {
    (await response.text()).split('\n').forEach(traiter);
    return;
  }
  const lecteur = response.body.getReader();
  const decodeur = new TextDecoder();
  let tampon = '';
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      let fin = tampon.indexOf('\n');
      while (fin !== -1) {
        traiter(tampon.slice(0, fin));
        tampon = tampon.slice(fin + 1);
        fin = tampon.indexOf('\n');
      }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('INTERNAL', { cause: 'reseau' });
  }
  traiter(tampon + decodeur.decode());
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
