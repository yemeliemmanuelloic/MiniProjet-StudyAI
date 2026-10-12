import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { AppError } from '../errors.js';
import { authenticate, wrap } from '../middleware/index.js';
import { empreinte } from '../services/study.js';

export const coursesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

coursesRouter.use(authenticate);

const saisie = z.object({
  title: z.string().min(3),
  subject: z.string().optional(),
  content: z.string().min(200, 'Un cours doit faire au moins 200 caracteres.'),
});

/** Liste des cours de l'etudiant, sans le contenu : inutile et volumineux. */
coursesRouter.get(
  '/',
  wrap(async (req, res) => {
    const courses = await prisma.course.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        subject: true,
        charCount: true,
        createdAt: true,
        _count: { select: { summaries: true, quizzes: true, messages: true } },
      },
    });
    res.json({ courses });
  }),
);

coursesRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw new AppError('NOT_FOUND', 'Cours introuvable.');
    if (course.ownerId !== req.user!.id) {
      throw new AppError('FORBIDDEN', "Ce cours ne vous appartient pas.");
    }
    res.json({ course });
  }),
);

coursesRouter.post(
  '/',
  wrap(async (req, res) => {
    const data = saisie.parse(req.body);
    const contenu = data.content.slice(0, env.MAX_CV_CHARS);

    const course = await prisma.course.create({
      data: {
        ownerId: req.user!.id,
        title: data.title,
        subject: data.subject,
        content: contenu,
        charCount: contenu.length,
        hash: empreinte(contenu),
      },
    });
    res.status(201).json({ course });
  }),
);

/**
 * Import d'un PDF a couche texte. L'extraction n'appelle PAS le modele :
 * c'est une operation locale et gratuite, separee des trois modules IA.
 */
coursesRouter.post(
  '/import',
  upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) throw new AppError('VALIDATION_ERROR', 'Aucun fichier recu.');
    if (req.file.mimetype !== 'application/pdf') {
      throw new AppError('VALIDATION_ERROR', 'Seuls les PDF a couche texte sont acceptes.');
    }

    const { default: pdfParse } = await import('pdf-parse');
    let texte = (await pdfParse(req.file.buffer)).text.trim();

    if (texte.length < 200) {
      throw new AppError(
        'VALIDATION_ERROR',
        "Aucun texte exploitable. Un PDF scanne (image) n'est pas supporte.",
      );
    }
    if (texte.length > env.MAX_CV_CHARS) texte = texte.slice(0, env.MAX_CV_CHARS);

    const titre = (req.body?.title as string) || req.file.originalname.replace(/\.pdf$/i, '');
    const course = await prisma.course.create({
      data: {
        ownerId: req.user!.id,
        title: titre,
        subject: req.body?.subject || null,
        content: texte,
        charCount: texte.length,
        hash: empreinte(texte),
      },
    });

    res.status(201).json({ course, charCount: texte.length });
  }),
);

coursesRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw new AppError('NOT_FOUND', 'Cours introuvable.');
    if (course.ownerId !== req.user!.id) {
      throw new AppError('FORBIDDEN', "Ce cours ne vous appartient pas.");
    }
    await prisma.course.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
