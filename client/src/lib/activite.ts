/**
 * Activite de revision : calendrier des jours actifs et courbe des scores
 * (20 octobre).
 *
 * Logique pure, sans React : la page « Mes cours » l'affiche, les tests
 * l'exercent. Les donnees viennent de lectures deja exposees par l'API
 * (tentatives de quiz, examens blancs rendus) : aucun appel au modele, aucun
 * changement du serveur.
 *
 * Les jours sont comptes en heure LOCALE : un quiz rendu a 23 h 30 compte
 * pour le jour ou l'etudiant l'a fait, pas pour le lendemain en UTC.
 */

export type TypeActivite = 'quiz' | 'examen';

export interface Case {
  /** AAAA-MM-JJ, heure locale. */
  jour: string;
  n: number;
  niveau: 0 | 1 | 2 | 3 | 4;
  /** Jour pas encore arrive (fin de la semaine en cours). */
  futur: boolean;
}

export interface Grille {
  /** Une colonne par semaine, du lundi au dimanche. */
  colonnes: Case[][];
  joursActifs: number;
  /** Jours consecutifs avec activite, jusqu'a aujourd'hui (ou hier). */
  serie: number;
  total: number;
}

export interface Point {
  date: string;
  /** Score en pourcentage, pour comparer des quiz de longueurs differentes. */
  pct: number;
  type: TypeActivite;
}

const deux = (n: number) => String(n).padStart(2, '0');

export function cleJour(d: Date): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

function niveau(n: number): Case['niveau'] {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 3;
  return 4;
}

export function grilleActivite(dates: string[], aujourdhui: Date, semaines = 12): Grille {
  const parJour = new Map<string, number>();
  for (const iso of dates) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const cle = cleJour(d);
    parJour.set(cle, (parJour.get(cle) ?? 0) + 1);
  }

  const jour0 = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  // Lundi de la semaine en cours (getDay : 0 = dimanche).
  const decalage = (jour0.getDay() + 6) % 7;
  const debut = new Date(jour0);
  debut.setDate(jour0.getDate() - decalage - 7 * (semaines - 1));

  const colonnes: Case[][] = [];
  let joursActifs = 0;
  let total = 0;
  for (let s = 0; s < semaines; s++) {
    const colonne: Case[] = [];
    for (let j = 0; j < 7; j++) {
      const d = new Date(debut);
      d.setDate(debut.getDate() + s * 7 + j);
      const cle = cleJour(d);
      const futur = d > jour0;
      const n = futur ? 0 : parJour.get(cle) ?? 0;
      if (n > 0) {
        joursActifs += 1;
        total += n;
      }
      colonne.push({ jour: cle, n, niveau: niveau(n), futur });
    }
    colonnes.push(colonne);
  }

  // Serie : on part d'aujourd'hui ; un jour sans activite AUJOURD'HUI ne
  // casse pas encore la serie (la journee n'est pas finie), on part d'hier.
  let serie = 0;
  const curseur = new Date(jour0);
  if (!parJour.has(cleJour(curseur))) curseur.setDate(curseur.getDate() - 1);
  while (parJour.has(cleJour(curseur))) {
    serie += 1;
    curseur.setDate(curseur.getDate() - 1);
  }

  return { colonnes, joursActifs, serie, total };
}

export function pointsScores(
  tentatives: Array<{ createdAt: string; score: number; total: number }>,
  examens: Array<{ submittedAt: string | null; score: number | null; total: number }>,
  max = 20,
): Point[] {
  const points: Point[] = [];
  for (const t of tentatives) {
    if (t.total > 0) points.push({ date: t.createdAt, pct: Math.round((100 * t.score) / t.total), type: 'quiz' });
  }
  for (const e of examens) {
    if (e.submittedAt && e.score !== null && e.total > 0) {
      points.push({ date: e.submittedAt, pct: Math.round((100 * e.score) / e.total), type: 'examen' });
    }
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points.slice(-max);
}
