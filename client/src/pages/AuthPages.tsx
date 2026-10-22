import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IllustrationRefus } from '../components/Illustrations';
import { Logo } from '../components/Logo';
import { Alerte, Bouton, Champ, ErreurApi } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRetours } from '../components/Retours';
import { useT } from '../lib/i18n';

/** Ce que Protege transmet en renvoyant vers la connexion. */
type EtatRetour = { de?: string; expiree?: boolean; requise?: boolean };

/** Ce que fait le produit, dit une fois, sur le premier ecran. */
/** Les trois modules, par leurs cles de traduction. */
const MODULES = ['resume', 'quiz', 'tuteur'] as const;

/**
 * Mise en page des ecrans d'authentification.
 *
 * Deux panneaux : a gauche ce que fait le produit, a droite le formulaire.
 * C'est le premier ecran que voit un visiteur — et le premier de la
 * demonstration. Une carte seule sur fond gris n'y disait rien.
 */
/*
 * REFONTE DU 22 OCTOBRE, sur une reference fournie par l'equipe : une carte
 * a deux panneaux, la presentation dans un aplat de la marque a gauche, le
 * formulaire a droite, champs teintes, oeil pour afficher le mot de passe.
 * Ecarte de la reference : les boutons Facebook et Google (aucune connexion
 * par un tiers n'existe cote serveur : ce seraient des boutons factices),
 * le personnage en 3D (pas le notre) et les halos degrades. A sa place, une
 * vraie sortie de StudyAI : le tuteur qui refuse une question hors du cours.
 */
