import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { metaPour } from '../lib/metaPage';
import { indexable, normaliserSite } from '../lib/referencement';

const SITE = normaliserSite(import.meta.env.VITE_SITE_URL);
const OUVERT = indexable(SITE, import.meta.env.VITE_INDEXATION);

/** La balise <meta name="…"> ou <link rel="…"> de la tete, creee au besoin. */
function balise<T extends HTMLElement>(selecteur: string, creer: () => T): T {
  const existante = document.head.querySelector<T>(selecteur);
  if (existante) return existante;
  const nouvelle = creer();
  document.head.appendChild(nouvelle);
  return nouvelle;
}

function retirer(selecteur: string): void {
  document.head.querySelector(selecteur)?.remove();
}

/**
 * Tient a jour le titre de l'onglet, la description, l'adresse canonique et
 * la consigne aux robots a chaque changement de page ou de langue (lot G).
 *
 * Place AVANT les routes dans l'arbre : React execute les effets dans
 * l'ordre du document, si bien qu'une page peut encore affiner le titre
 * apres lui (la fiche d'un cours y met le titre du cours).
 */
export function MetaDeRoute() {
  const { pathname } = useLocation();
  const { t, langue } = useI18n();

  useEffect(() => {
    const meta = metaPour(pathname, langue, t);
    document.title = meta.titre;

    balise('meta[name="description"]', () => {
      const m = document.createElement('meta');
      m.name = 'description';
      return m;
    }).content = meta.description;

    // Site ferme : la balise noindex est deja dans index.html, pour TOUTES
    // les pages ; on n'y touche pas. Site ouvert : seules les pages privees
    // ou inconnues la portent.
    if (OUVERT) {
      if (meta.horsIndex) {
        balise('meta[name="robots"]', () => {
          const m = document.createElement('meta');
          m.name = 'robots';
          return m;
        }).content = 'noindex';
      } else retirer('meta[name="robots"]');
    }

    // Adresse canonique : une seule adresse par page publique, sans
    // parametre ni barre finale parasite.
    if (SITE && !meta.horsIndex) {
      balise('link[rel="canonical"]', () => {
        const l = document.createElement('link');
        l.rel = 'canonical';
        return l;
      }).href = `${SITE}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`;
    } else retirer('link[rel="canonical"]');
  }, [pathname, langue, t]);

  return null;
}
