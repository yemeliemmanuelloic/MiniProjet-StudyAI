import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env } from '../env.js';
import { AppError } from '../errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export function signToken(user: { id: string }): string {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: '7d' });
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Authentification requise.'));
  }
  try {
    req.user = jwt.verify(header.slice(7), env.JWT_SECRET) as Request['user'];
    next();
  } catch {
    next(new AppError('UNAUTHORIZED', 'Session expiree, reconnectez-vous.'));
  }
}

/** Enveloppe les handlers async pour que leurs rejets atteignent errorHandler. */
export function wrap<T extends Request>(
  handler: (req: T, res: Response) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req as T, res).catch(next);
  };
}

/**
 * Forme d'erreur unique pour toute l'API (doc 01-architecture, section 5).
 * Le front lit `error.code` et n'a jamais a composer de message lui-meme.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Donnees invalides.',
        details: error.flatten().fieldErrors,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.code.startsWith('LLM_')) {
      console.error(`[llm] ${error.code}`, error.details);
    }
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  console.error('[internal]', error);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Erreur interne.', details: {} },
  });
}
