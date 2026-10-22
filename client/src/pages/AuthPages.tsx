import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
function Encadre({ titre, sous, children }: { titre: string; sous: string; children: ReactNode }) {
  const t = useT();
  return (
    <main className="auth">
      <section className="auth-presentation">
        <Logo taille={34} />
        <p className="auth-accroche">{t('auth.accroche')}</p>
        <ul className="auth-modules">
          {MODULES.map((cle) => (
            <li key={cle}>
              <strong>{t(`auth.module.${cle}`)}</strong>
              <span>{t(`auth.module.${cle}.corps`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="auth-formulaire">
        <div className="carte pile">
          <div>
            <h1>{titre}</h1>
            <p className="discret" style={{ margin: 0 }}>
              {sous}
            </p>
          </div>
          {children}
        </div>
      </section>
    </main>
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
        <Champ
          libelle={t('auth.champ.motDePasse')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
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
        <Champ
          libelle={t('auth.champ.motDePasse')}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder={t('auth.champ.motDePasse.indice')}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
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
