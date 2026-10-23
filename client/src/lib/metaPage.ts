/**
 * Titre et description de chaque page (lot G, 20 octobre).
 *
 * Avant, tous les onglets s'appelaient « StudyAI — résumez, révisez,
 * interrogez vos cours », quelle que soit la page : dix onglets ouverts,
 * dix titres identiques, et un moteur de recherche qui ne pouvait pas
 * distinguer la FAQ des mentions legales. Chaque route a desormais son
 * titre et sa description, dans la langue choisie.
 */

import { PAGES, type ClePage } from './contenus';
import type { Cle, Langue } from './i18n';
import { PREFIXES_PRIVES, estPublique } from './referencement';

export interface MetaPage {
  titre: string;
  description: string;
  /** Page reservee a un compte, ou inconnue : jamais indexee. */
  horsIndex: boolean;
}

const INFOS: Record<string, ClePage> = {
  '/a-propos': 'apropos',
  '/aide': 'aide',
  '/faq': 'faq',
  '/mentions-legales': 'mentions',
  '/confidentialite': 'confidentialite',
  '/conditions': 'conditions',
};

const SIMPLES: Record<string, { titre: Cle; description?: Cle }> = {
  '/connexion': { titre: 'auth.connexion.titre', description: 'auth.connexion.sous' },
  '/inscription': { titre: 'auth.inscription.titre', description: 'auth.inscription.sous' },
  '/contact': { titre: 'contact.titre', description: 'contact.sous' },
  '/cours': { titre: 'nav.cours' },
  '/examen': { titre: 'nav.examen' },
  '/plan': { titre: 'nav.plan' },
  '/recherche': { titre: 'nav.recherche' },
  '/consommation': { titre: 'nav.consommation' },
  '/compte': { titre: 'nav.compte' },
};

/** Le balisage leger des contenus (**gras**, [lien](/x)…) en texte brut. */
export function texteBrut(texte: string): string {
  return texte
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|\*|`/g, '')
    .trim();
}

export const suffixe = (titre: string) => `${titre} · StudyAI`;

export function metaPour(chemin: string, langue: Langue, t: (cle: Cle) => string): MetaPage {
  const parDefaut = t('meta.description');
  const prive = PREFIXES_PRIVES.some((p) => chemin === p || chemin.startsWith(`${p}/`));

  if (chemin === '/') return { titre: t('app.titre'), description: parDefaut, horsIndex: false };

  const info = INFOS[chemin];
  if (info) {
    const page = PAGES[info][langue];
    return { titre: suffixe(page.titre), description: texteBrut(page.sous), horsIndex: false };
  }

  // /cours/:id tombe ici sur « Mes cours » ; la page du cours affine ensuite
  // le titre avec celui du cours, une fois charge.
  const cle = SIMPLES[chemin] ?? (chemin.startsWith('/cours/') ? SIMPLES['/cours'] : undefined);
  if (cle) {
    return {
      titre: suffixe(t(cle.titre)),
      description: cle.description ? t(cle.description) : parDefaut,
      horsIndex: prive || !estPublique(chemin),
    };
  }

  return { titre: suffixe(t('introuvable.titre')), description: parDefaut, horsIndex: true };
}
