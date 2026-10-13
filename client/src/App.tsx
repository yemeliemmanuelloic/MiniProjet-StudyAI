import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { GardeFou } from './components/GardeFou';
import { Logo } from './components/Logo';
import { Bouton, EtatVide } from './components/ui';
import { AuthProvider, Protege, useAuth } from './lib/auth';
import { ConnexionPage, InscriptionPage } from './pages/AuthPages';
import { CoursDetailPage } from './pages/CoursDetailPage';
import { CoursPage } from './pages/CoursPage';

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

  return (
    <header className="entete">
      <Link to="/" className="entete-marque" aria-label="StudyAI, accueil">
        <Logo taille={26} />
      </Link>

      {utilisateur && (
        <nav>
          <NavLink to="/cours" className={({ isActive }) => (isActive ? 'actif' : '')}>
            Mes cours
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
            <Route path="*" element={<Introuvable />} />
          </Routes>
        </GardeFou>
      </AuthProvider>
    </BrowserRouter>
  );
}
