import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alerte, Bouton, Champ, ErreurApi, TeteDePage } from '../components/ui';
import { api, ApiError, telecharger } from '../lib/api';
import { useAuth, type Utilisateur } from '../lib/auth';
import { useRetours } from '../components/Retours';
import { LOCALE, useI18n } from '../lib/i18n';

/**
 * Page « Mon compte » (20 octobre).
 *
 * Quatre blocs, du plus anodin au plus grave : le profil, le mot de passe,
 * l'export des donnees, la suppression du compte. La suppression est isolee
 * dans une zone a part, et exige le mot de passe ET la saisie du mot
 * SUPPRIMER : un clic distrait ne doit pas pouvoir effacer un semestre de
 * revisions.
 */

export function ComptePage() {
  const { t, langue } = useI18n();
  const { utilisateur } = useAuth();
  const locale = LOCALE[langue];

  const date = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' })
      : t('compte.profil.jamais');

  return (
    <main className="page pile">
      <TeteDePage surtitre={t('compte.surtitre')} titre={t('compte.titre')} sous={t('compte.sous')} />

      <section className="carte pile compte-bloc">
        <h2>{t('compte.profil.titre')}</h2>
        <dl className="compte-profil">
          <dt>{t('compte.profil.email')}</dt>
          <dd>{utilisateur?.email}</dd>
          <dt>{t('compte.profil.inscription')}</dt>
          <dd>{date(utilisateur?.createdAt)}</dd>
          <dt>{t('compte.profil.precedente')}</dt>
          <dd>{date(utilisateur?.previousLoginAt)}</dd>
        </dl>
        <p className="petit discret">{t('compte.profil.aide')}</p>
      </section>

      <MotDePasse />
      <Export />
      <Suppression />
    </main>
  );
}

function MotDePasse() {
  const { t } = useI18n();
  const { remplacerSession } = useAuth();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [succes, setSucces] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const differents = confirmation.length > 0 && confirmation !== nouveau;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (differents) return;
    setErreur(null);
    setSucces(false);
    setEnvoi(true);
    try {
      const d = await api<{ user: Utilisateur; token: string }>('/auth/password', {
        body: { currentPassword: actuel, newPassword: nouveau },
      });
      remplacerSession(d.user, d.token);
      setActuel('');
      setNouveau('');
      setConfirmation('');
      setSucces(true);
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="carte pile compte-bloc">
      <h2>{t('compte.mdp.titre')}</h2>
      <p className="discret">{t('compte.mdp.aide')}</p>
      {succes && <Alerte ton="succes">{t('compte.mdp.succes')}</Alerte>}
      <ErreurApi erreur={erreur} />
      <form className="pile compte-formulaire" onSubmit={soumettre}>
        <Champ
          libelle={t('compte.mdp.actuel')}
          name="mdp-actuel"
          type="password"
          autoComplete="current-password"
          required
          value={actuel}
          onChange={(e) => setActuel(e.target.value)}
        />
        <Champ
          libelle={t('compte.mdp.nouveau')}
          name="mdp-nouveau"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
        />
        <Champ
          libelle={t('compte.mdp.confirmation')}
          name="mdp-confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          erreur={differents ? t('compte.mdp.differents') : undefined}
        />
        <div>
          <Bouton type="submit" disabled={envoi || differents}>
            {envoi ? t('compte.mdp.envoi') : t('compte.mdp.action')}
          </Bouton>
        </div>
      </form>
    </section>
  );
}

function Export() {
  const { t } = useI18n();
  const { notifier } = useRetours();
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function exporter() {
    setErreur(null);
    setEnvoi(true);
    try {
      const jour = new Date().toISOString().slice(0, 10);
      await telecharger('/auth/me/export', `studyai-mes-donnees-${jour}.json`);
      notifier(t('compte.export.lance'));
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="carte pile compte-bloc">
      <h2>{t('compte.export.titre')}</h2>
      <p className="discret">{t('compte.export.aide')}</p>
      <ErreurApi erreur={erreur} />
      <div>
        <Bouton secondaire onClick={exporter} disabled={envoi}>
          {envoi ? t('compte.export.envoi') : t('compte.export.action')}
        </Bouton>
      </div>
    </section>
  );
}

function Suppression() {
  const { t } = useI18n();
  const { deconnecter } = useAuth();
  const navigate = useNavigate();
  const [mdp, setMdp] = useState('');
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const pret = mdp.length > 0 && saisie.trim().toUpperCase() === t('compte.suppr.mot').toUpperCase();

  async function supprimer(e: FormEvent) {
    e.preventDefault();
    if (!pret) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await api<void>('/auth/me', { method: 'DELETE', body: { password: mdp } });
      deconnecter();
      navigate('/', { replace: true });
    } catch (err) {
      setErreur(err as ApiError);
      setEnvoi(false);
    }
  }

  return (
    <section className="carte pile compte-bloc compte-danger">
      <h2>{t('compte.suppr.titre')}</h2>
      <p>{t('compte.suppr.aide')}</p>
      <ErreurApi erreur={erreur} />
      <form className="pile compte-formulaire" onSubmit={supprimer}>
        <Champ
          libelle={t('compte.suppr.mdp')}
          name="suppr-mdp"
          type="password"
          autoComplete="current-password"
          required
          value={mdp}
          onChange={(e) => setMdp(e.target.value)}
        />
        <Champ
          libelle={t('compte.suppr.confirmer', { mot: t('compte.suppr.mot') })}
          name="suppr-mot"
          autoComplete="off"
          required
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
        />
        <div>
          <button type="submit" className="bouton bouton-danger" disabled={!pret || envoi}>
            {envoi ? t('compte.suppr.envoi') : t('compte.suppr.action')}
          </button>
        </div>
      </form>
    </section>
  );
}
