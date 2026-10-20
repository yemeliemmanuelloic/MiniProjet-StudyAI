import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { ANNEE, EQUIPE, NOM_SITE } from '../lib/site';
import { Logo } from './Logo';

/**
 * Pied de page, present sur toutes les pages (20 octobre).
 *
 * Trois colonnes de liens — le produit, l'aide, le juridique — et une ligne
 * de copyright. Les liens « produit » dependent de la connexion : un
 * visiteur n'a rien a faire de « Mes cours ».
 */
export function PiedDePage() {
  const { t } = useI18n();
  const { utilisateur } = useAuth();

  return (
    <footer className="pied">
      <div className="pied-corps">
        <div className="pied-marque">
          <Logo taille={24} />
          <p>{t('pied.presentation')}</p>
        </div>

        <nav className="pied-colonne" aria-label={t('pied.produit')}>
          <h2>{t('pied.produit')}</h2>
          {utilisateur ? (
            <>
              <Link to="/cours">{t('nav.cours')}</Link>
              <Link to="/examen">{t('nav.examen')}</Link>
              <Link to="/compte">{t('nav.compte')}</Link>
            </>
          ) : (
            <>
              <Link to="/">{t('pied.accueil')}</Link>
              <Link to="/inscription">{t('nav.inscription')}</Link>
              <Link to="/connexion">{t('nav.connexion')}</Link>
            </>
          )}
          <Link to="/a-propos">{t('pied.apropos')}</Link>
        </nav>

        <nav className="pied-colonne" aria-label={t('pied.aide')}>
          <h2>{t('pied.aide')}</h2>
          <Link to="/aide">{t('pied.centre')}</Link>
          <Link to="/faq">{t('pied.faq')}</Link>
          <Link to="/contact">{t('pied.contact')}</Link>
        </nav>

        <nav className="pied-colonne" aria-label={t('pied.juridique')}>
          <h2>{t('pied.juridique')}</h2>
          <Link to="/mentions-legales">{t('pied.mentions')}</Link>
          <Link to="/confidentialite">{t('pied.confidentialite')}</Link>
          <Link to="/conditions">{t('pied.conditions')}</Link>
        </nav>
      </div>

      <div className="pied-bas">
        <p>
          © {ANNEE} {NOM_SITE} · {EQUIPE.join(' · ')}
        </p>
        <p>{t('pied.cookies')}</p>
      </div>
    </footer>
  );
}
