import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../env.js';
import { AppError } from '../../errors.js';
import type { LlmProvider, ProviderCall, ProviderResult } from './types.js';

/** Fournisseur Anthropic (Claude). Necessite un solde sur console.anthropic.com. */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic | null;

  constructor() {
    this.client = env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
      : null;
  }

  get available(): boolean {
    return this.client !== null;
  }

  async call(request: ProviderCall, timeoutMs: number): Promise<ProviderResult> {
    if (!this.client) {
      throw new AppError(
        'LLM_KEY_MISSING',
        "Le service d'analyse est indisponible : clef Anthropic absente.",
      );
    }

    try {
      const response = await this.client.messages.create(
        {
          model: env.LLM_MODEL,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
        },
        { timeout: timeoutMs },
      );

      const block = response.content[0];
      if (!block || block.type !== 'text') {
        throw new AppError('LLM_INVALID_OUTPUT', 'Reponse du modele sans contenu texte.');
      }

      return {
        text: block.text,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
        model: response.model,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new AppError('LLM_TIMEOUT', "L'analyse a depasse le delai imparti.");
      }
      if (error instanceof Anthropic.APIError) {
        if (error.status === 429) {
          throw new AppError('LLM_QUOTA_EXCEEDED', "Quota d'appels atteint.");
        }
        if (error.status === 401 || error.status === 403) {
          throw new AppError('LLM_KEY_MISSING', "Clef d'API refusee par le fournisseur.");
        }
        throw new AppError('LLM_UNAVAILABLE', 'Le service du modele est indisponible.', {
          status: error.status,
        });
      }
      throw new AppError('LLM_UNAVAILABLE', "Echec de l'appel au modele.");
    }
  }
}
