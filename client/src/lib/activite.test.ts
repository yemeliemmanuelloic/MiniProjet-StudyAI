import { describe, expect, it } from 'vitest';
import { cleJour, grilleActivite, pointsScores } from './activite';

// Mardi 20 octobre 2026, 15 h, heure locale.
const AUJOURDHUI = new Date(2026, 9, 20, 15, 0);
const local = (j: number, h = 10) => new Date(2026, 9, j, h, 0).toISOString();

describe('calendrier de revision', () => {
  it('12 colonnes de 7 jours, du lundi au dimanche, la derniere est la semaine en cours', () => {
    const g = grilleActivite([], AUJOURDHUI);
    expect(g.colonnes).toHaveLength(12);
    expect(g.colonnes.every((c) => c.length === 7)).toBe(true);
    const derniere = g.colonnes[11];
    expect(derniere[0].jour).toBe('2026-10-19'); // lundi
    expect(derniere[1].jour).toBe('2026-10-20'); // aujourd'hui
    expect(derniere[1].futur).toBe(false);
    expect(derniere[2].futur).toBe(true);
  });

  it('compte les activites par jour, en heure locale', () => {
    const g = grilleActivite([local(13), local(13, 23), local(17), 'pas une date'], AUJOURDHUI);
    const cases = g.colonnes.flat();
    expect(cases.find((c) => c.jour === '2026-10-13')?.n).toBe(2);
    expect(g.joursActifs).toBe(2);
    expect(g.total).toBe(3);
  });

  it('niveaux de couleur : 0, 1, 2, 3 (3-4), 4 (5 et plus)', () => {
    const dates = [...Array(5)].map(() => local(15));
    const g = grilleActivite(dates, AUJOURDHUI);
    expect(g.colonnes.flat().find((c) => c.jour === '2026-10-15')?.niveau).toBe(4);
  });

  it('une activite future ou trop ancienne n est pas affichee', () => {
    const g = grilleActivite([local(25), new Date(2026, 0, 5).toISOString()], AUJOURDHUI);
    expect(g.total).toBe(0);
  });

  it('serie : jours consecutifs jusqu a aujourd hui', () => {
    expect(grilleActivite([local(18), local(19), local(20)], AUJOURDHUI).serie).toBe(3);
  });

  it('serie : un jour sans activite aujourd hui ne la casse pas encore', () => {
    expect(grilleActivite([local(18), local(19)], AUJOURDHUI).serie).toBe(2);
  });

  it('serie : un trou la remet a zero', () => {
    expect(grilleActivite([local(17), local(18)], AUJOURDHUI).serie).toBe(0);
  });

  it('cle du jour en heure locale', () => {
    expect(cleJour(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('courbe des scores', () => {
  it('melange quiz et examens rendus, en pourcentage, dans l ordre', () => {
    const p = pointsScores(
      [{ createdAt: '2026-10-15T10:00:00Z', score: 3, total: 5 }],
      [
        { submittedAt: '2026-10-13T10:00:00Z', score: 1, total: 4 },
        { submittedAt: null, score: null, total: 4 },
      ],
    );
    expect(p).toEqual([
      { date: '2026-10-13T10:00:00Z', pct: 25, type: 'examen' },
      { date: '2026-10-15T10:00:00Z', pct: 60, type: 'quiz' },
    ]);
  });

  it('garde les derniers points seulement', () => {
    const t = [...Array(30)].map((_, i) => ({ createdAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T0${i % 10}:00:00Z`, score: i % 5, total: 5 }));
    expect(pointsScores(t, [], 20)).toHaveLength(20);
  });

  it('ignore un quiz sans question', () => {
    expect(pointsScores([{ createdAt: '2026-10-15T10:00:00Z', score: 0, total: 0 }], [])).toEqual([]);
  });
});
