import type { Page, Route } from '@playwright/test';

/**
 * API SIMULEE pour les tests de bout en bout.
 *
 * Elle reproduit les formes de reponse de l'API reelle (voir
 * src/lib/types.ts et docs/API.md), en memoire, pour un seul test. Toute
 * route non prevue repond 404 dans l'enveloppe d'erreur habituelle : un
 * oubli se voit, il ne passe pas en silence.
 */

export const COMPTE = { email: 'etudiante@exemple.test', motDePasse: 'motdepasse-e2e' };

interface Cours {
  id: string;
  title: string;
  subject: string | null;
  content: string;
  charCount: number;
  createdAt: string;
  _count: { summaries: number; quizzes: number; messages: number };
}

export interface Options {
  /** Session ouverte des le depart (jeton pose dans localStorage). */
  connecte?: boolean;
  /** Cours deja presents. */
  cours?: Array<Pick<Cours, 'title'> & Partial<Cours>>;
  /** Erreur a renvoyer pour la generation du resume (ex. LLM_KEY_MISSING). */
  erreurResume?: { statut: number; code: string; message: string };
}

const JETON = 'jeton-e2e';

function erreur(route: Route, statut: number, code: string, message: string) {
  return route.fulfill({
    status: statut,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code, message, details: {} } }),
  });
}

const json = (route: Route, corps: unknown, statut = 200) =>
  route.fulfill({ status: statut, contentType: 'application/json', body: JSON.stringify(corps) });

