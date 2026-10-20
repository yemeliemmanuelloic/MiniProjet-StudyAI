import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PageIndisponible } from '../components/EtatService';
import { Chargement } from '../components/ui';
import { ApiError, api, setToken } from './api';

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
  createdAt?: string | null;
  /** Connexion PRECEDENTE (pas celle en cours) : voir la page « Mon compte ». */
  previousLoginAt?: string | null;
}

interface Contexte {
  utilisateur: Utilisateur | null;
  /** Vrai tant que la session initiale n'a pas ete verifiee. */
  chargement: boolean;
  connecter(email: string, motDePasse: string): Promise<Utilisateur>;
  inscrire(email: string, motDePasse: string): Promise<Utilisateur>;
  /** Vrai quand la session a expire, par opposition a jamais connecte. */
  sessionExpiree: boolean;
  /** Vrai quand la session n'a pas pu etre verifiee : serveur injoignable. */
  verificationImpossible: boolean;
  /** Relance la verification de la session apres une panne. */
  reverifier(): void;
  deconnecter(): void;
  /** Apres un changement de mot de passe : le serveur rend un jeton neuf. */
  remplacerSession(utilisateur: Utilisateur, jeton: string): void;
}

const AuthContext = createContext<Contexte | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  // Sans jeton, rien a verifier : la page s'affiche des le premier rendu.
  // Partir de `true` faisait passer chaque visiteur par un squelette d'une
  // image, et le pied de page sautait (decalage mesure par Lighthouse).
  const [chargement, setChargement] = useState(() => localStorage.getItem('token') !== null);
  /* Vrai quand un jeton existait mais a ete refuse : la session a expire.
     Sans ce drapeau, l'etudiant se retrouvait sur l'ecran de connexion en
     pleine revision sans qu'un mot lui dise pourquoi. */
  const [sessionExpiree, setSessionExpiree] = useState(false);
  const [verificationImpossible, setVerificationImpossible] = useState(false);

  /* DEFAUT CORRIGE (20 octobre) : toute erreur effacait le jeton et
     annoncait « session expiree ». Or l'API dort sur l'offre gratuite de
     l'hebergeur ; un reveil manque ou une coupure reseau deconnectait donc
     l'etudiant pour rien. Seul un refus explicite (401) met fin a la
     session ; une panne la laisse intacte et propose de reessayer. */
  const verifier = useCallback(() => {
    if (!localStorage.getItem('token')) {
      setChargement(false);
      return;
    }
    setChargement(true);
    setVerificationImpossible(false);
    api<{ user: Utilisateur }>('/auth/me')
      .then((d) => setUtilisateur(d.user))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
          setToken(null);
          setSessionExpiree(true);
        } else {
          setVerificationImpossible(true);
        }
      })
      .finally(() => setChargement(false));
  }, []);

  useEffect(verifier, [verifier]);

  const valeur = useMemo<Contexte>(
    () => ({
      utilisateur,
      chargement,
      sessionExpiree,
      verificationImpossible,
      reverifier: verifier,
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
        setVerificationImpossible(false);
        // Une deconnexion voulue n'est pas une expiration.
        setSessionExpiree(false);
      },
      remplacerSession(nouveau, jeton) {
        setToken(jeton);
        setUtilisateur(nouveau);
      },
    }),
    [utilisateur, chargement, sessionExpiree, verificationImpossible, verifier],
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
  const { utilisateur, chargement, sessionExpiree, verificationImpossible, reverifier } = useAuth();
  const emplacement = useLocation();

  if (chargement)
    return (
      <div className="page pile">
        <Chargement lignes={4} />
      </div>
    );
  // Panne pendant la verification : on ne renvoie PAS a la connexion, le
  // jeton est peut-etre parfaitement valide.
  if (verificationImpossible) return <PageIndisponible onReessayer={reverifier} />;
  // `requise` : un visiteur arrive sur une page reservee par un lien ou un
  // favori. L'ecran de connexion lui dit pourquoi il est la.
  if (!utilisateur)
    return (
      <Navigate
        to="/connexion"
        state={{ de: emplacement.pathname, expiree: sessionExpiree, requise: !sessionExpiree }}
        replace
      />
    );
  return <>{children}</>;
}
