import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../env.js';
import { AppError } from '../../errors.js';
import { withTimeout, type LlmProvider, type ProviderCall, type ProviderResult } from './types.js';

/**
 * Fournisseur Google Gemini. Niveau gratuit genereux : c'est le fournisseur de
 * demarrage du projet, avant bascule vers Anthropic.
 *
 * Un avantage notable sur notre cas d'usage : `responseMimeType: application/json`
 * contraint le modele a produire du JSON, ce qui ameliore mecaniquement le taux
 * de conformite au schema — une des cinq metriques du banc d'essai.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenerativeAI | null;

  constructor() {
    this.client = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;
  }

  get available(): boolean {
    return this.client !== null;
  }

  async call(request: ProviderCall, timeoutMs: number): Promise<ProviderResult> {
    if (!this.client) {
      throw new AppError(
        'LLM_KEY_MISSING',
        "Le service d'analyse est indisponible : clef Gemini absente.",
      );
    }

    const modelId = env.LLM_MODEL;

    try {
      const model = this.client.getGenerativeModel({
        model: modelId,
        systemInstruction: request.system,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          responseMimeType: 'application/json',
        },
      });

      const response = await withTimeout(model.generateContent(request.user), timeoutMs);
      const text = response.response.text();

      if (!text) {
        throw new AppError('LLM_INVALID_OUTPUT', 'Reponse du modele vide.');
      }

      const usage = response.response.usageMetadata;
      return {
        text,
        tokensIn: usage?.promptTokenCount ?? 0,
        tokensOut: usage?.candidatesTokenCount ?? 0,
        model: modelId,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;

      // Le SDK Gemini n'expose pas de classes d'erreur typees : on s'appuie sur
      // le statut lorsqu'il est present, sinon sur le message.
      const statut =
        (error as { status?: number }).status ??
        Number(/\[(\d{3})\s/.exec(error instanceof Error ? error.message : '')?.[1]) ??
        undefined;
      const message = error instanceof Error ? error.message : String(error);

      if (statut === 429 || /RESOURCE_EXHAUSTED|rate limit|exceeded your current quota/i.test(message)) {
        throw new AppError('LLM_QUOTA_EXCEEDED', "Quota d'appels atteint.");
      }

      // Un modele retire ou inexistant renvoie 404. Le classer comme clef
      // manquante enverrait chercher un probleme d'authentification alors que
      // la clef est valide — erreur constatee le 1er octobre avec le retrait
      // de gemini-2.0-flash. Le nom du modele est donc remonte explicitement.
      if (statut === 404 || /no longer available|is not found|NOT_FOUND/i.test(message)) {
        throw new AppError(
          'LLM_UNAVAILABLE',
          `Le modele « ${modelId} » n'est pas disponible chez ce fournisseur.`,
          { model: modelId, provider: this.name, detail: message.slice(0, 300) },
        );
      }

      if (
        statut === 401 ||
        statut === 403 ||
        /API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|api key not valid/i.test(message)
      ) {
        throw new AppError('LLM_KEY_MISSING', "Clef d'API refusee par le fournisseur.");
      }

      throw new AppError('LLM_UNAVAILABLE', 'Le service du modele est indisponible.', {
        status: statut,
        detail: message.slice(0, 300),
      });
    }
  }
}
