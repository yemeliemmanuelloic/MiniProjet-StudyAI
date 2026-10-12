import { AppError } from '../../errors.js';

/**
 * Contrat commun a tous les fournisseurs de modele.
 *
 * Le reste du projet — anonymisation, schemas, prompts, telemetrie, services —
 * ignore quel fournisseur repond. Changer de fournisseur se fait par la
 * variable d'environnement LLM_PROVIDER, sans toucher au code.
 *
 * Cela sert deux besoins reels du projet :
 *   - demarrer gratuitement sur Gemini, puis basculer sur Claude sans migration ;
 *   - comparer deux modeles sur le meme corpus pour le banc d'essai (AA5).
 */

export interface ProviderCall {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
}

export interface ProviderResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** Identifiant exact du modele ayant repondu : enregistre dans la telemetrie. */
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  /** Faux si la clef est absente : detecte au demarrage, pas au premier appel. */
  readonly available: boolean;
  call(request: ProviderCall, timeoutMs: number): Promise<ProviderResult>;
}

/**
 * Impose un delai maximal a une promesse qui n'en gere pas elle-meme.
 * Tous les SDK n'exposent pas d'option de timeout ; celui-ci garantit que
 * LLM_TIMEOUT est leve de facon uniforme quel que soit le fournisseur.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError('LLM_TIMEOUT', "L'analyse a depasse le delai imparti.")),
      ms,
    );
  });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer)) as Promise<T>;
}
