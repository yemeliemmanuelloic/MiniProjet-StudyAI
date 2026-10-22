import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { classeCours } from '../lib/couleurCours';
import { useI18n, type Cle } from '../lib/i18n';
import type { CoursResume } from '../lib/types';
import { Logo } from './Logo';
import { MenuCompte } from './MenuCompte';

/**
 * Navigation de l'application connectee (refonte « Atelier », 21 octobre).
 *
 * POURQUOI UNE BARRE LATERALE. StudyAI est un outil qu'on rouvre tous les
 * jours, pas un site qu'on parcourt. La barre du haut alignait quatre liens et
 * rien d'autre ; la colonne de gauche garde la navigation en vue ET donne un
 * acces direct aux cours recents, ce qu'un etudiant ouvre le plus souvent.
 *
 * Sur telephone (<= 900 px), elle se replie en barre du haut avec un bouton
 * menu. Les identifiants `entete-menu` et les libelles du bouton sont ceux de
 * l'ancien en-tete : les tests de bout en bout s'y referent.
 */

const ETROIT = '(max-width: 900px)';
const RECENTS = 5;

/* Icones dessinees a la main, trait de 1,8 sur une grille de 24 : une
   bibliotheque d'icones pour quatre pictogrammes serait une dependance de
   trop (docs/DECISIONS.md, « aucune dependance nouvelle »). */
const ICONES: Record<string, ReactNode> = {
  cours: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" />,
  recherche: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  examen: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M8.5 12.5l2.2 2.2 4.8-4.8" />
    </>
  ),
  consommation: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />,
};

function Icone({ nom }: { nom: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES[nom]}
    </svg>
  );
}

function CoursRecents() {
  const { t } = useI18n();
  const emplacement = useLocation();
  const [cours, setCours] = useState<CoursResume[] | null>(null);

  /* Relu a chaque changement de page : un cours cree ou supprime apparait
     sans recharger. Lecture seule, sans appel au modele. Une erreur laisse
     simplement la section vide : la page elle-meme affiche la panne. */
  useEffect(() => {
    let actif = true;
    api<{ courses: CoursResume[] }>('/courses')
      .then((d) => actif && setCours(d.courses))
      .catch(() => actif && setCours(null));
    return () => {
      actif = false;
    };
  }, [emplacement.pathname]);

  if (!cours || cours.length === 0) return null;
  const recents = [...cours].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, RECENTS);

  return (
    <div className="barre-recents">
      <p className="barre-titre" id="barre-recents-titre">
        {t('nav.recents')}
      </p>
      <ul aria-labelledby="barre-recents-titre">
        {recents.map((c) => (
          <li key={c.id}>
            <NavLink to={`/cours/${c.id}`} className={({ isActive }) => `${classeCours(c.title)}${isActive ? ' actif' : ''}`}>
              <span className="barre-pastille" aria-hidden="true" />
              <span className="barre-recent-titre">{c.title}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarreLaterale() {
  const { t } = useI18n();
  const { utilisateur } = useAuth();
  const emplacement = useLocation();
  const haut = useRef<HTMLDivElement>(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => setOuvert(false), [emplacement.pathname]);
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  /* `--hauteur-entete` : ce qui se colle en haut de page (chronometre de
     l'examen) doit passer SOUS la barre du telephone. Sur grand ecran, rien
     ne couvre le haut de la page : la hauteur publiee est nulle. */
  useEffect(() => {
    const cible = haut.current;
    if (!cible) return;
    const etroit = window.matchMedia(ETROIT);
    const publier = () =>
      document.documentElement.style.setProperty(
        '--hauteur-entete',
        `${etroit.matches ? Math.round(cible.getBoundingClientRect().height) : 0}px`,
      );
    publier();
    const observateur = new ResizeObserver(publier);
    observateur.observe(cible);
    etroit.addEventListener('change', publier);
    return () => {
      observateur.disconnect();
      etroit.removeEventListener('change', publier);
    };
  }, [utilisateur]);

  const lien = (to: string, cle: Cle, icone: string) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'actif' : '')}>
      <Icone nom={icone} />
      <span>{t(cle)}</span>
    </NavLink>
  );

  return (
    <header className={`barre${ouvert ? ' barre-ouverte' : ''}`}>
      <div className="barre-haut" ref={haut}>
        <Link to="/cours" className="barre-marque" aria-label={t('nav.accueil')}>
          <Logo taille={26} />
        </Link>
        <button
          type="button"
          className="barre-burger"
          aria-expanded={ouvert}
          aria-controls="entete-menu"
          aria-label={ouvert ? t('nav.menu.fermer') : t('nav.menu.ouvrir')}
          onClick={() => setOuvert((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {ouvert ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      <div id="entete-menu" className="barre-menu">
        <nav aria-label={t('nav.principale')} className="barre-nav">
          {lien('/cours', 'nav.cours', 'cours')}
          {lien('/recherche', 'nav.recherche', 'recherche')}
          {lien('/examen', 'nav.examen', 'examen')}
          {lien('/consommation', 'nav.consommation', 'consommation')}
        </nav>
        <CoursRecents />
        <div className="barre-bas">
          <MenuCompte />
        </div>
      </div>
    </header>
  );
}
