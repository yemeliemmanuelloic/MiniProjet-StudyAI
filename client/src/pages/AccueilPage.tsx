import { Link, Navigate } from 'react-router-dom';
import { Chargement } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

/**
 * Page d'accueil publique.
 *
 * POURQUOI. Un visiteur arrivait directement sur le formulaire de connexion :
 * rien ne disait a quoi sert StudyAI ni ce qui le distingue d'un assistant
 * generaliste. Cette page le dit avant de demander quoi que ce soit.
 *
 * Un etudiant deja connecte ne la voit pas : il va droit a ses cours, ou le
 * tableau « Aujourd'hui » lui dit par quoi commencer.
 *
 * PHOTOS. Deux photos du domaine public (CC0 1.0), dans client/public/photos :
 *   - groupe-etude.jpg : Wonderlane, Flickr (Openverse) ;
 *   - ordinateur-notes.jpg : Startup Stock Photos, StockSnap.
 * Aucune attribution n'est exigee par CC0 ; le credit figure quand meme dans
 * les mentions legales. Les fichiers sont dans le depot : la page ne depend
 * d'aucun site tiers pour s'afficher.
 *
 * LES CHIFFRES de la bande « preuves » viennent du banc d'essai
 * (docs/EVALUATION.md). Ils ne sont pas calcules ici : s'ils changent, cette
 * page doit changer avec le chapitre d'evaluation.
 */

const ETAPES = ['importer', 'reviser', 'retenir'] as const;
const ATOUTS = ['ancre', 'refus', 'donnees', 'gratuit'] as const;
const PREUVES = ['citations', 'refus', 'fuites', 'gratuits'] as const;

export function Accueil() {
  const { utilisateur, chargement } = useAuth();
  if (chargement)
    return (
      <div className="page pile">
        <Chargement lignes={4} />
      </div>
    );
  if (utilisateur) return <Navigate to="/cours" replace />;
  return <AccueilPage />;
}

function AccueilPage() {
  const { t } = useI18n();
  return (
    <main className="accueil">
      {/* --- Ouverture ------------------------------------------------- */}
      <section className="accueil-ouverture">
        <div className="accueil-ouverture-texte">
          <p className="accueil-surtitre">{t('accueil.surtitre')}</p>
          <h1>{t('accueil.titre')}</h1>
          <p className="accueil-chapeau">{t('accueil.chapeau')}</p>
          <div className="accueil-actions">
            <Link className="bouton accueil-bouton" to="/inscription">
              {t('accueil.cta.inscription')}
            </Link>
            <Link className="bouton bouton-secondaire accueil-bouton" to="/connexion">
              {t('accueil.cta.connexion')}
            </Link>
          </div>
          <ul className="accueil-garanties">
            <li>{t('accueil.garantie.formats')}</li>
            <li>{t('accueil.garantie.donnees')}</li>
            <li>{t('accueil.garantie.gratuit')}</li>
          </ul>
        </div>

        <figure className="accueil-visuel">
          <img src="/photos/groupe-etude.jpg" alt={t('accueil.photo.groupe')} width="1024" height="681" fetchPriority="high" />
          {/* Une vraie sortie de StudyAI posee sur la photo : la question et
              sa citation du cours, telles que l'application les affiche. */}
          <div className="accueil-vignette" aria-hidden="true">
            <span className="accueil-vignette-etat">✓ {t('accueil.vignette.etat')}</span>
            <strong>{t('accueil.vignette.question')}</strong>
            <span className="accueil-vignette-citation">{t('accueil.vignette.citation')}</span>
          </div>
        </figure>
      </section>

      {/* --- Preuves chiffrees ----------------------------------------- */}
      <section className="accueil-preuves" aria-label={t('accueil.preuves.titre')}>
        {PREUVES.map((cle) => (
          <div key={cle} className="accueil-preuve">
            <strong>{t(`accueil.preuve.${cle}.valeur`)}</strong>
            <span>{t(`accueil.preuve.${cle}.libelle`)}</span>
          </div>
        ))}
      </section>

      {/* --- Comment ca marche ---------------------------------------- */}
      <section className="accueil-section">
        <h2>{t('accueil.etapes.titre')}</h2>
        <ol className="accueil-etapes">
          {ETAPES.map((cle, i) => (
            <li key={cle} className="accueil-etape">
              <span className="accueil-etape-numero" aria-hidden="true">{i + 1}</span>
              <h3>{t(`accueil.etape.${cle}.titre`)}</h3>
              <p>{t(`accueil.etape.${cle}.corps`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Ce qui distingue StudyAI ---------------------------------- */}
      <section className="accueil-section accueil-distinction">
        <figure className="accueil-visuel accueil-visuel-secondaire">
          <img src="/photos/ordinateur-notes.jpg" alt={t('accueil.photo.ordinateur')} width="960" height="640" loading="lazy" />
        </figure>
        <div>
          <h2>{t('accueil.atouts.titre')}</h2>
          <ul className="accueil-atouts">
            {ATOUTS.map((cle) => (
              <li key={cle} className={`accueil-atout accueil-atout-${cle}`}>
                <h3>{t(`accueil.atout.${cle}.titre`)}</h3>
                <p>{t(`accueil.atout.${cle}.corps`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --- Appel final ----------------------------------------------- */}
      <section className="accueil-appel">
        <h2>{t('accueil.appel.titre')}</h2>
        <p>{t('accueil.appel.corps')}</p>
        <Link className="bouton accueil-bouton" to="/inscription">
          {t('accueil.cta.inscription')}
        </Link>
      </section>
    </main>
  );
}
