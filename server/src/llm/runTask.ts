import type { ZodType, ZodTypeDef } from 'zod';
import { callModel } from './client.js';
import { redact, rehydrate, type KnownValues } from './redact.js';
import { AppError } from '../errors.js';

/**
 * Seule entree publique du module LLM.
 *
 * Le pipeline impose, dans cet ordre :
 *   1. anonymisation      (l'appelant ne peut pas l'oublier : elle est ici)
 *   2. appel au modele    (avec timeout)
 *   3. parsing + schema   (ce qui ne valide pas n'existe pas)
 *   4. une seule relance  (au-dela, le cout depasse le benefice)
 *   5. rehydratation
 *   6. telemetrie         (support du banc d'essai, AA5)
 */

export interface LlmTask<TIn, TOut> {
  name: string;
  promptVersion: string;
  temperature: number;
  // Input laisse a `unknown` : un schema avec .default() accepte une entree
  // partielle, ce que ZodType<TOut> seul refuserait.
  schema: ZodType<TOut, ZodTypeDef, unknown>;
  /** Recoit l'entree DEJA anonymisee. */
  buildPrompt(input: TIn): { system: string; user: string };
  /** Champs a anonymiser ; les autres passent tels quels. */
  redactFields?: (input: TIn) => string[];
  /** Plafond de tokens en sortie. Un quiz de 10 questions depasse le defaut. */
  maxTokens?: number;
}

export interface Telemetry {
  model: string;
  promptVersion: string;
  temperature: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  retried: boolean;
}

export interface TaskResult<TOut> {
  data: TOut;
  telemetry: Telemetry;
  /** La charge utile exacte transmise au modele — alimente la vue de transparence. */
  sentPayload: string;
}

/** Le modele encadre parfois son JSON d'un bloc de code malgre la consigne. */
function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export async function runTask<TIn extends Record<string, unknown>, TOut>(
  task: LlmTask<TIn, TOut>,
  input: TIn,
  known: KnownValues = {},
): Promise<TaskResult<TOut>> {
  // 1. Anonymisation des champs textuels designes par la tache.
  const fields = task.redactFields?.(input) ?? [];
  const safeInput = { ...input } as TIn;
  const maps = [];

  for (const field of fields) {
    const raw = input[field];
    if (typeof raw !== 'string') continue;
    const { redacted, map } = redact(raw, known);
    (safeInput as Record<string, unknown>)[field] = redacted;
    maps.push(map);
  }

  const merged = new Map(maps.flatMap((m) => [...m]));
  const { system, user } = task.buildPrompt(safeInput);

  // 2 a 4. Appel, validation, et au plus une relance.
  let retried = false;
  let lastIssue = '';
  let prompt = user;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await callModel({
      system,
      user: prompt,
      temperature: task.temperature,
      maxTokens: task.maxTokens,
    });
    const parsed = safeParseJson(stripFences(raw.text));

    if (parsed.ok) {
      const validated = task.schema.safeParse(parsed.value);
      if (validated.success) {
        return {
          // 5. Les jetons redeviennent les valeurs reelles.
          data: rehydrate(validated.data, merged),
          telemetry: {
            model: raw.model,
            promptVersion: task.promptVersion,
            temperature: task.temperature,
            tokensIn: raw.tokensIn,
            tokensOut: raw.tokensOut,
            latencyMs: raw.latencyMs,
            retried,
          },
          sentPayload: `${system}\n\n---\n\n${prompt}`,
        };
      }
      lastIssue = JSON.stringify(validated.error.flatten().fieldErrors);
    } else {
      lastIssue = parsed.error;
    }

    if (attempt === 0) {
      retried = true;
      prompt = `${user}\n\nTa reponse precedente a ete rejetee : ${lastIssue}\nRenvoie uniquement le JSON valide, sans texte autour.`;
    }
  }

  throw new AppError('LLM_INVALID_OUTPUT', "L'analyse n'a pas pu etre produite.", {
    task: task.name,
    issue: lastIssue,
  });
}

function safeParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'reponse non parsable en JSON' };
  }
}
