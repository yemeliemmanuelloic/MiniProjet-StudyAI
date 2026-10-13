import { useEffect, useRef } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { GardeFou } from './components/GardeFou';
import { Logo } from './components/Logo';
import { Bouton, EtatVide } from './components/ui';
import { AuthProvider, Protege, useAuth } from './lib/auth';
import { ConnexionPage, InscriptionPage } from './pages/AuthPages';
import { CoursDetailPage } from './pages/CoursDetailPage';
import { CoursPage } from './pages/CoursPage';
import { ConsommationPage } from './pages/ConsommationPage';
import { ExamenPage } from './pages/ExamenPage';
import { RecherchePage } from './pages/RecherchePage';

/**
 * Routage de l'application.
 *
 * `Protege` n'est qu'une commodite d'affichage : il evite a l'utilisateur de
 * voir un ecran vide. Le controle d'acces reel est fait par le serveur, qui
 * verifie la propriete de chaque cours a chaque requete. Supprimer ce garde
 * ne donnerait acces a aucune donnee.
 */

function Entete() {
  const { utilisateur, deconnecter } = useAuth();
  const element = useRef<HTMLElement>(null);

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
    <header className="entete" ref={element}>
      <Link to="/" className="entete-marque" aria-label="StudyAI, accueil">
        <Logo taille={26} />
      </Link>

      {utilisateur && (
        <nav>
          <NavLink to="/cours" className={({ isActive }) => (isActive ? 'actif' : '')}>
            Mes cours
          </NavLink>
          <NavLink to="/recherche" className={({ isActive }) => (isActive ? 'actif' : '')}>
            Rechercher
          </NavLink>
          <NavLink to="/examen" className={({ isActive }) => (isActive ? 'actif' : '')}>
            Examen blanc
          </NavLink>
          <NavLink to="/consommation" className={({ isActive }) => (isActive ? 'actif' : '')}>
            Consommation
          </NavLink>
        </nav>
      )}

      <div className="pousse ligne" style={{ gap: 12 }}>
        {utilisateur ? (
          <>
            <span className="petit discret">{utilisateur.email}</span>
            <Bouton secondaire onClick={deconnecter}>
              Se deconnecter
            </Bouton>
          </>
        ) : (
          <>
            <Link className="petit" to="/connexion">
              Se connecter
            </Link>
            <Link className="bouton" to="/inscription">
              Creer un compte
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

function Introuvable() {
  return (
    <main className="page">
      <EtatVide
        titre="Page introuvable"
        action={
          <Link className="bouton" to="/cours">
            Revenir a mes cours
          </Link>
        }
      >
        Le lien que vous avez suivi ne correspond a aucune page de StudyAI.
      </EtatVide>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Entete />
        {/* Le garde-fou entoure les routes, pas l'en-tete : meme si une page
            s'effondre, l'utilisateur garde sa navigation. */}
        <GardeFou>
          <Routes>
            <Route path="/" element={<Navigate to="/cours" replace />} />
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
            <Route path="*" element={<Introuvable />} />
          </Routes>
        </GardeFou>
      </AuthProvider>
    </BrowserRouter>
  );
}
