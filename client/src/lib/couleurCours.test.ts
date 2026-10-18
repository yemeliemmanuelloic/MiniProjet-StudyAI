import { describe, expect, it } from 'vitest';
import { NOMBRE_TEINTES, classeCours, teinteCours } from './couleurCours';

describe('la couleur d un cours', () => {
  it('est stable, et insensible a la casse et aux espaces de bord', () => {
    expect(teinteCours('Atelier SGBL')).toBe(teinteCours('  atelier sgbl '));
    expect(classeCours('Atelier SGBL')).toBe(`ton-cours-${teinteCours('Atelier SGBL')}`);
  });

  it('reste dans la gamme definie par les jetons', () => {
    for (let i = 0; i < 500; i += 1) {
      const t = teinteCours(`Cours ${i}`);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(NOMBRE_TEINTES);
    }
  });

  it('emploie toutes les teintes, et pas une seule', () => {
    const vues = new Set<number>();
    for (let i = 0; i < 200; i += 1) vues.add(teinteCours(`Chapitre ${i}`));
    expect(vues.size).toBe(NOMBRE_TEINTES);
  });

  it('distingue les quatre cours de la demonstration', () => {
    // Garde-fou du 20 octobre : si la fonction change, la demonstration ne
    // doit pas se retrouver avec deux cartes de la meme couleur.
    const titres = [
      'Atelier SGBL',
      'Atelier 5 — Testing avec GitHub Copilot',
      'Chapitre 2 — Prompt Engineering',
      'Démo — données personnelles',
    ];
    expect(new Set(titres.map(teinteCours)).size).toBe(titres.length);
  });
});
