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
}

export const LIBELLE_NIVEAU: Record<string, string> = {
  court: 'Court',
  standard: 'Standard',
  detaille: 'Detaille',
};
