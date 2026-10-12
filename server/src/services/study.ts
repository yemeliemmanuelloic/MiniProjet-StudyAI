import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { runTask } from '../llm/runTask.js';
import { chatTask, quizTask, summarizeTask } from '../llm/tasks/index.js';
import type { ChatAnswer, Quiz, Summary } from '../llm/schemas.js';

/**
 * Logique metier des trois modules.
 *
 * Ce service ignore comment l'anonymisation fonctionne : il appelle runTask,
 * qui s'en charge. C'est ce qui garantit qu'aucun chemin ne contourne le
 * masquage.
 */

export const empreinte = (texte: string): string =>
  createHash('sha256').update(texte).digest('hex').slice(0, 32);

async function coursDe(courseId: string, ownerId: string) {
  const cours = await prisma.course.findUnique({ where: { id: courseId } });
  if (!cours) throw new AppError('NOT_FOUND', 'Cours introuvable.');
  if (cours.ownerId !== ownerId) throw new AppError('FORBIDDEN', "Ce cours ne vous appartient pas.");
  return cours;
}

/* --- Module 1 : resume --- */

export async function resumer(courseId: string, ownerId: string, level = 'standard') {
  const cours = await coursDe(courseId, ownerId);

  // Cache : meme cours, meme niveau => pas de nouvel appel. Reduit le cout et
  // stabilise la demonstration.
  const existant = await prisma.summary.findFirst({
    where: { courseId, level },
    orderBy: { createdAt: 'desc' },
  });
  if (existant) return existant;

  const { data, telemetry, sentPayload } = await runTask(
    summarizeTask,
    { courseText: cours.content, level },
    {},
  );

  return prisma.summary.create({
    data: {
      courseId,
      level,
      payload: data as object,
      sentPayload,
      model: telemetry.model,
      promptVersion: telemetry.promptVersion,
      temperature: telemetry.temperature,
      tokensIn: telemetry.tokensIn,
      tokensOut: telemetry.tokensOut,
      latencyMs: telemetry.latencyMs,
    },
  });
}

/* --- Module 2 : quiz --- */

export async function genererQuiz(
  courseId: string,
  ownerId: string,
  questionCount = 5,
  difficulty = 'standard',
) {
  const cours = await coursDe(courseId, ownerId);

  const { data, telemetry, sentPayload } = await runTask(
    quizTask,
    { courseText: cours.content, questionCount, difficulty },
    {},
  );

  // Garde-fou applicatif : le modele annonce parfois un nombre de questions
  // different de celui demande. On ne rejette pas, on tronque et on le note.
  const questions = (data as Quiz).questions.slice(0, questionCount);

  return prisma.quiz.create({
    data: {
      courseId,
      difficulty,
      questionCount: questions.length,
      payload: { questions } as object,
      sentPayload,
      model: telemetry.model,
      promptVersion: telemetry.promptVersion,
      temperature: telemetry.temperature,
      tokensIn: telemetry.tokensIn,
      tokensOut: telemetry.tokensOut,
      latencyMs: telemetry.latencyMs,
    },
  });
}

/** Correction cote serveur : la bonne reponse ne descend jamais au navigateur. */
export async function corrigerQuiz(quizId: string, ownerId: string, answers: number[]) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { course: true },
  });
  if (!quiz) throw new AppError('NOT_FOUND', 'Quiz introuvable.');
  if (quiz.course.ownerId !== ownerId) throw new AppError('FORBIDDEN', 'Quiz non accessible.');

  const questions = (quiz.payload as unknown as Quiz).questions;
  const score = questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
    0,
  );

  const tentative = await prisma.quizAttempt.create({
    data: { quizId, answers: answers as object, score, total: questions.length },
  });

  return {
    attempt: tentative,
    correction: questions.map((q, i) => ({
      question: q.question,
      chosen: answers[i] ?? null,
      correctIndex: q.correctIndex,
      correct: answers[i] === q.correctIndex,
      explanation: q.explanation,
      sourceQuote: q.sourceQuote,
    })),
  };
}

/* --- Module 3 : chatbot ancre --- */

export async function repondre(courseId: string, ownerId: string, question: string) {
  const cours = await coursDe(courseId, ownerId);

  // Contexte conversationnel borne : les six derniers messages suffisent et
  // evitent de faire grossir la charge utile a chaque echange.
  const recents = await prisma.chatMessage.findMany({
    where: { courseId },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  const history = recents
    .reverse()
    .map((m) => `${m.role === 'user' ? 'Etudiant' : 'Tuteur'} : ${m.content}`)
    .join('\n');

  await prisma.chatMessage.create({
    data: { courseId, role: 'user', content: question },
  });

  try {
    const { data, telemetry } = await runTask(
      chatTask,
      { courseText: cours.content, question, history },
      {},
    );
    const reponse = data as ChatAnswer;

    return prisma.chatMessage.create({
      data: {
        courseId,
        role: 'assistant',
        content: reponse.answer,
        sources: reponse.sources as object,
        grounded: reponse.grounded,
        model: telemetry.model,
        promptVersion: telemetry.promptVersion,
        tokensIn: telemetry.tokensIn,
        tokensOut: telemetry.tokensOut,
        latencyMs: telemetry.latencyMs,
      },
    });
  } catch (erreur) {
    // La question de l'etudiant reste en base meme si la reponse echoue :
    // il retrouve son fil intact et peut relancer.
    throw erreur;
  }
}

export type { Summary, Quiz, ChatAnswer };
