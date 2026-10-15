import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Chargement } from '../components/ui';
import { api, setToken } from './api';

/**
 * Etat d'authentification partage.
 *
 * StudyAI n'a qu'un type d'utilisateur, l'etudiant : pas de role, donc pas de
 * garde par role. La seule regle d'acces est la propriete, verifiee par le
 * serveur a chaque requete — un etudiant ne voit que SES cours.
 *
 * Le jeton est conserve dans localStorage et rejoue au demarrage : sans cela,
 * un rafraichissement de page deconnecterait l'utilisateur en pleine
 * demonstration.
 */

export interface Utilisateur {
  id: string;
  email: string;
}

interface Contexte {
  utilisateur: Utilisateur | null;
  /** Vrai tant que la session initiale n'a pas ete verifiee. */
  chargement: boolean;
  connecter(email: string, motDePasse: string): Promise<Utilisateur>;
  inscrire(email: string, motDePasse: string): Promise<Utilisateur>;
  /** Vrai quand la session a expire, par opposition a jamais connecte. */
  sessionExpiree: boolean;
  deconnecter(): void;
}

const AuthContext = createContext<Contexte | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  /* Vrai quand un jeton existait mais a ete refuse : la session a expire.
     Sans ce drapeau, l'etudiant se retrouvait sur l'ecran de connexion en
     pleine revision sans qu'un mot lui dise pourquoi. */
  const [sessionExpiree, setSessionExpiree] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setChargement(false);
      return;
    }
    api<{ user: Utilisateur }>('/auth/me')
      .then((d) => setUtilisateur(d.user))
      .catch(() => {
        setToken(null);
        setSessionExpiree(true);
      })
      .finally(() => setChargement(false));
  }, []);

  const valeur = useMemo<Contexte>(
    () => ({
      utilisateur,
      chargement,
      sessionExpiree,
      async connecter(email, motDePasse) {
        const d = await api<{ user: Utilisateur; token: string }>('/auth/login', {
          body: { email, password: motDePasse },
        });
        setToken(d.token);
        setUtilisateur(d.user);
        return d.user;
      },
      async inscrire(email, motDePasse) {
        const d = await api<{ user: Utilisateur; token: string }>('/auth/register', {
          body: { email, password: motDePasse },
        });
        setToken(d.token);
        setUtilisateur(d.user);
        return d.user;
      },
      deconnecter() {
        setToken(null);
        setUtilisateur(null);
        // Une deconnexion voulue n'est pas une expiration.
        setSessionExpiree(false);
      },
    }),
    [utilisateur, chargement, sessionExpiree],
  );

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth(): Contexte {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth doit etre utilise dans un AuthProvider');
  return c;
}

/** Protege l'affichage, jamais la donnee : le serveur reste seul juge. */
export function Protege({ children }: { children: ReactNode }) {
  const { utilisateur, chargement, sessionExpiree } = useAuth();
  const emplacement = useLocation();

  if (chargement)
    return (
      <div className="page pile">
        <Chargement lignes={4} />
      </div>
    );
  if (!utilisateur)
    return (
      <Navigate
        to="/connexion"
        state={{ de: emplacement.pathname, expiree: sessionExpiree }}
        replace
      />
    );
  return <>{children}</>;
}
