import { Link } from 'react-router-dom';
import { TeteDePage } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { EMAIL_CONTACT } from '../lib/site';

/**
 * Page Contact : un lien de messagerie, sans formulaire (choix du
 * 20 octobre). Rien n'est stocke par StudyAI, aucun spam a filtrer, et
 * l'etudiant garde une copie de son message dans sa propre messagerie.
 */
export function ContactPage() {
  const { t } = useI18n();
  const sujet = encodeURIComponent(t('contact.sujet'));

  return (
    <main className="page pile">
      <TeteDePage surtitre={t('contact.surtitre')} titre={t('contact.titre')} sous={t('contact.sous')} />
      <section className="carte pile contact">
        <p>{t('contact.intro')}</p>
        <p className="contact-adresse">
          <a href={`mailto:${EMAIL_CONTACT}?subject=${sujet}`}>{EMAIL_CONTACT}</a>
        </p>
        <div>
          <a className="bouton" href={`mailto:${EMAIL_CONTACT}?subject=${sujet}`}>
            {t('contact.action')}
          </a>
        </div>
        <h2>{t('contact.avant.titre')}</h2>
        <ul>
          <li>
            <Link to="/faq">{t('contact.avant.faq')}</Link>
          </li>
          <li>
            <Link to="/aide">{t('contact.avant.aide')}</Link>
          </li>
          <li>
            <Link to="/confidentialite">{t('contact.avant.donnees')}</Link>
          </li>
        </ul>
        <p className="petit discret">{t('contact.delai')}</p>
      </section>
    </main>
  );
}
