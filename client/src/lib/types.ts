/** Formes retournees par l'API StudyAI. Miroir des schemas du serveur. */

export interface CoursResume {
  id: string;
  title: string;
  subject: string | null;
  charCount: number;
  createdAt: string;
  _count: { summaries: number; quizzes: number; messages: number };
}

export interface Cours extends Omit<CoursResume, '_count'> {
  content: string;
  _count?: CoursResume['_count'];
}

/* --- Module 1 : resume --- */

export interface ResumePayload {
  abstract: string;
  keyPoints: string[];
  keywords: string[];
  warnings: string[];
}

export interface Resume {
  id: string;
  level: string;
  payload: ResumePayload;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
  /** 1 = cours traite en un appel ; n = cours long, resume par agregation. */
  segmentCount: number;
  createdAt: string;
}

/* --- Module 2 : quiz --- */

/** Ce que le navigateur recoit : PAS de bonne reponse, PAS d'explication. */
export interface QuestionPosee {
  question: string;
  options: string[];
}

export interface QuizPose {
  id: string;
  questionCount: number;
  /** Nombre de segments du cours : > 1 signale un cours traite par morceaux. */
  segmentCount: number;
  questions: QuestionPosee[];
}

export interface LigneCorrection {
  question: string;
  chosen: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string;
  sourceQuote: string;
}

export interface Correction {
  attempt: { id: string; score: number; total: number; createdAt: string };
  correction: LigneCorrection[];
}

/* --- Module 3 : chatbot --- */

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: string[] | null;
  grounded: boolean;
  latencyMs: number | null;
  createdAt: string;
  /** Conversation du tuteur a laquelle appartient le message. */
  conversationId?: string | null;
}

