import { describe, expect, it } from 'vitest';
import { plagesDesTermes } from './passage';

const TEXTE = "L'algorithme FIFO est simple. Avec FIFO, un long processus fait attendre les autres. Les quantums varient ; le quantum aussi.";

describe('plagesDesTermes', () => {
  it('retrouve chaque occurrence, mot entier seulement', () => {
    const p = plagesDesTermes(TEXTE, ['quantum']);
    expect(p.map((x) => TEXTE.slice(x.debut, x.fin))).toEqual(['quantum']);
  });

  it('le terme le plus long l’emporte quand ils se chevauchent', () => {
    const p = plagesDesTermes(TEXTE, ['FIFO', 'algorithme FIFO']);
    expect(p.map((x) => [TEXTE.slice(x.debut, x.fin), x.terme])).toEqual([
      ['algorithme FIFO', 1],
      ['FIFO', 0],
    ]);
  });

  it('ignore la casse', () => {
    const t = 'La Préemption interrompt le processus.';
    expect(plagesDesTermes(t, ['préemption']).map((x) => t.slice(x.debut, x.fin))).toEqual(['Préemption']);
  });

  it('rien a trouver', () => {
    expect(plagesDesTermes(TEXTE, ['ordonnanceur'])).toEqual([]);
    expect(plagesDesTermes(TEXTE, [])).toEqual([]);
  });
});
