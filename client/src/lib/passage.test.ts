import { describe, expect, it } from 'vitest';
import { localiser, occurrences } from './passage';

const COURS = `Chapitre 2 — Les tests unitaires

Un test unitaire vérifie une fonction isolée.
La couverture de code se mesure avec
pytest-cov, l'outil standard en Python.`;

const extrait = (p: { debut: number; fin: number } | null) => (p ? COURS.slice(p.debut, p.fin) : null);

describe('localiser', () => {
  it('trouve une citation exacte', () => {
    expect(extrait(localiser(COURS, 'Un test unitaire vérifie une fonction isolée.'))).toBe(
      'Un test unitaire vérifie une fonction isolée.',
    );
  });

  it('recolle une ligne coupée par l import et ignore la casse', () => {
    expect(extrait(localiser(COURS, 'la couverture de code se mesure avec pytest-cov'))).toBe(
      'La couverture de code se mesure avec\npytest-cov',
    );
  });

  it('accepte une apostrophe typographique et des guillemets autour', () => {
    expect(extrait(localiser(COURS, '« l’outil standard en Python »'))).toBe("l'outil standard en Python");
  });

  it('retombe sur le début quand la fin est reformulée', () => {
    const p = localiser(COURS, 'La couverture de code se mesure avec pytest-cov, qui est très utilisé partout');
    expect(extrait(p)).toMatch(/^La couverture de code se mesure/);
  });

  it('rend null plutôt que d inventer une correspondance', () => {
    expect(localiser(COURS, 'Les tests fonctionnels utilisent Gherkin et Cucumber')).toBeNull();
    expect(localiser(COURS, '  ')).toBeNull();
  });
});

describe('occurrences', () => {
  it('compte sans tenir compte de la casse', () => {
    expect(occurrences(COURS, 'test').length).toBe(3);
  });
  it('ignore une requête trop courte', () => {
    expect(occurrences(COURS, 'a')).toEqual([]);
  });
});
