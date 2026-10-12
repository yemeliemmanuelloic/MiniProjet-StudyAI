import { z } from 'zod';

/**
 * Schemas des sorties du modele, un par module IA.
 *
 * Regle du projet : ce qui ne valide pas n'existe pas. Aucune sortie brute
 * n'atteint la base ni l'ecran.
 */

/* --- Module 1 : resume automatique --- */

export const summarySchema = z.object({
  /** Resume redige, en prose. C'est le livrable principal du module. */
  abstract: z.string().min(80),
  /** Points cles, pour une revision rapide. */
  keyPoints: z.array(z.string().min(10)).min(3).max(12),
  /** Notions a retenir, utilisees ensuite comme etiquettes. */
  keywords: z.array(z.string().min(2)).max(15),
  /** Signale un cours trop court, illisible ou hors sujet. */
  warnings: z.array(z.string()).default([]),
});

/* --- Module 2 : quiz a choix multiples --- */

export const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(10),
        /** Exactement quatre options, comme le demande la specification. */
        options: z.array(z.string().min(1)).length(4),
        /** Index de la bonne reponse, de 0 a 3. */
        correctIndex: z.number().int().min(0).max(3),
        /** L'explication est obligatoire : un QCM sans justification n'apprend rien. */
        explanation: z.string().min(20),
        /**
         * Passage du cours dont la question est tiree. Sert de garde-fou :
         * une question sans ancrage dans le cours est une question inventee.
         */
        sourceQuote: z.string().min(10),
      }),
    )
    .min(1)
    .max(20),
});

/* --- Module 3 : chatbot ancre sur le cours --- */

export const chatAnswerSchema = z.object({
  answer: z.string().min(1),
  /**
   * Faux quand le cours ne contient pas de quoi repondre. Le modele doit le
   * dire plutot qu'inventer : c'est la garantie anti-hallucination du module.
   */
  grounded: z.boolean(),
  /** Extraits du cours citees a l'appui. Vide si grounded vaut faux. */
  sources: z.array(z.string()).default([]),
});

export type Summary = z.infer<typeof summarySchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type ChatAnswer = z.infer<typeof chatAnswerSchema>;