/** Une conversation avec le tuteur (20 octobre). */
export interface Conversation {
  id: string;
  /** Premiere question ; nul pour un brouillon ou des messages anterieurs. */
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export const LIBELLE_NIVEAU: Record<string, string> = {
  court: 'Court',
  standard: 'Standard',
  detaille: 'Detaille',
};

/* --- Espace revision --- */

export interface Tentative {
  id: string;
  quizId: string;
  score: number;
  total: number;
  difficulty: string;
  createdAt: string;
}

export interface QuestionFaible {
  question: string;
  wrongCount: number;
  sourceQuote: string;
}

export interface Progression {
  attemptCount: number;
  /** Scores en pourcentage : des quiz de longueurs differentes restent comparables. */
  averageScore: number;
  bestScore: number;
  lastScore: number;
  trend: number[];
  weakQuestions: QuestionFaible[];
}

/* --- Examen blanc multi-cours --- */

export interface CoursDeLExamen {
  id: string;
  title: string;
}

export interface AvertissementExamen {
  courseId: string;
  courseTitle: string;
  attendu: number;
  obtenu: number;
  raison: string;
}

/** Ce que le navigateur recoit PENDANT l'epreuve : ni reponse ni explication. */
export interface ExamenPose {
  id: string;
  courses: CoursDeLExamen[];
  questions: { question: string; options: string[] }[];
  warnings: AvertissementExamen[];
  total: number;
  durationS: number;
  remainingS: number;
  startedAt: string;
  submittedAt: string | null;
}

export interface ExamenResume {
  id: string;
  courses: CoursDeLExamen[];
  total: number;
  score: number | null;
  durationS: number;
  late: boolean;
  createdAt: string;
  submittedAt: string | null;
}

export interface LigneCorrectionExamen {
  question: string;
  options: string[];
  chosen: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string;
  sourceQuote: string;
  courseId: string;
  courseTitle: string;
}

export interface ScoreParCours {
  courseId: string;
  courseTitle: string;
  score: number;
  total: number;
}

export interface CorrectionExamen {
  exam: ExamenResume;
  correction: LigneCorrectionExamen[];
  parCours: ScoreParCours[];
}

/* --- Recherche et tuteur transversaux --- */

export interface Passage {
  courseId: string;
  courseTitle: string;
  rang: number;
  total: number;
  extrait: string;
  score: number;
}

export interface ResultatsRecherche {
  query: string;
  /** Les mots effectivement cherches, rendus par le serveur pour que le
   *  surlignage applique exactement les memes regles que le classement. */
  terms: string[];
  passages: Passage[];
}

export interface ReponseBibliotheque {
  answer: string;
  grounded: boolean;
  sources: string[];
  courses: CoursDeLExamen[];
  /** Faux quand aucun passage ne correspondait : repondu sans appel. */
  appeleLeModele: boolean;
  tokenTypes: string[];
  latencyMs: number | null;
  model: string | null;
}

/* --- Tableau de consommation --- */

export interface ConsommationModule {
  module: string;
  operations: number;
  calls: number;
  operationsSansDecompte: number;
  tokensIn: number;
  tokensOut: number;
  latenceMoyenneMs: number | null;
  latenceMaxMs: number | null;
  cout: number;
}

export interface Consommation {
  parModule: ConsommationModule[];
  total: {
    operations: number;
    calls: number;
    operationsSansDecompte: number;
    tokensIn: number;
    tokensOut: number;
    cout: number;
  };
  parCours: {
    courseId: string;
    courseTitle: string;
    operations: number;
    tokensIn: number;
    tokensOut: number;
    cout: number;
  }[];
  parModele: {
    model: string;
    operations: number;
    tokensIn: number;
    tokensOut: number;
    latenceMoyenneMs: number | null;
    cout: number;
  }[];
  gratuit: { examens: number; questionsServies: number };
  tarif: {
    entreeParMillion: number;
    sortieParMillion: number;
    devise: string;
    source: string;
  };
}

/**
 * Carte de revision espacee.
 *
 * Le verso descend AVEC la carte, contrairement au quiz dont le serveur
 * retire la bonne reponse. Une carte est auto-evaluee : il n'y a rien a
 * proteger, et elle doit se retourner sans aller-retour reseau.
 */
export interface Carte {
  id: string;
  recto: string;
  verso: string;
  explication: string;
  citation: string | null;
  dueLe: string;
  intervalle: number;
  repetitions: number;
  revisions: number;
  derniereNote: number | null;
}

export interface EtatJeu {
  total: number;
  /** « Dues » et « neuves » se recouvrent : une carte neuve est due. */
  dues: number;
  neuves: number;
  acquises: number;
}

export interface Jeu {
  cards: Carte[];
  etat: EtatJeu;
}

export interface Materialisation {
  creees: number;
  ignorees: number;
  /** Toujours zero. Affiche, pour que la gratuite se verifie a l'ecran. */
  appels: number;
  etat: EtatJeu;
}

/** La carte notee, et le compte du jeu APRES la note : le navigateur ne
 *  recompte rien, et le seuil « acquise » ne vit que cote serveur. */
export interface Revision {
  card: Carte;
  etat: EtatJeu;
}

export type BoutonCarte = 'oublie' | 'difficile' | 'correct' | 'facile';


/* --- Presentation narree (decision 044) --- */

export interface Scene {
  titre: string;
  points: string[];
  narration: string;
  citation: string;
}

export interface Presentation {
  id: string;
  payload: { titre: string; scenes: Scene[] };
  model: string;
  promptVersion: string;
  latencyMs: number | null;
  createdAt: string;
}

/* --- Plan de revision (decision 046) --- */

export interface PlanResume {
  id: string;
  title: string;
  examDate: string;
  courseIds: string[];
  minutesPerDay: number;
  createdAt: string;
}

export interface TachePlan {
  cle: string;
  type: 'resume' | 'quiz' | 'cartes' | 'examen';
  courseId: string | null;
  courseTitle: string | null;
  minutes: number;
  fait: boolean;
}

export interface JourPlan {
  date: string;
  taches: TachePlan[];
  minutes: number;
}

export interface CalendrierPlan {
  plan: PlanResume;
  today: string;
  daysLeft: number;
  courses: { id: string; title: string; mastery: number | null; hasSummary: boolean; hasCards: boolean }[];
  days: JourPlan[];
}

/* --- Carte mentale (decision 047) --- */

export interface IdeeCarte {
  idee: string;
  citation: string;
  enfants?: IdeeCarte[];
}

export interface CarteMentale {
  id: string;
  payload: { sujet: string; branches: IdeeCarte[] };
  model: string;
  promptVersion: string;
  latencyMs: number | null;
  createdAt: string;
}
