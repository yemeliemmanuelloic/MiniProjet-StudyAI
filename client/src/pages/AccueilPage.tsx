import { useRef, useState, type KeyboardEvent } from 'react';
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
 * CAPTURES de la vitrine (client/public/captures) : de vraies sorties de
 * StudyAI, sur l'atelier 5 du module, reduites a 1 200 px de large.
 *
 * LES CHIFFRES de la bande « preuves » viennent du banc d'essai
 * (docs/EVALUATION.md). Ils ne sont pas calcules ici : s'ils changent, cette
 * page doit changer avec le chapitre d'evaluation.
 */

const ETAPES = ['importer', 'reviser', 'retenir'] as const;
const ATOUTS = ['ancre', 'refus', 'donnees', 'gratuit'] as const;
const PREUVES = ['citations', 'refus', 'fuites', 'gratuits'] as const;
const VITRINE = [
  { cle: 'resume', image: '/captures/resume.jpg', l: 1200, h: 736 },
  { cle: 'quiz', image: '/captures/quiz.jpg', l: 1200, h: 679 },
  { cle: 'tuteur', image: '/captures/tuteur.jpg', l: 1200, h: 846 },
] as const;

/**
 * « L'application en images » : le visiteur voit le produit avant de creer
 * un compte. Onglets accessibles (motif tablist du WAI-ARIA) : fleches,
 * Debut et Fin deplacent le choix ; un seul onglet est dans l'ordre de
 * tabulation.
 */
function Vitrine() {
  const { t } = useI18n();
  const [actif, setActif] = useState(0);
  const onglets = useRef<Array<HTMLButtonElement | null>>([]);

  function clavier(e: KeyboardEvent) {
    const n = VITRINE.length;
    let cible: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') cible = (actif + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') cible = (actif - 1 + n) % n;
    else if (e.key === 'Home') cible = 0;
    else if (e.key === 'End') cible = n - 1;
    if (cible === null) return;
    e.preventDefault();
    setActif(cible);
    onglets.current[cible]?.focus();
  }

  const v = VITRINE[actif];
  return (
    <section className="accueil-section accueil-vitrine" aria-labelledby="vitrine-titre">
      <div className="accueil-vitrine-texte">
        <h2 id="vitrine-titre">{t('accueil.vitrine.titre')}</h2>
        <p className="discret">{t('accueil.vitrine.sous')}</p>
        <div className="accueil-vitrine-onglets" role="tablist" aria-orientation="vertical" onKeyDown={clavier}>
          {VITRINE.map((o, i) => (
            <button
              key={o.cle}
              ref={(el) => {
                onglets.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`vitrine-onglet-${o.cle}`}
              aria-selected={i === actif}
              aria-controls="vitrine-panneau"
              tabIndex={i === actif ? 0 : -1}
              className={`accueil-vitrine-onglet${i === actif ? ' actif' : ''}`}
              onClick={() => setActif(i)}
            >
              <strong>{t(`accueil.vitrine.${o.cle}.titre`)}</strong>
              <span>{t(`accueil.vitrine.${o.cle}.corps`)}</span>
            </button>
          ))}
        </div>
      </div>
      <figure
        className="accueil-vitrine-cadre"
        id="vitrine-panneau"
        role="tabpanel"
        aria-labelledby={`vitrine-onglet-${v.cle}`}
      >
        <div className="accueil-vitrine-barre" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>studyai · {t(`accueil.vitrine.${v.cle}.titre`)}</span>
        </div>
        <img key={v.cle} src={v.image} alt={t(`accueil.vitrine.${v.cle}.alt`)} width={v.l} height={v.h} loading="lazy" />
      </figure>
    </section>
  );
}

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

      {/* --- L'application en images --------------------------------- */}
      <Vitrine />

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
