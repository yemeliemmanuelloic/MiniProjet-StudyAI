import { describe, expect, it } from 'vitest';
import { PAGES, type PageTexte } from './contenus';
import { EMAIL_CONTACT } from './site';
// Le source de App.tsx, lu tel quel par Vite : la liste des routes declarees.
import APP from '../App.tsx?raw';

/**
 * Les pages d'information existent en deux langues, ecrites a la main. Le
 * risque n'est pas l'orthographe : c'est qu'une langue prenne du retard sur
 * l'autre, ou qu'un lien pointe vers une page qui n'existe pas.
 */

const ROUTES = new Set([...APP.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));

function textes(page: PageTexte): string[] {
  return [
    page.sous,
    ...page.sections.flatMap((s) =>
      s.blocs.flatMap((b) =>
        b.type === 'p' ? [b.texte] : b.type === 'liste' ? b.items : b.lignes.flat(),
      ),
    ),
  ];
}

describe('pages d information', () => {
  for (const [cle, { fr, en }] of Object.entries(PAGES)) {
    it(`${cle} : memes sections, dans le meme ordre, en francais et en anglais`, () => {
      expect(en.sections.length).toBe(fr.sections.length);
      fr.sections.forEach((s, i) => {
        expect(en.sections[i].blocs.map((b) => b.type)).toEqual(s.blocs.map((b) => b.type));
      });
      expect(en.datee).toBe(fr.datee);
    });

    it(`${cle} : chaque lien interne mene a une route existante`, () => {
      for (const page of [fr, en]) {
        for (const texte of textes(page)) {
          for (const [, chemin] of texte.matchAll(/\]\((\/[^)]*)\)/g)) {
            expect(ROUTES.has(chemin), `${cle} -> ${chemin}`).toBe(true);
          }
        }
      }
    });
  }

  it('les pages juridiques donnent l adresse de contact', () => {
    for (const cle of ['mentions', 'confidentialite', 'conditions'] as const) {
      for (const page of [PAGES[cle].fr, PAGES[cle].en]) {
        expect(textes(page).some((t) => t.includes(EMAIL_CONTACT)), cle).toBe(true);
      }
    }
  });

  it('la politique de confidentialite nomme la limite sur les noms de personnes', () => {
    // La limite la plus importante a dire : la taire serait promettre un
    // masquage que l'application ne fait pas.
    expect(textes(PAGES.confidentialite.fr).join(' ')).toMatch(/noms de personnes/);
    expect(textes(PAGES.confidentialite.en).join(' ')).toMatch(/people’s names/);
  });
});
