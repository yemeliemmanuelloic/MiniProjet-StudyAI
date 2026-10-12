import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { authenticate, signToken, wrap } from '../middleware/index.js';

export const authRouter = Router();

/**
 * StudyAI n'a qu'un seul type d'utilisateur : l'etudiant. Pas de role, donc
 * pas de matrice d'habilitation — la seule regle d'acces est la propriete :
 * un etudiant ne voit que SES cours.
 */

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post(
  '/register',
  wrap(async (req, res) => {
    const { email, password } = credentials.parse(req.body);

    if (await prisma.user.findUnique({ where: { email } })) {
      throw new AppError('VALIDATION_ERROR', 'Cette adresse est deja utilisee.');
    }

    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 10) },
    });

    res.status(201).json({
      user: { id: user.id, email: user.email },
      token: signToken({ id: user.id }),
    });
  }),
);

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError('UNAUTHORIZED', 'Identifiants incorrects.');
    }

    res.json({
      user: { id: user.id, email: user.email },
      token: signToken({ id: user.id }),
    });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  wrap(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError('NOT_FOUND', 'Utilisateur introuvable.');
    res.json({ user: { id: user.id, email: user.email } });
  }),
);