function Encadre({ titre, sous, children }: { titre: string; sous: string; children: ReactNode }) {
  const t = useT();
  return (
    <main className="auth">
      <div className="auth-carte">
        <section className="auth-presentation">
          <p className="auth-accroche">{t('auth.accroche')}</p>
          <p className="auth-sous">{t('auth.accroche.sous')}</p>
          <ul className="auth-modules">
            {MODULES.map((cle) => (
              <li key={cle}>{t(`auth.module.${cle}`)}</li>
            ))}
          </ul>
          <div className="auth-illustration">
            <IllustrationRefus />
          </div>
        </section>

        <section className="auth-formulaire">
          <div className="auth-tete">
            <Logo taille={30} />
            <h1>{titre}</h1>
            <p>{sous}</p>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

/** Mot de passe avec un oeil pour afficher les caracteres saisis. */
function ChampMotDePasse({
  autoComplete,
  valeur,
  changer,
  minLength,
  placeholder,
  aide,
}: {
  autoComplete: string;
  valeur: string;
  changer(v: string): void;
  minLength?: number;
  placeholder?: string;
  aide?: ReactNode;
}) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  return (
    <div className="champ champ-mdp">
      <div className="champ-mdp-tete">
        <label htmlFor="password">{t('auth.champ.motDePasse')}</label>
        {aide}
      </div>
      <div className="champ-mdp-saisie">
        <input
          id="password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          placeholder={placeholder}
          value={valeur}
          onChange={(e) => changer(e.target.value)}
        />
        {/* Libelle sans les mots « mot de passe » : le champ garde seul ce
            libelle, pour les lecteurs d'ecran comme pour les tests. */}
        <button
          type="button"
          className="champ-mdp-oeil"
          aria-pressed={visible}
          aria-controls="password"
          aria-label={visible ? t('auth.mdp.masquer') : t('auth.mdp.afficher')}
          onClick={() => setVisible((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ConnexionPage() {
  const t = useT();
  const { connecter } = useAuth();
  const navigate = useNavigate();
  const emplacement = useLocation();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await connecter(email, motDePasse);
      const retour = (emplacement.state as EtatRetour | null)?.de;
      navigate(retour ?? '/cours', { replace: true });
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  /* CAPTURE au premier rendu, avant que l'effet ci-dessous ne nettoie
     l'historique. Lire directement l'etat de navigation faisait
     disparaitre le bandeau dans la foulee : l'effet s'execute juste
     apres le premier rendu, donc l'utilisateur n'avait rien le temps
     de lire. */
  const [montrerExpiration] = useState(() => (emplacement.state as EtatRetour | null)?.expiree === true);
  const [montrerRequise] = useState(() => (emplacement.state as EtatRetour | null)?.requise === true);

  /* Le drapeau est CONSOMME une fois lu. `history.state` survit au
     rechargement de la page : sans cela, le bandeau « session expiree »
     reapparaissait a chaque F5 sur l'ecran de connexion, longtemps apres
     l'evenement. La page de retour, elle, est conservee. */
  useEffect(() => {
    if (!montrerExpiration && !montrerRequise) return;
    const retour = (emplacement.state as EtatRetour | null)?.de;
    navigate(emplacement.pathname, { replace: true, state: retour ? { de: retour } : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Encadre titre={t('auth.connexion.titre')} sous={t('auth.connexion.sous')}>
      {/* Jusqu'ici, une session expiree renvoyait ici sans un mot : l'etudiant
          perdait sa page en pleine revision et ne savait pas pourquoi. */}
      {montrerExpiration && (
        <Alerte ton="attention">
          {t('auth.expiree')}
        </Alerte>
      )}
      {/* Un visiteur suit un lien vers une page reservee : il sait pourquoi
          il atterrit ici, et qu'il y sera conduit apres connexion. */}
      {montrerRequise && <Alerte>{t('auth.requise')}</Alerte>}
      <form className="pile" onSubmit={soumettre}>
        <Champ
          libelle={t('auth.champ.email')}
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ChampMotDePasse
          autoComplete="current-password"
          valeur={motDePasse}
          changer={setMotDePasse}
          aide={
            /* La reinitialisation par courriel n'existe pas encore : le lien
               mene a la reponse de la FAQ qui dit quoi faire. */
            <Link className="champ-mdp-oubli" to="/faq#j-ai-oublie-mon-mot-de-passe">
              {t('auth.mdp.oubli')}
            </Link>
          }
        />
        <ErreurApi erreur={erreur} />
        <Bouton type="submit" disabled={envoi}>
          {envoi ? t('auth.connexion.encours') : t('auth.connexion.action')}
        </Bouton>
      </form>
      <p className="petit discret" style={{ margin: 0 }}>
        {t('auth.connexion.versInscription')} <Link to="/inscription">{t('nav.inscription')}</Link>
      </p>
    </Encadre>
  );
}

export function InscriptionPage() {
  const t = useT();
  const { inscrire } = useAuth();
  const { notifier } = useRetours();
  const [accepte, setAccepte] = useState(false);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await inscrire(email, motDePasse);
      navigate('/cours', { replace: true });
      notifier(t('auth.bienvenue'));
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Encadre titre={t('auth.inscription.titre')} sous={t('auth.inscription.sous')}>
      <form className="pile" onSubmit={soumettre}>
        <Champ
          libelle={t('auth.champ.email')}
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ChampMotDePasse
          autoComplete="new-password"
          minLength={8}
          placeholder={t('auth.champ.motDePasse.indice')}
          valeur={motDePasse}
          changer={setMotDePasse}
        />
        {/* Acceptation explicite des conditions : case non cochee par
            defaut, et requise par le navigateur avant tout envoi. */}
        <label className="case-cgu">
          <input
            type="checkbox"
            required
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
          />
          <span>
            {t('auth.cgu.avant')}{' '}
            <Link to="/conditions" target="_blank" rel="noopener">
              {t('auth.cgu.conditions')}
            </Link>{' '}
            {t('auth.cgu.et')}{' '}
            <Link to="/confidentialite" target="_blank" rel="noopener">
              {t('auth.cgu.confidentialite')}
            </Link>
            .
          </span>
        </label>
        <ErreurApi erreur={erreur} />
        <Bouton type="submit" disabled={envoi || !accepte}>
          {envoi ? t('auth.inscription.encours') : t('auth.inscription.action')}
        </Bouton>
      </form>
      <p className="petit discret" style={{ margin: 0 }}>
        {t('auth.inscription.versConnexion')} <Link to="/connexion">{t('nav.connexion')}</Link>
      </p>
    </Encadre>
  );
}
