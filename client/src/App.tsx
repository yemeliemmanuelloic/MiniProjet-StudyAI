import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BandeauServeur, EN_MAINTENANCE, PageMaintenance } from './components/EtatService';
import { BarreLaterale } from './components/BarreLaterale';
import { GardeFou } from './components/GardeFou';
import { MetaDeRoute } from './components/MetaDeRoute';
import { Logo } from './components/Logo';
import { Chargement, EtatVide } from './components/ui';
import { AuthProvider, Protege, useAuth } from './lib/auth';
import { I18nProvider, useI18n } from './lib/i18n';
import { Accueil } from './pages/AccueilPage';
import { ContactPage } from './pages/ContactPage';
import { PageInfo } from './pages/PageInfo';
import { ChoixLangue, MenuCompte } from './components/MenuCompte';
import { PiedDePage } from './components/PiedDePage';
import { RetoursProvider } from './components/Retours';
import { ConnexionPage, InscriptionPage } from './pages/AuthPages';

/* Pages reservees a un compte : chargees a la demande (lot H, audit
   Lighthouse). Un visiteur qui decouvre l'accueil ne telecharge plus le
   code de l'examen blanc, de la recherche ou de la consommation ; un
   etudiant connecte les recoit en quelques Ko, a la premiere visite. */
const CoursPage = lazy(() => import('./pages/CoursPage').then((m) => ({ default: m.CoursPage })));
const CoursDetailPage = lazy(() =>
  import('./pages/CoursDetailPage').then((m) => ({ default: m.CoursDetailPage })),
);
const ExamenPage = lazy(() => import('./pages/ExamenPage').then((m) => ({ default: m.ExamenPage })));
const RecherchePage = lazy(() => import('./pages/RecherchePage').then((m) => ({ default: m.RecherchePage })));
const ConsommationPage = lazy(() =>
  import('./pages/ConsommationPage').then((m) => ({ default: m.ConsommationPage })),
);
const ComptePage = lazy(() => import('./pages/ComptePage').then((m) => ({ default: m.ComptePage })));

/**
 * Routage de l'application.
 *
 * `Protege` n'est qu'une commodite d'affichage : il evite a l'utilisateur de
 * voir un ecran vide. Le controle d'acces reel est fait par le serveur, qui
 * verifie la propriete de chaque cours a chaque requete. Supprimer ce garde
 * ne donnerait acces a aucune donnee.
 */

