import { describe, expect, it } from 'vitest';
import { filtrerEtTrier, normaliser } from './triCours';

const C = (id: string, title: string, createdAt: string, subject: string | null = null) => ({
  id,
  title,
  subject,
  createdAt,
});

const COURS = [
  C('a', 'Atelier SGBL', '2026-10-13T10:00:00Z', 'Architecture logicielle'),
  C('b', 'Chapitre 2 — Prompt Engineering', '2026-10-20T10:00:00Z', 'IA for Software Engineering'),
  C('c', 'Système d’exploitation', '2026-10-15T10:00:00Z'),
];

const SUIVI = {
  a: { dues: 8, progression: { attemptCount: 2, averageScore: 40 } },
  b: { dues: 0 },
  c: { dues: 13, progression: { attemptCount: 3, averageScore: 75 } },
};

const ids = (l: { id: string }[]) => l.map((c) => c.id);

describe('filtre et tri de « Mes cours »', () => {
  it('par defaut, le plus recent d abord', () => {
    expect(ids(filtrerEtTrier(COURS, '', 'recent', SUIVI))).toEqual(['b', 'c', 'a']);
  });

  it('par titre, dans l ordre alphabetique', () => {
    expect(ids(filtrerEtTrier(COURS, '', 'titre', SUIVI))).toEqual(['a', 'b', 'c']);
  });

  it('a revoir : le plus de cartes dues d abord', () => {
    expect(ids(filtrerEtTrier(COURS, '', 'revoir', SUIVI))).toEqual(['c', 'a', 'b']);
  });

  it('score : le plus faible d abord, les cours sans quiz a la fin', () => {
    expect(ids(filtrerEtTrier(COURS, '', 'score', SUIVI))).toEqual(['a', 'c', 'b']);
  });

  it('la recherche ignore accents et majuscules, et regarde aussi la matiere', () => {
    expect(ids(filtrerEtTrier(COURS, 'SYSTEME', 'recent', SUIVI))).toEqual(['c']);
    expect(ids(filtrerEtTrier(COURS, 'architecture', 'recent', SUIVI))).toEqual(['a']);
    expect(filtrerEtTrier(COURS, 'introuvable', 'recent', SUIVI)).toEqual([]);
  });

  it('ne modifie pas la liste d origine', () => {
    const copie = [...COURS];
    filtrerEtTrier(COURS, '', 'titre', SUIVI);
    expect(COURS).toEqual(copie);
  });

  it('normalise les accents', () => {
    expect(normaliser('  Écrire ÉLÈVE ')).toBe('ecrire eleve');
  });
});
