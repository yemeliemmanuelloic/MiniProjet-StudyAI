import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LANGUES, useI18n, type Langue } from '../lib/i18n';
import { useRetours } from './Retours';

/**
 * Pastille de compte et son menu (20 octobre).
 *
 * POURQUOI. L'en-tete d'un etudiant connecte alignait le choix de langue,
 * l'adresse electronique en entier et un bouton « Se deconnecter » : la
 * moitie de la barre pour des reglages qu'on touche rarement, et une adresse
 * longue qui poussait la navigation. Une pastille a l'initiale les remplace ;
 * un clic deplie le reste.
 *
 * Motif « bouton qui deplie » (disclosure) plutot qu'un role="menu" : le
 * panneau contient des liens et un groupe de boutons de langue, que le
 * clavier parcourt normalement avec Tab. Echap et un clic a l'exterieur le
 * referment ; le focus revient alors sur la pastille.
 *
 * Sur telephone, dans le menu replie de l'en-tete, le panneau s'affiche
 * deplie et la pastille disparait (index.css) : un menu dans un menu ne se
 * manipule pas au pouce.
 */

export function ChoixLangue() {
  const { langue, changer, t } = useI18n();
  return (
    <div className="choix-langue" role="group" aria-label={t('nav.langue')}>
      {(Object.keys(LANGUES) as Langue[]).map((l) => (
        <button
          key={l}
          type="button"
          className={`langue${l === langue ? ' langue-active' : ''}`}
          onClick={() => changer(l)}
          aria-pressed={l === langue}
          title={LANGUES[l]}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Initiale de l'adresse : la premiere lettre ou chiffre avant l'arobase. */
export function initiale(email: string): string {
  const c = email.trim().match(/[\p{L}\p{N}]/u);
  return c ? c[0].toUpperCase() : '?';
}

export function MenuCompte() {
  const { utilisateur, deconnecter } = useAuth();
  const { t } = useI18n();
  const { notifier } = useRetours();
  const [ouvert, setOuvert] = useState(false);
  const bloc = useRef<HTMLDivElement>(null);
  const pastille = useRef<HTMLButtonElement>(null);
  const emplacement = useLocation();

  useEffect(() => setOuvert(false), [emplacement.pathname, emplacement.search]);

  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => {
      if (bloc.current && !bloc.current.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOuvert(false);
        pastille.current?.focus();
      }
    };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  if (!utilisateur) return null;
  const lettre = initiale(utilisateur.email);

  return (
    <div className={`compte-menu-bloc${ouvert ? ' ouvert' : ''}`} ref={bloc}>
      <button
        ref={pastille}
        type="button"
        className="compte-pastille"
        aria-expanded={ouvert}
        aria-controls="compte-menu"
        aria-label={t('nav.compte.ouvrir', { email: utilisateur.email })}
        title={utilisateur.email}
        onClick={() => setOuvert((o) => !o)}
      >
        <span aria-hidden="true">{lettre}</span>
      </button>

      <div id="compte-menu" className="compte-menu">
        <div className="compte-menu-tete">
          <span className="compte-pastille compte-pastille-grande" aria-hidden="true">
            {lettre}
          </span>
          <div>
            <span className="compte-menu-connecte">{t('nav.compte.connecte')}</span>
            <strong className="compte-menu-email">{utilisateur.email}</strong>
          </div>
        </div>
        <ul className="compte-menu-liens">
          <li>
            <Link to="/compte?onglet=activite">{t('compte.onglet.activite')}</Link>
          </li>
          <li>
            <Link to="/compte?onglet=profil">{t('compte.onglet.profil')}</Link>
          </li>
          {/* La consommation d'IA quitte la navigation principale (decision
              042) : un tableau de jetons interesse le curieux, pas l'etudiant
              qui revise. Elle reste a un clic, avec le compte. */}
          <li>
            <Link to="/consommation">{t('nav.consommation.compte')}</Link>
          </li>
        </ul>
        <div className="compte-menu-langue">
          <span>{t('nav.langue')}</span>
          <ChoixLangue />
        </div>
        <button
          type="button"
          className="compte-menu-sortie"
          onClick={() => {
            deconnecter();
            notifier(t('nav.deconnecte'), 'info');
          }}
        >
          {t('nav.deconnexion')}
        </button>
      </div>
    </div>
  );
}
