import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(3002),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  // Fournisseur de modele. Changer de fournisseur = changer cette variable,
  // plus la clef et le nom du modele correspondants. Aucun code a modifier.
  LLM_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),
  LLM_MODEL: z.string().default('gemini-3.5-flash-lite'),
  LLM_TIMEOUT_MS: z.coerce.number().default(30_000),
  MAX_CV_CHARS: z.coerce.number().default(20_000),

  // Clefs volontairement optionnelles : le serveur doit demarrer sans, pour que
  // l'absence se manifeste par une erreur LLM_KEY_MISSING propre et non par un
  // plantage au demarrage. C'est ce qui rend la demonstration possible.
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuration invalide :', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/** La clef du fournisseur actif est-elle presente ? Verifie au demarrage. */
export const hasLlmKey =
  env.LLM_PROVIDER === 'anthropic'
    ? Boolean(env.ANTHROPIC_API_KEY)
    : Boolean(env.GEMINI_API_KEY);

if (!hasLlmKey) {
  console.warn(
    `[llm] Clef absente pour le fournisseur "${env.LLM_PROVIDER}" — ` +
      "les routes d'analyse repondront LLM_KEY_MISSING.",
  );
} else {
  console.log(`[llm] Fournisseur actif : ${env.LLM_PROVIDER} (${env.LLM_MODEL})`);
}
