import { describe, expect, it } from 'vitest';
import { EN } from './traductions.en';
import { FR } from './traductions.fr';

/**
 * Ce que ces tests attrapent, et qu'un relecteur n'attraperait pas.
 *
 * Le typage garantit deja qu'aucune cle ne MANQUE cote anglais. Il ne dit
 * rien de ce qui suit : une cle en trop, une traduction oubliee laissee en
 * francais, un marqueur `{n}` present d'un cote et pas de l'autre — qui
 * afficherait « {n} caracteres » tel quel.
 */

const clesFr = Object.keys(FR).sort();
const clesEn = Object.keys(EN).sort();

const marqueurs = (texte: string): string[] =>
  [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('les deux dictionnaires se correspondent', () => {
  it('ont exactement les memes cles', () => {
    expect(clesEn).toEqual(clesFr);
  });

  it('ne comportent aucune valeur vide', () => {
    for (const cle of clesFr) {
      expect(FR[cle as keyof typeof FR].trim().length, `fr ${cle}`).toBeGreaterThan(0);
      expect(EN[cle as keyof typeof EN].trim().length, `en ${cle}`).toBeGreaterThan(0);
    }
  });

  it('portent les memes marqueurs d interpolation', () => {
    for (const cle of clesFr) {
      const a = marqueurs(FR[cle as keyof typeof FR]);
      const b = marqueurs(EN[cle as keyof typeof EN]);
      // Un `{n}` oublie cote anglais afficherait le modele brut a l'ecran.
      expect(b, `cle ${cle}`).toEqual(a);
    }
  });
});

describe('qualite du francais', () => {
  /**
   * Mots francais qui PERDENT un accent quand on les tape vite. « analyse »,
   * « quiz » ou « format » n'y figurent pas : ils s'ecrivent sans accent.
   */
  const MOTS_FAUTIFS = [
    'resume',
    'resumes',
    'caractere',
    'caracteres',
    'deja',
    'reponse',
    'reponses',
    'repondre',
    'genere',
    'generes',
    'generer',
    'systeme',
    'systemes',
    'matiere',
    'matieres',
    'detaille',
    'numero',
    'apercu',
    'requete',
    'donnees',
    'modele',
    'modeles',
    'preemption',
    'eleve',
    'etudiant',
    'etudiants',
    'verifie',
    'verifier',
    'selection',
    'redaction',
    'operation',
    'operations',
  ];

  /**
   * DRAPEAU `g` INDISPENSABLE, et son absence a rendu ce test inutile.
   * Sans lui, `match` ne rend que la PREMIERE occurrence. Teste en
   * reintroduisant « Pas encore analyse, aucun resume genere » : le premier
   * mot trouve etait « analyse », legitimement sans accent, et le filtre
   * d'exception avalait alors toute la chaine. Les dix-neuf tests passaient
   * sur une chaine fautive.
   */
  const SANS_ACCENT = new RegExp('\\b(' + MOTS_FAUTIFS.join('|') + ')\\b', 'gi');

  it('aucune chaine francaise ne porte un mot connu sans accent', () => {
    const fautives = clesFr
      .map((cle) => {
        const trouves = [
          ...FR[cle as keyof typeof FR].matchAll(SANS_ACCENT),
        ].map((m) => m[0]);
        return trouves.length ? `${cle} (${trouves.join(', ')})` : null;
      })
      .filter(Boolean);
    expect(fautives, `cles fautives : ${fautives.join(' | ')}`).toEqual([]);
  });

  it('emploie l apostrophe typographique et non l apostrophe droite', () => {
    const droites = clesFr.filter((cle) =>
      /\w'\w/.test(FR[cle as keyof typeof FR]),
    );
    expect(droites, `cles fautives : ${droites.join(', ')}`).toEqual([]);
  });
});

describe('qualite de l anglais', () => {
  it('ne laisse pas de chaine identique au francais par oubli', () => {
    /**
     * Quelques chaines sont legitimement identiques — « Quiz », « StudyAI ».
     * Au-dela d'un seuil de longueur, une egalite parfaite trahit presque
     * toujours un copier-coller non traduit.
     */
    const suspectes = clesFr.filter((cle) => {
      const fr = FR[cle as keyof typeof FR];
      return fr.length > 24 && fr === EN[cle as keyof typeof EN];
    });
    expect(suspectes, `cles non traduites : ${suspectes.join(', ')}`).toEqual([]);
  });
});
