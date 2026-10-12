import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { authenticate, wrap } from '../middleware/index.js';
import { corrigerQuiz, genererQuiz, repondre, resumer } from '../services/study.js';
import type { Quiz } from '../llm/schemas.js';

export const studyRouter = Router();

studyRouter.use(authenticate);

/* --- Module 1 : resume --- */

studyRouter.post(
  '/courses/:id/summary',
  wrap(async (req, res) => {
    const { level } = z
      .object({ level: z.enum(['court', 'standard', 'detaille']).default('standard') })
      .parse(req.body ?? {});
    const summary = await resumer(req.params.id, req.user!.id, level);
    res.json({ summary });
  }),
);

studyRouter.get(
  '/courses/:id/summaries',
  wrap(async (req, res) => {
    const summaries = await prisma.summary.findMany({
      where: { courseId: req.params.id, course: { ownerId: req.user!.id } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ summaries });
  }),
);

/* --- Module 2 : quiz --- */

studyRouter.post(
  '/courses/:id/quiz',
  wrap(async (req, res) => {
    const { questionCount, difficulty } = z
      .object({
        questionCount: z.number().int().min(3).max(20).default(5),
        difficulty: z.enum(['facile', 'standard', 'difficile']).default('standard'),
      })
      .parse(req.body ?? {});

    const quiz = await genererQuiz(req.params.id, req.user!.id, questionCount, difficulty);

    // La bonne reponse et l'explication ne descendent PAS au navigateur :
    // sinon l'auto-evaluation n'a plus aucun sens, il suffit de lire le JSON.
    const questions = (quiz.payload as unknown as Quiz).questions.map((q) => ({
      question: q.question,
      options: q.options,
    }));

    res.json({ quiz: { id: quiz.id, questionCount: quiz.questionCount, questions } });
  }),
);

studyRouter.post(
  '/quizzes/:id/submit',
  wrap(async (req, res) => {
    const { answers } = z
      .object({ answers: z.array(z.number().int().min(0).max(3)) })
      .parse(req.body);
    res.json(await corrigerQuiz(req.params.id, req.user!.id, answers));
  }),
);

/* --- Module 3 : chatbot ancre --- */

studyRouter.get(
  '/courses/:id/messages',
  wrap(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw new AppError('NOT_FOUND', 'Cours introuvable.');
    if (course.ownerId !== req.user!.id) throw new AppError('FORBIDDEN', 'Cours non accessible.');

    const messages = await prisma.chatMessage.findMany({
      where: { courseId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ messages });
  }),
);

studyRouter.post(
  '/courses/:id/chat',
  wrap(async (req, res) => {
    const { question } = z.object({ question: z.string().min(3).max(1000) }).parse(req.body);
    const message = await repondre(req.params.id, req.user!.id, question);
    res.json({ message });
  }),
);

/* --- Transparence : ce qui a ete transmis au modele --- */

studyRouter.get(
  '/summaries/:id/payload',
  wrap(async (req, res) => {
    const summary = await prisma.summary.findUnique({
      where: { id: req.params.id },
      include: { course: true },
    });
    if (!summary) throw new AppError('NOT_FOUND', 'Resume introuvable.');
    if (summary.course.ownerId !== req.user!.id) {
      throw new AppError('FORBIDDEN', 'Resume non accessible.');
    }
    const types = [...summary.sentPayload.matchAll(/\[([A-Z_]+)_\d+\]/g)].map((m) => m[1]);
    res.json({ payload: summary.sentPayload, tokenMap: [...new Set(types)] });
  }),
);
