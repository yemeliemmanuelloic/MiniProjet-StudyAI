import { describe, expect, it } from 'vitest';
import { GENERIQUES, messagePour } from './messages';

/**
 * Premiers tests du front.
 *
 * Le sujet n'est pas choisi au hasard : la refonte visuelle a introduit
 * TROIS regressions en une soiree — une navigation qui debordait, un
 * chronometre d'examen cache sous l'en-tete, une page large de 897 px sur un
 * ecran de 375. Aucune n'etait visible sur une capture d'ecran, et rien ne
 * les aurait arretees. Le harnais commence ici, sur la logique la plus
 * facile a tester et la plus facile a casser en silence.
 *
 * Ce qui est verifie : que le message le PLUS PRECIS disponible gagne, et
 * qu'on ne retombe jamais sur une phrase generique quand mieux existe.
 */

/**
 * `toLocaleString('fr-FR')` separe les milliers par une espace FINE
 * INSECABLE (U+202F), pas par une espace ordinaire — et le caractere exact
 * peut varier d'un moteur a l'autre. Comparer a une espace tapee au clavier
 * fait echouer un test sur un code parfaitement juste.
 */
const sansEspacesFines = (texte: string) => texte.replace(/[\s\u202f\u00a0]+/g, ' ');

describe('ordre de repli', () => {
  it('prefere le message compose au message du serveur', () => {
    const m = messagePour(
      'VALIDATION_ERROR',
      { caracteres: 475997, limite: 200000 },
      'Ce cours fait 475997 caracteres, soit 275997 de trop : la limite est de 200000.',
    );
    // Le compose est traduisible et formate les nombres ; il doit gagner.
    const plat = sansEspacesFines(m);
    expect(plat).toContain('475 997');
    expect(plat).toContain('275 997');
    expect(plat).toContain('200 000');
  });

  it("prend le message du serveur quand aucun composeur ne s'applique", () => {
    const m = messagePour('VALIDATION_ERROR', {}, 'Fichier Word illisible ou endommage.');
    expect(m).toBe('Fichier Word illisible ou endommage.');
  });

  it('retombe sur le generique quand le serveur ne dit rien', () => {
    expect(messagePour('VALIDATION_ERROR', {})).toBe(GENERIQUES.VALIDATION_ERROR);
  });

  it('ignore un message serveur vide ou fait d espaces', () => {
    expect(messagePour('NOT_FOUND', {}, '   ')).toBe(GENERIQUES.NOT_FOUND);
  });
});

describe('ce que l etudiant lisait avant', () => {
  /**
   * Le defaut tel qu'il a ete constate : le serveur disait exactement quoi
   * faire, l'interface affichait une phrase passe-partout.
   */
  it('le refus de format nomme les formats acceptes', () => {
    const m = messagePour(
      'VALIDATION_ERROR',
      { extension: '.zip', acceptes: ['.pdf', '.docx', '.pptx'] },
      'Format non reconnu. Formats acceptes : PDF, Word (.docx) et PowerPoint (.pptx).',
    );
    expect(m).toContain('.zip');
    expect(m).toContain('.pdf');
    expect(m).toContain('.pptx');
    expect(m).not.toBe(GENERIQUES.VALIDATION_ERROR);
  });

  it('le plafond de debit donne le delai exact', () => {
    expect(messagePour('RATE_LIMITED', { attente_s: 12 })).toContain('12 secondes');
  });

  it('accorde le singulier a une seconde', () => {
    const m = messagePour('RATE_LIMITED', { attente_s: 1 });
    expect(m).toContain('1 seconde');
    expect(m).not.toContain('1 secondes');
  });
});

describe('robustesse des composeurs', () => {
  /**
   * Un composeur qui s'execute sur des details incomplets produirait une
   * phrase trouee — « soit undefined caracteres de trop ». Il doit rendre
   * la main au repli suivant.
   */
  it('ne compose pas sur des details incomplets', () => {
    const m = messagePour('VALIDATION_ERROR', { caracteres: 400000 }, 'Message du serveur.');
    expect(m).toBe('Message du serveur.');
    expect(m).not.toContain('undefined');
  });

  it('ne compose pas un delai absent', () => {
    expect(messagePour('RATE_LIMITED', {})).toBe(GENERIQUES.RATE_LIMITED);
  });

  it('aucun message rendu ne contient undefined ou NaN', () => {
    const cas: Array<[Parameters<typeof messagePour>[0], Record<string, unknown>]> = [
      ['VALIDATION_ERROR', {}],
      ['VALIDATION_ERROR', { caracteres: 1 }],
      ['VALIDATION_ERROR', { limite: 1 }],
      ['VALIDATION_ERROR', { extension: '.zip' }],
      ['RATE_LIMITED', {}],
      ['RATE_LIMITED', { attente_s: 'bientot' }],
      ['LLM_TIMEOUT', {}],
      ['INTERNAL', {}],
    ];
    for (const [code, details] of cas) {
      const m = messagePour(code, details);
      expect(m, `${code} ${JSON.stringify(details)}`).not.toMatch(/undefined|NaN|\[object/);
      expect(m.length).toBeGreaterThan(10);
    }
  });
});

describe('panne reseau', () => {
  /**
   * `fetch` rejette avec un TypeError qui n'a ni code ni message utilisable.
   * Sans ce cas, l'interface sortait de son propre contrat d'erreur.
   */
  it('a son propre message, sans passer par le serveur', () => {
    expect(messagePour('INTERNAL', { cause: 'reseau' })).toBe('Le serveur est injoignable.');
  });

  it("l'emporte meme si un message serveur traine", () => {
    expect(messagePour('INTERNAL', { cause: 'reseau' }, 'Erreur interne.')).toBe(
      'Le serveur est injoignable.',
    );
  });
});

describe('couverture de la taxonomie', () => {
  it('les onze codes ont un message generique non vide', () => {
    const codes = Object.keys(GENERIQUES) as Array<keyof typeof GENERIQUES>;
    expect(codes).toHaveLength(11);
    for (const code of codes) {
      expect(GENERIQUES[code].length, code).toBeGreaterThan(10);
    }
  });
});
