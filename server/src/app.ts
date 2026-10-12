import cors from 'cors';
import express from 'express';
import { env } from './env.js';
import { errorHandler } from './middleware/index.js';
import { authRouter } from './routes/auth.js';
import { coursesRouter } from './routes/courses.js';
import { studyRouter } from './routes/study.js';

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/courses', coursesRouter);
app.use('/api', studyRouter);

// Toujours en dernier : c'est lui qui donne sa forme unique a chaque erreur.
app.use(errorHandler);
