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
  const presentations: Record<string, unknown> = {};
  const cartesMentales: Record<string, unknown> = {};
  const seriesOuvertes: Record<string, unknown> = {};
  let objectifHebdo = 5;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans: any[] = [];
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
    // Un envoi multipart (import de fichier) n'est pas du JSON.
    let corps: any = null;
    try {
      corps = req.postDataJSON?.() ?? null;
    } catch {
      corps = null;
    }
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
    // Journal d'activite : hier et aujourd'hui, donc une serie de deux jours.
    if (chemin.startsWith('/activity') && methode === 'GET') {
      const hier = new Date();
      hier.setDate(hier.getDate() - 1);
      return json(route, { events: [{ type: 'quiz', at: hier.toISOString() }, { type: 'cartes', at: new Date().toISOString() }], weeklyGoal: objectifHebdo });
    }
    if (chemin === '/activity/goal' && methode === 'PUT') {
      objectifHebdo = corps.weeklyGoal;
      return json(route, { weeklyGoal: objectifHebdo });
    }

    // Plan de revision : un calendrier fixe de trois jours, cochable.
    if (chemin === '/plans' && methode === 'GET') return json(route, { plans: plans.map((p) => p.plan) });
    if (chemin === '/plans' && methode === 'POST') {
      const choisis = cours.filter((c) => (corps.courseIds as string[]).includes(c.id));
      const debut = new Date(`${corps.today}T12:00:00`);
      const jourIso = (i: number) => {
        const d = new Date(debut);
        d.setDate(d.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const tache = (i: number, type: string, c?: { id: string; title: string }) => ({
        cle: `${jourIso(i)}:${type}:${c?.id ?? 'tous'}`,
        type,
        courseId: c?.id ?? null,
        courseTitle: c?.title ?? null,
        minutes: type === 'cartes' ? 10 : 15,
        fait: false,
      });
      const p = {
        plan: {
          id: id(),
          title: corps.title,
          examDate: corps.examDate,
          courseIds: corps.courseIds,
          minutesPerDay: corps.minutesPerDay,
          createdAt: maintenant(),
        },
        today: corps.today,
        daysLeft: 3,
        courses: choisis.map((c) => ({ id: c.id, title: c.title, mastery: null, hasSummary: false, hasCards: false })),
        days: [0, 1, 2].map((i) => {
          const taches = i === 2 ? [tache(i, 'examen')] : choisis.map((c) => tache(i, i === 0 ? 'resume' : 'quiz', c));
          return { date: jourIso(i), taches, minutes: taches.reduce((n, t) => n + t.minutes, 0) };
        }),
      };
      plans.push(p);
      return json(route, p, 201);
    }
    const mp = chemin.match(/^\/plans\/([^/]+)(\/tasks)?$/);
    if (mp) {
      const p = plans.find((x) => x.plan.id === mp[1]);
      if (!p) return erreur(route, 404, 'NOT_FOUND', 'Plan introuvable.');
      if (methode === 'DELETE') {
        plans.splice(plans.indexOf(p), 1);
        return route.fulfill({ status: 204 });
      }
      if (mp[2] && methode === 'POST') {
        for (const j of p.days) for (const t of j.taches) if (t.cle === corps.cle) t.fait = corps.fait;
      }
      return json(route, p);
    }

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

    if (chemin === '/courses/import-url' && methode === 'POST') {
      if (String(corps.url).includes('.local/')) {
        return erreur(route, 400, 'VALIDATION_ERROR', "Cette adresse n'est pas une page publique : elle est refusee.");
      }
      const contenu = 'Texte simulé de la page web importée. '.repeat(10);
      const nouveau: Cours = {
        id: id(),
        title: corps.title ?? 'Page simulée',
        subject: null,
        content: contenu,
        charCount: contenu.length,
        createdAt: maintenant(),
        _count: { summaries: 0, quizzes: 0, messages: 0 },
      };
      cours.unshift(nouveau);
      return json(route, { course: nouveau }, 201);
    }
    if (chemin === '/courses/import' && methode === 'POST') {
      // Decision 043 : un enregistrement ou une photo exige l'accord de
      // l'etudiant, transmis dans le champ « consentement ».
      const brut = req.postData() ?? '';
      const nom = /filename="([^"]+)"/.exec(brut)?.[1] ?? 'cours.pdf';
      const titre = /name="title"\r?\n\r?\n([^\r\n]*)/.exec(brut)?.[1] ?? nom;
      const accord = /name="consentement"\r?\n\r?\ntrue/.test(brut);
      const sansTexte = /\.(mp3|m4a|wav|mp4|jpg|jpeg|png)$/i.test(nom);
      if (sansTexte && !accord) {
        return erreur(route, 400, 'VALIDATION_ERROR', 'Accord requis.');
      }
      const contenu = 'Transcription simulée du cours enregistré. '.repeat(10);
      const nouveau: Cours = {
        id: id(),
        title: titre,
        subject: null,
        content: contenu,
        charCount: contenu.length,
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
      // Le cours « c-cartes » a deja un jeu : de quoi exercer l'export.
      if (suite === 'flashcards' && methode === 'GET' && coursId === 'c-cartes') {
        const cards = [1, 2].map((n) => ({
          id: `carte-${n}`,
          recto: `Recto simulé ${n} ?`,
          verso: `Verso simulé ${n}`,
          explication: 'Explication simulée.',
          citation: 'Contenu du cours.',
          dueLe: maintenant(),
          intervalle: 0,
          repetitions: 0,
          revisions: 0,
          derniereNote: null,
        }));
        return json(route, { cards, etat: { total: 2, dues: 2, neuves: 2, acquises: 0 } });
      }
      if (suite === 'flashcards/export' && methode === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'Content-Disposition': 'attachment; filename="cartes-reseaux.txt"' },
          body: ['#separator:tab', '#html:true', '#tags column:3', 'Recto simulé 1 ?\tVerso simulé 1\tStudyAI::reseaux', ''].join('\n'),
        });
      }
      if (suite === 'flashcards' && methode === 'GET')
        return json(route, { cards: [], etat: { total: 0, dues: 0, neuves: 0, acquises: 0 } });
      if (suite === 'messages') return json(route, { messages: [] });
      if (suite === 'conversations' && methode === 'GET') {
        const liste = conversations.filter((x) => x.coursId === coursId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return json(route, { conversations: liste.map(resumeConv) });
      }
      if (suite === 'chat/stream' && methode === 'POST') {
        // La reponse du tuteur au fil de l'eau : le corps NDJSON arrive d'un
        // bloc ici, ce qui suffit a verifier le contrat (evenements, fin).
        let conv = conversations.find((x) => x.id === corps.conversationId);
        if (!conv) {
          conv = { id: id(), coursId, title: null, createdAt: maintenant(), updatedAt: maintenant(), messages: [] };
          conversations.push(conv);
        }
        conv.title ??= corps.question;
        const question = { id: id(), role: 'user', content: corps.question, sources: null, grounded: true, latencyMs: null, createdAt: maintenant(), conversationId: conv.id };
        const texte = `Réponse simulée à : ${corps.question}`;
        const reponse = { id: id(), role: 'assistant', content: texte, sources: ['Contenu du cours.'], grounded: true, latencyMs: 30, createdAt: maintenant(), conversationId: conv.id };
        conv.messages.push(question, reponse);
        conv.updatedAt = maintenant();
        const lignes = [
          { type: 'conversation', conversationId: conv.id },
          { type: 'texte', texte: texte.slice(0, 10) },
          { type: 'texte', texte: texte.slice(10) },
          { type: 'fin', message: reponse },
        ];
        return route.fulfill({
          status: 200,
          contentType: 'application/x-ndjson',
          body: lignes.map((l) => JSON.stringify(l)).join('\n') + '\n',
        });
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
      // Voix naturelle : 204, le lecteur se rabat sur la voix de l'appareil.
      if (suite?.startsWith('presentation/') && suite.includes('/voice/')) return route.fulfill({ status: 204 });
      if (suite === 'translate' && methode === 'POST') {
        const noms: Record<string, string> = { fr: 'Français', en: 'English', ar: 'العربية' };
        const contenu = corps.language === 'ar' ? 'نص الدرس المترجم. '.repeat(20) : 'Translated course text. '.repeat(12);
        const nouveau: Cours = {
          id: id(),
          title: `${c.title} (${noms[corps.language]})`,
          subject: c.subject,
          content: contenu,
          charCount: contenu.length,
          createdAt: maintenant(),
          _count: { summaries: 0, quizzes: 0, messages: 0 },
        };
        cours.unshift(nouveau);
        return json(route, { course: nouveau }, 201);
      }
      if (suite === 'open-quiz' && methode === 'GET') return json(route, { openQuiz: seriesOuvertes[coursId] ?? null });
      if (suite === 'open-quiz' && methode === 'POST') {
        const serie = {
          id: id(),
          questions: Array.from({ length: corps.questionCount ?? 3 }, (_, i) => `Expliquez la notion simulée ${i + 1}.`),
          createdAt: maintenant(),
        };
        seriesOuvertes[coursId] = serie;
        return json(route, { openQuiz: serie }, 201);
      }
      if (suite === 'mindmap' && methode === 'GET') return json(route, { mindMap: cartesMentales[coursId] ?? null });
      if (suite === 'mindmap' && methode === 'POST') {
        const m = {
          id: id(),
          payload: {"sujet": "L'ordonnancement des processus", "branches": [{"idee": "Rôle de l'ordonnanceur", "citation": "Ordonnancement des processus.", "enfants": [{"idee": "Multitâche sur un seul cœur", "citation": "Ordonnancement des processus."}]}, {"idee": "États d'un processus", "citation": "Ordonnancement des processus.", "enfants": [{"idee": "Processus bloqué", "citation": "Ordonnancement des processus."}, {"idee": "Retour à l'état prêt", "citation": "Ordonnancement des processus."}]}, {"idee": "Algorithme FIFO", "citation": "Ordonnancement des processus.", "enfants": [{"idee": "Simplicité", "citation": "Ordonnancement des processus."}, {"idee": "Effet de convoi", "citation": "Ordonnancement des processus."}]}, {"idee": "Algorithme SJF", "citation": "Ordonnancement des processus.", "enfants": [{"idee": "Minimise l'attente moyenne", "citation": "Ordonnancement des processus."}, {"idee": "Durée souvent inconnue", "citation": "Ordonnancement des processus."}]}, {"idee": "Algorithme du tourniquet", "citation": "Ordonnancement des processus.", "enfants": [{"idee": "Quantum de temps", "citation": "Ordonnancement des processus."}, {"idee": "Quantum trop court", "citation": "Ordonnancement des processus."}, {"idee": "Quantum trop long", "citation": "Ordonnancement des processus."}]}, {"idee": "Ordonnancement par priorités", "citation": "Ordonnancement des processus.", "enfants": [{"idee": "Risque de famine", "citation": "Ordonnancement des processus."}, {"idee": "Vieillissement", "citation": "Ordonnancement des processus."}]}]},
          model: 'modele-simule',
          promptVersion: 'v-test',
          latencyMs: 40,
          createdAt: maintenant(),
        };
        cartesMentales[coursId] = m;
        return json(route, { mindMap: m }, 201);
      }
      if (suite === 'presentation' && methode === 'GET') return json(route, { presentation: presentations[coursId] ?? null });
      if (suite === 'presentation' && methode === 'POST') {
        const p = {
          id: id(),
          payload: {
            titre: 'Présentation simulée',
            scenes: [1, 2, 3, 4, 5].map((n) => ({
              titre: `Scène simulée ${n}`,
              points: [`Point A${n}`, `Point B${n}`],
              narration: `Narration simulée de la scène ${n}, à lire à voix haute.`,
              citation: 'Contenu du cours.',
            })),
          },
          model: 'modele-simule',
          promptVersion: 'v-test',
          latencyMs: 40,
          createdAt: maintenant(),
        };
        presentations[coursId] = p;
        return json(route, { presentation: p }, 201);
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

    if (/^\/open-quizzes\/[^/]+\/submit$/.test(chemin) && methode === 'POST') {
      const reponses: string[] = corps.answers;
      const correction = reponses.map((r, i) => {
        const etats = r.trim() ? ['acquis', 'partiel'] : ['absent', 'absent'];
        return {
          question: `Expliquez la notion simulée ${i + 1}.`,
          reponse: r,
          attendus: etats.map((etat, j) => ({ point: `Point attendu ${j + 1}.`, citation: 'Contenu du cours.', etat })),
          erreurs: r.includes('faux') ? [{ affirmation: 'Une affirmation fausse.', correction: 'La correction tirée du cours.', citation: 'Contenu du cours.' }] : [],
          commentaire: r.trim() ? 'Commentaire de correction simulé.' : 'Aucune réponse.',
          reponseModele: 'Réponse modèle simulée.',
          note: r.trim() ? 15 : 0,
        };
      });
      const score = correction.reduce((n, c) => n + c.note, 0) / correction.length;
      return json(route, { id: id(), score, correction, createdAt: maintenant() });
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
        cardsQueued: reponses.length - score,
      });
    }

    return erreur(route, 404, 'NOT_FOUND', `Route non simulee : ${methode} ${chemin}`);
  });
}
