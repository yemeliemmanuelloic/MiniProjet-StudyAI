import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { abonner, etatActuel, type Etat } from '../lib/etatServeur';
import { useI18n } from '../lib/i18n';
import { EMAIL_CONTACT } from '../lib/site';
import { Logo } from './Logo';
import { Bouton, EtatVide } from './ui';

/**
 * Pages et bandeaux systeme (20 octobre) : reveil du serveur, service
 * indisponible, maintenance.
 *
 * Ils couvrent les moments ou StudyAI ne peut pas fonctionner normalement,
 * et qui laissaient jusqu'ici un squelette de chargement infini ou un
 * renvoi incomprehensible vers l'ecran de connexion.
 */

/** Sonde la sante de l'API ; le resultat passe par etatServeur. */
function sonder(): void {
  api('/health').catch(() => {
    /* l'echec est deja note par etatServeur */
  });
}

function useEtatServeur(): Etat {
  const [etat, setEtat] = useState<Etat>(etatActuel);
  useEffect(() => abonner(setEtat), []);
  return etat;
}

/**
 * Bandeau global, sous l'en-tete.
 *
 * Il sonde l'API des l'arrivee sur le site : le serveur se reveille pendant
 * que le visiteur lit l'accueil ou saisit son mot de passe, et la premiere
 * vraie requete ne paie plus l'attente.
 */
export function BandeauServeur() {
  const { t } = useI18n();
  const etat = useEtatServeur();

  useEffect(sonder, []);

  if (etat === 'pret') return null;

  if (etat === 'reveil')
    return (
      <div className="bandeau-serveur bandeau-reveil" role="status" aria-live="polite">
        <span className="bandeau-pulsation" aria-hidden="true" />
        <span>
          <strong>{t('systeme.reveil.titre')}</strong> {t('systeme.reveil.corps')}
        </span>
      </div>
    );

  return (
    <div className="bandeau-serveur bandeau-injoignable" role="alert">
      <span>
        <strong>{t('systeme.injoignable.titre')}</strong> {t('systeme.injoignable.corps')}
      </span>
      <button type="button" className="bandeau-action" onClick={sonder}>
        {t('systeme.reessayer')}
      </button>
    </div>
  );
}

/**
 * Pleine page quand la session n'a pas pu etre verifiee : le jeton est
 * conserve, rien n'est perdu, on peut reessayer.
 */
export function PageIndisponible({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useI18n();
  return (
    <main className="page">
      <EtatVide
        titre={t('systeme.indisponible.titre')}
        illustration={null}
        action={<Bouton onClick={onReessayer}>{t('systeme.reessayer')}</Bouton>}
      >
        {t('systeme.indisponible.corps')}
      </EtatVide>
    </main>
  );
}

/**
 * Maintenance planifiee : remplace TOUT le site quand le front est construit
 * avec VITE_MAINTENANCE=1 (variable d'environnement de l'hebergeur, puis
 * redeploiement). Aucune requete n'est envoyee a l'API pendant ce temps.
 */
export function PageMaintenance() {
  const { t } = useI18n();
  return (
    <main className="page page-maintenance">
      <Logo />
      <EtatVide titre={t('systeme.maintenance.titre')} illustration={null}>
        {t('systeme.maintenance.corps')}
      </EtatVide>
      <p className="petit discret">
        {t('systeme.maintenance.contact')}{' '}
        <a href={`mailto:${EMAIL_CONTACT}`}>{EMAIL_CONTACT}</a>
      </p>
    </main>
  );
}

export const EN_MAINTENANCE = import.meta.env.VITE_MAINTENANCE === '1';
