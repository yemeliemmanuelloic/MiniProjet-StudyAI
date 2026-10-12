import { env, hasLlmKey } from '../env.js';
import { AppError } from '../errors.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import type { LlmProvider } from './providers/types.js';

/**
 * Appel bas niveau au modele.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  NE PAS EXPORTER HORS DE src/llm/.                                      │
 * │                                                                         │
 * │  La seule entree publique du module est runTask(), qui anonymise         │
 * │  systematiquement. Si ce fichier devient accessible ailleurs, il         │
 * │  devient possible d'appeler le modele sans masquage — et l'exigence      │
 * │  de l'enonce n'est plus garantie par la structure, seulement par la      │
 * │  vigilance. Voir docs/01-architecture.md section 1.                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le fournisseur est choisi par LLM_PROVIDER. Chacun traduit ses propres
 * defaillances dans la taxonomie du projet (LLM_TIMEOUT, LLM_QUOTA_EXCEEDED,
 * LLM_KEY_MISSING, LLM_UNAVAILABLE), de sorte que le reste du code n'a jamais
 * a savoir qui a repondu.
 */

const fournisseurs: Record<string, () => LlmProvider> = {
  gemini: () => new GeminiProvider(),
  anthropic: () => new AnthropicProvider(),
};

const provider: LlmProvider = (fournisseurs[env.LLM_PROVIDER] ?? fournisseurs.gemini)();

export interface RawCall {
  system: string;
  user: string;
  temperature: number;
  maxTokens?: number;
}

export interface RawResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
  provider: string;
}

/** Attentes croissantes entre deux tentatives, en millisecondes. */
const ATTENTES = [800, 2500];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callModel(call: RawCall): Promise<RawResult> {
  if (!hasLlmKey) {
    throw new AppError(
      'LLM_KEY_MISSING',
      "Le service d'analyse est indisponible : clef d'API absente.",
    );
  }

  const startedAt = Date.now();
  const requete = {
    system: call.system,
    user: call.user,
    temperature: call.temperature,
    maxTokens: call.maxTokens ?? 2048,
  };

  // Reprise sur defaillance TRANSITOIRE uniquement. A ne pas confondre avec la
  // relance de runTask(), qui porte sur une sortie non conforme au schema :
  // celle-ci porte sur le transport. Les fournisseurs repondent regulierement
  // « high demand » (503) aux heures chargees ; sans reprise, une demonstration
  // echouerait une fois sur deux pour une raison qui n'a rien a voir avec le code.
  //
  // On ne reessaie PAS une clef refusee, un modele inexistant, un quota epuise
  // ni un depassement de delai : dans ces cas, reessayer ne peut pas aider.
  let derniere: AppError | undefined;

  for (let tentative = 0; tentative <= ATTENTES.length; tentative += 1) {
    try {
      const result = await provider.call(requete, env.LLM_TIMEOUT_MS);
      return {
        ...result,
        latencyMs: Date.now() - startedAt,
        provider: provider.name,
      };
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'LLM_UNAVAILABLE') throw error;
      derniere = error;
      if (tentative < ATTENTES.length) {
        console.warn(
          `[llm] service indisponible, nouvelle tentative dans ${ATTENTES[tentative]} ms`,
        );
        await pause(ATTENTES[tentative]);
      }
    }
  }

  throw derniere;
}

/** Expose le fournisseur actif pour la telemetrie et le banc d'essai. */
export const providerName = provider.name;