/** Sélecteur de langue. Deux langues : un bouton bascule suffit. */
function Entete() {
  const { utilisateur } = useAuth();
  const { t } = useI18n();
  const element = useRef<HTMLElement>(null);
  const emplacement = useLocation();
  /* Menu de telephone (20 octobre). Ferme a chaque changement de page et a
     la touche Echap : un menu qui reste ouvert apres un clic cache la page
     qu'on vient de demander. */
  const [menuOuvert, setMenuOuvert] = useState(false);
  useEffect(() => setMenuOuvert(false), [emplacement.pathname]);
  useEffect(() => {
    if (!menuOuvert) return;
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOuvert(false);
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [menuOuvert]);

  /*
   * Publie la hauteur reelle de l'en-tete dans une variable CSS.
   *
   * POURQUOI CE CODE EXISTE. L'en-tete est devenu collant le 13 octobre. Le
   * chronometre de l'examen blanc l'etait deja, a `top: 0` : les deux se
   * superposaient, et l'en-tete gagnait. Pendant une epreuve chronometree,
   * LE COMPTE A REBOURS DISPARAISSAIT — mesure a 101 px de bas pour un
   * en-tete qui en fait 153.
   *
   * Figer la hauteur dans le CSS serait reproduire le nombre magique retire
   * la veille de `calc(100vh - 69px)` : elle change avec la largeur, et la
   * navigation passe a la ligne sur telephone. Un observateur la mesure donc
   * et la publie ; tout ce qui doit se coller sous l'en-tete s'y refere.
   */
  useEffect(() => {
    const cible = element.current;
    if (!cible) return;
    const publier = (hauteur: number) =>
      document.documentElement.style.setProperty(
        '--hauteur-entete',
        `${Math.round(hauteur)}px`,
      );
    publier(cible.getBoundingClientRect().height);
    /* `entree.contentRect` EXCLUT le remplissage et la bordure : il rendait
       132 px pour un en-tete qui en mesure 153, et le chronometre restait
       cache de 21 px. On relit donc la boite complete. */
    const observateur = new ResizeObserver(() =>
      publier(cible.getBoundingClientRect().height),
    );
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, [utilisateur]);

  return (
    <header className={`entete${menuOuvert ? ' entete-ouvert' : ''}`} ref={element}>
      <Link to="/" className="entete-marque" aria-label={t('nav.accueil')}>
        <Logo taille={26} />
      </Link>

      {/* Visible sur telephone seulement (index.css). Sur grand ecran, le
          menu est toujours deploye et ce bouton n'existe pas a l'oeil. */}
      <button
        type="button"
        className="entete-burger"
        aria-expanded={menuOuvert}
        aria-controls="entete-menu"
        aria-label={menuOuvert ? t('nav.menu.fermer') : t('nav.menu.ouvrir')}
        onClick={() => setMenuOuvert((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {menuOuvert ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>

      <div id="entete-menu" className="entete-menu">
      {utilisateur && (
        <nav>
          <NavLink to="/cours" className={({ isActive }) => (isActive ? 'actif' : '')}>
            {t('nav.cours')}
          </NavLink>
          <NavLink to="/recherche" className={({ isActive }) => (isActive ? 'actif' : '')}>
            {t('nav.recherche')}
          </NavLink>
          <NavLink to="/examen" className={({ isActive }) => (isActive ? 'actif' : '')}>
            {t('nav.examen')}
          </NavLink>
          <NavLink to="/consommation" className={({ isActive }) => (isActive ? 'actif' : '')}>
            {t('nav.consommation')}
          </NavLink>
        </nav>
      )}

      <div className="pousse ligne entete-actions" style={{ gap: 12 }}>
        {/* Connecte : une pastille a l'initiale porte le compte, la langue
            et la deconnexion (components/MenuCompte.tsx). */}
        {utilisateur ? (
          <MenuCompte />
        ) : (
          <>
            <ChoixLangue />
            <Link className="petit" to="/connexion">
              {t('nav.connexion')}
            </Link>
            <Link className="bouton" to="/inscription">
              {t('nav.inscription')}
            </Link>
          </>
        )}
      </div>
      </div>
    </header>
  );
}

/**
 * Disposition generale (refonte « Atelier », 21 octobre). Un visiteur garde
 * l'en-tete du site ; un etudiant connecte travaille dans l'application, avec
 * la navigation en colonne a gauche (components/BarreLaterale.tsx).
 */
function Disposition({ children }: { children: ReactNode }) {
  const { utilisateur } = useAuth();
  if (!utilisateur)
    return (
      <>
        <Entete />
        {children}
      </>
    );
  return (
    <div className="appli">
      <BarreLaterale />
      <div className="appli-contenu">{children}</div>
    </div>
  );
}

function Introuvable() {
  const { t } = useI18n();
  return (
    <main className="page">
      <EtatVide
        titre={t('introuvable.titre')}
        action={
          <Link className="bouton" to="/cours">
            {t('introuvable.action')}
          </Link>
        }
      >
        {t('introuvable.corps')}
      </EtatVide>
    </main>
  );
}

export function App() {
  // Maintenance : le site entier cede la place a une page fixe, sans
  // aucune requete vers l'API (pas meme la verification de session).
  if (EN_MAINTENANCE)
    return (
      <I18nProvider>
        <PageMaintenance />
      </I18nProvider>
    );

  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
        <RetoursProvider>
        <MetaDeRoute />
        <Disposition>
        <BandeauServeur />
        {/* Le garde-fou entoure les routes, pas l'en-tete : meme si une page
            s'effondre, l'utilisateur garde sa navigation. */}
        <GardeFou>
          <Suspense
            fallback={
              <div className="page pile">
                <Chargement lignes={4} />
              </div>
            }
          >
          <Routes>
            <Route path="/" element={<Accueil />} />
            <Route path="/connexion" element={<ConnexionPage />} />
            <Route path="/inscription" element={<InscriptionPage />} />
            <Route
              path="/cours"
              element={
                <Protege>
                  <CoursPage />
                </Protege>
              }
            />
            <Route
              path="/cours/:id"
              element={
                <Protege>
                  <CoursDetailPage />
                </Protege>
              }
            />
            <Route
              path="/examen"
              element={
                <Protege>
                  <ExamenPage />
                </Protege>
              }
            />
            <Route
              path="/recherche"
              element={
                <Protege>
                  <RecherchePage />
                </Protege>
              }
            />
            <Route
              path="/consommation"
              element={
                <Protege>
                  <ConsommationPage />
                </Protege>
              }
            />
            <Route
              path="/compte"
              element={
                <Protege>
                  <ComptePage />
                </Protege>
              }
            />
            {/* Pages d'information : publiques, connecte ou non. */}
            <Route path="/a-propos" element={<PageInfo cle="apropos" />} />
            <Route path="/aide" element={<PageInfo cle="aide" />} />
            <Route path="/faq" element={<PageInfo cle="faq" />} />
            <Route path="/mentions-legales" element={<PageInfo cle="mentions" />} />
            <Route path="/confidentialite" element={<PageInfo cle="confidentialite" />} />
            <Route path="/conditions" element={<PageInfo cle="conditions" />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="*" element={<Introuvable />} />
          </Routes>
          </Suspense>
        </GardeFou>
        <PiedDePage />
        </Disposition>
        </RetoursProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