export async function simulerApi(page: Page, options: Options = {}) {
  let suivant = 1;
  const id = () => `id-${suivant++}`;
  const maintenant = () => new Date().toISOString();
  const utilisateur = { id: 'u-1', email: COMPTE.email, createdAt: '2026-10-01T08:00:00Z', previousLoginAt: null };
  const cours: Cours[] = (options.cours ?? []).map((c, i) => ({
    id: c.id ?? `c-${i + 1}`,
    title: c.title,
    subject: c.subject ?? null,
    content: c.content ?? 'Contenu du cours. '.repeat(20),
    charCount: (c.content ?? 'x'.repeat(360)).length,
    createdAt: c.createdAt ?? `2026-10-1${i}T10:00:00Z`,
    _count: { summaries: 0, quizzes: 0, messages: 0 },
  }));
  const resumes: Record<string, unknown[]> = {};
  const quiz: Record<string, { coursId: string }> = {};
  type Conv = { id: string; coursId: string; title: string | null; createdAt: string; updatedAt: string; messages: unknown[] };
  const conversations: Conv[] = [];
  const resumeConv = (c: Conv) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length });

  if (options.connecte) {
    await page.addInitScript((j) => localStorage.setItem('token', j), JETON);
  }

  await page.route('**/api.studyai.test/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const chemin = url.pathname.replace(/^\/api/, '');
    const methode = req.method();
    const corps = req.postDataJSON?.() ?? null;
    const autorise = req.headers().authorization === `Bearer ${JETON}`;

    if (chemin === '/health') return json(route, { status: 'ok' });

    if (chemin === '/auth/login' && methode === 'POST') {
      if (corps?.email === COMPTE.email && corps?.password === COMPTE.motDePasse) {
        return json(route, { user: utilisateur, token: JETON });
      }
      return erreur(route, 401, 'UNAUTHORIZED', 'Identifiants invalides.');
    }
    if (chemin === '/auth/register' && methode === 'POST') {
      return json(route, { user: { ...utilisateur, email: corps.email }, token: JETON }, 201);
    }

    if (!autorise) return erreur(route, 401, 'UNAUTHORIZED', 'Authentification requise.');

    if (chemin === '/auth/me' && methode === 'GET') return json(route, { user: utilisateur });
    if (chemin === '/exams' && methode === 'GET') return json(route, { exams: [] });

    if (chemin === '/courses' && methode === 'GET') return json(route, { courses: cours });
    if (chemin === '/courses' && methode === 'POST') {
      const nouveau: Cours = {
        id: id(),
        title: corps.title,
        subject: corps.subject ?? null,
        content: corps.content,
        charCount: corps.content.length,
        createdAt: maintenant(),
        _count: { summaries: 0, quizzes: 0, messages: 0 },
      };
      cours.unshift(nouveau);
      return json(route, { course: nouveau }, 201);
    }

    const m = chemin.match(/^\/courses\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      const [, coursId, suite] = m;
      const c = cours.find((x) => x.id === coursId);
      if (!c) return erreur(route, 404, 'NOT_FOUND', 'Cours introuvable.');
      if (!suite && methode === 'GET') return json(route, { course: c });
      if (!suite && methode === 'DELETE') {
        cours.splice(cours.indexOf(c), 1);
        return route.fulfill({ status: 204 });
      }
      if (suite === 'progress')
        return json(route, { attemptCount: 0, averageScore: 0, bestScore: 0, lastScore: 0, trend: [], weakQuestions: [] });
      if (suite === 'attempts') return json(route, { attempts: [] });
      if (suite === 'flashcards' && methode === 'GET')
        return json(route, { cards: [], etat: { total: 0, dues: 0, neuves: 0, acquises: 0 } });
      if (suite === 'messages') return json(route, { messages: [] });
      if (suite === 'conversations' && methode === 'GET') {
        const liste = conversations.filter((x) => x.coursId === coursId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return json(route, { conversations: liste.map(resumeConv) });
      }
      if (suite === 'chat' && methode === 'POST') {
        let conv = conversations.find((x) => x.id === corps.conversationId);
        if (!conv) {
          conv = { id: id(), coursId, title: null, createdAt: maintenant(), updatedAt: maintenant(), messages: [] };
          conversations.push(conv);
        }
        conv.title ??= corps.question;
        const question = { id: id(), role: 'user', content: corps.question, sources: null, grounded: true, latencyMs: null, createdAt: maintenant(), conversationId: conv.id };
        const reponse = { id: id(), role: 'assistant', content: `Réponse simulée à : ${corps.question}`, sources: ['Contenu du cours.'], grounded: true, latencyMs: 30, createdAt: maintenant(), conversationId: conv.id };
        conv.messages.push(question, reponse);
        conv.updatedAt = maintenant();
        return json(route, { message: reponse });
      }
      if (suite === 'summaries') return json(route, { summaries: resumes[coursId] ?? [] });
      if (suite === 'summary' && methode === 'POST') {
        const e = options.erreurResume;
        if (e) return erreur(route, e.statut, e.code, e.message);
        const r = {
          id: id(),
          level: corps?.level ?? 'standard',
          payload: {
            abstract: 'Synthese simulee : le cours presente les notions essentielles.',
            keyPoints: ['Premier point cle', 'Deuxieme point cle'],
            keywords: ['notion'],
            warnings: [],
          },
          model: 'modele-simule',
          promptVersion: 'v-test',
          latencyMs: 42,
          segmentCount: 1,
          createdAt: maintenant(),
        };
        (resumes[coursId] ??= []).unshift(r);
        return json(route, { summary: r });
      }
      if (suite === 'quiz' && methode === 'POST') {
        const q = id();
        quiz[q] = { coursId };
        return json(route, {
          quiz: {
            id: q,
            questionCount: 3,
            segmentCount: 1,
            questions: [1, 2, 3].map((n) => ({
              question: `Question simulee numero ${n} ?`,
              options: ['Bonne reponse', 'Mauvaise A', 'Mauvaise B', 'Mauvaise C'],
            })),
          },
        });
      }
    }

    const conv = chemin.match(/^\/conversations\/([^/]+)(\/messages)?$/);
    if (conv) {
      const c = conversations.find((x) => x.id === conv[1]);
      if (!c) return erreur(route, 404, 'NOT_FOUND', 'Conversation introuvable.');
      if (conv[2] && methode === 'GET') return json(route, { messages: c.messages });
      if (!conv[2] && methode === 'DELETE') {
        conversations.splice(conversations.indexOf(c), 1);
        return route.fulfill({ status: 204 });
      }
    }

    const soumission = chemin.match(/^\/quizzes\/([^/]+)\/submit$/);
    if (soumission && methode === 'POST') {
      const reponses: Array<number | null> = corps.answers;
      const correction = reponses.map((choisi, i) => ({
        question: `Question simulee numero ${i + 1} ?`,
        chosen: choisi,
        correctIndex: 0,
        correct: choisi === 0,
        explanation: 'Explication simulee.',
        sourceQuote: 'Contenu du cours.',
      }));
      const score = correction.filter((l) => l.correct).length;
      return json(route, {
        attempt: { id: id(), score, total: reponses.length, createdAt: maintenant() },
        correction,
      });
    }

    return erreur(route, 404, 'NOT_FOUND', `Route non simulee : ${methode} ${chemin}`);
  });
}
