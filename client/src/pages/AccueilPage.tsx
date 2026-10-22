import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { IllustrationQuiz, IllustrationRefus, IllustrationResume, IllustrationScore, IllustrationTuteur } from '../components/Illustrations';
import { Chargement } from '../components/ui';
import { useAuth } from '../lib/auth';
import { PAGES } from '../lib/contenus';
import { useI18n, type Cle } from '../lib/i18n';
import { enLigne } from './PageInfo';

/**
 * Page d'accueil publique (refaite le 22 octobre, refonte « Atelier »).
 *
 * L'ORDRE suit le gabarit classique d'une page de presentation, que l'equipe
 * a fourni : ouverture, fonctionnalites, fonctionnement, ce qui distingue le
 * produit, preuves, pour qui, questions frequentes, appel final, pied de
 * page. Chaque section repond a la question que se pose le visiteur a ce
 * moment-la, dans cet ordre : qu'est-ce que c'est, que fait-il, comment,
 * pourquoi lui, puis-je le croire, est-ce pour moi, et mes doutes.
 *
 * CE QUI N'A PAS ETE REPRIS DU GABARIT, et pourquoi :
 *   - les AVIS D'UTILISATEURS : StudyAI n'en a pas. Des avis inventes
 *     tromperaient le visiteur ; l'emplacement porte des situations d'usage,
 *     ecrites comme telles, sans nom ni etoiles. De vrais avis, recueillis
 *     avec l'accord de leurs auteurs, pourront les remplacer ;
 *   - la BANDE DE LOGOS PARTENAIRES : il n'y en a pas. Ce que le visiteur a
 *     besoin de savoir a cet endroit — son fichier sera-t-il lu ? — tient
 *     dans la ligne de garanties sous les boutons ;
 *   - le BADGE « 2 500+ utilisateurs » : remplace par ce qui est vrai ;
 *   - l'INSCRIPTION A UNE LETTRE D'INFORMATION dans le pied de page : aucun
 *     envoi n'existe derriere.
 *
 * ILLUSTRATIONS (components/Illustrations.tsx) : de vraies sorties de
 * StudyAI, rendues avec les composants du site plutot qu'en captures. PHOTOS (client/public/photos) : domaine public,
 * CC0 1.0, creditees dans les mentions legales. CHIFFRES des preuves : le
 * banc d'essai (docs/EVALUATION.md) ; ils changent avec lui.
 */

const ETAPES = ['importer', 'reviser', 'retenir'] as const;
const ATOUTS = ['ancre', 'refus', 'donnees', 'gratuit'] as const;
const PREUVES = ['citations', 'refus', 'fuites', 'gratuits'] as const;
const SITUATIONS = ['partiel', 'dense', 'semestre'] as const;
const OUTILS_REVISION = ['cartes', 'examen', 'recherche', 'progression'] as const;
const QUESTIONS_FAQ = 5;

/* Icones au trait, dessinees ici : aucune bibliotheque d'icones. */
const ICONES: Record<string, ReactNode> = {
  ancre: (
    <>
      <path d="M12 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 8v13M5 13a7 7 0 0 0 14 0" />
      <path d="M8 11H5v2M16 11h3v2" />
    </>
  ),
  refus: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8" />
    </>
  ),
  donnees: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  gratuit: (
    <>
      <path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0z" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  cartes: (
    <>
      <rect x="4" y="6" width="13" height="14" rx="2" />
      <path d="M8 3h10a2 2 0 0 1 2 2v12" />
    </>
  ),
  examen: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M8.5 12.5l2.2 2.2 4.8-4.8" />
    </>
  ),
  recherche: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  progression: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />,
};

function Icone({ nom }: { nom: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES[nom]}
    </svg>
  );
}

/** En-tete de section : surtitre, titre, phrase d'introduction. */
function TeteSection({ id, surtitre, titre, sous }: { id: string; surtitre: string; titre: string; sous?: string }) {
  return (
    <div className="lp-tete">
      <p className="lp-surtitre">{surtitre}</p>
      <h2 id={id}>{titre}</h2>
      {sous && <p className="lp-sous">{sous}</p>}
    </div>
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
  const { t, langue } = useI18n();
  const emplacement = useLocation();
  const tt = (cle: string) => t(cle as Cle);

  /* Les liens d'ancrage de l'en-tete (/#fonctionnalites, /#faq) : le
     routeur ne fait pas defiler jusqu'a l'ancre, on s'en charge. */
  useEffect(() => {
    if (!emplacement.hash) return;
    document.getElementById(emplacement.hash.slice(1))?.scrollIntoView();
  }, [emplacement.hash]);

  const faq = PAGES.faq[langue].sections.slice(0, QUESTIONS_FAQ);

  return (
    <main className="lp">
      {/* --- 1. Ouverture ------------------------------------------------ */}
      <section className="lp-ouverture">
        <div className="lp-ouverture-texte">
          <p className="lp-badge">
            <span aria-hidden="true" />
            {t('accueil.badge')}
          </p>
          <h1>{t('accueil.titre')}</h1>
          <p className="lp-chapeau">{t('accueil.chapeau')}</p>
          <div className="lp-actions">
            <Link className="bouton lp-bouton" to="/inscription">
              {t('accueil.cta.inscription')}
            </Link>
            <a className="bouton bouton-secondaire lp-bouton" href="#fonctionnalites">
              {t('accueil.cta.decouvrir')}
            </a>
          </div>
          <ul className="lp-garanties">
            <li>{t('accueil.garantie.formats')}</li>
            <li>{t('accueil.garantie.donnees')}</li>
            <li>{t('accueil.garantie.gratuit')}</li>
          </ul>
        </div>
        <div className="lp-ouverture-visuel">
          <IllustrationQuiz />
          <IllustrationRefus />
        </div>
      </section>

      {/* --- 2. Fonctionnalites : deux grandes, deux petites ------------- */}
      <section className="lp-section" id="fonctionnalites" aria-labelledby="lp-fonctions">
        <TeteSection id="lp-fonctions" surtitre={t('accueil.nav.fonctionnalites')} titre={t('accueil.fonctions.titre')} sous={t('accueil.fonctions.sous')} />
        <div className="lp-bento">
          <article className="lp-fonction lp-fonction-large">
            <div className="lp-fonction-texte">
              <h3>{t('accueil.vitrine.resume.titre')}</h3>
              <p>{t('accueil.vitrine.resume.corps')}</p>
            </div>
            <IllustrationResume />
          </article>
          <article className="lp-fonction">
            <div className="lp-fonction-texte">
              <h3>{t('accueil.vitrine.tuteur.titre')}</h3>
              <p>{t('accueil.vitrine.tuteur.corps')}</p>
            </div>
            <IllustrationTuteur />
          </article>
          <article className="lp-fonction">
            <div className="lp-fonction-texte">
              <h3>{t('accueil.vitrine.quiz.titre')}</h3>
              <p>{t('accueil.vitrine.quiz.corps')}</p>
            </div>
            <IllustrationScore />
          </article>
          <article className="lp-fonction lp-fonction-large lp-fonction-outils">
            <div className="lp-fonction-texte">
              <h3>{t('accueil.revision.titre')}</h3>
              <p>{t('accueil.revision.corps')}</p>
            </div>
            <ul className="lp-outils">
              {OUTILS_REVISION.map((cle) => (
                <li key={cle}>
                  <Icone nom={cle} />
                  <span>{tt(`accueil.revision.${cle}`)}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {/* --- 3. Comment ca marche ------------------------------------- */}
      <section className="lp-section lp-fonctionnement" id="comment" aria-labelledby="lp-comment">
        <TeteSection id="lp-comment" surtitre={t('accueil.nav.comment')} titre={t('accueil.etapes.titre')} />
        <div className="lp-fonctionnement-corps">
          <ol className="lp-etapes">
            {ETAPES.map((cle, i) => (
              <li key={cle}>
                <span className="lp-etape-numero" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{tt(`accueil.etape.${cle}.titre`)}</h3>
                  <p>{tt(`accueil.etape.${cle}.corps`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <img className="lp-photo" src="/photos/ordinateur-notes.jpg" alt={t('accueil.photo.ordinateur')} width="960" height="640" loading="lazy" />
        </div>
      </section>

      {/* --- 4. Ce qui le distingue ------------------------------------ */}
      <section className="lp-section" aria-labelledby="lp-atouts">
        <TeteSection id="lp-atouts" surtitre={t('accueil.atouts.surtitre')} titre={t('accueil.atouts.titre')} />
        <ul className="lp-atouts">
          {ATOUTS.map((cle) => (
            <li key={cle}>
              <span className="lp-atout-icone">
                <Icone nom={cle} />
              </span>
              <h3>{tt(`accueil.atout.${cle}.titre`)}</h3>
              <p>{tt(`accueil.atout.${cle}.corps`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* --- 5. Preuves mesurees ----------------------------------------- */}
      <section className="lp-section lp-preuves" aria-labelledby="lp-preuves">
        <TeteSection id="lp-preuves" surtitre={t('accueil.preuves.surtitre')} titre={t('accueil.preuves.titre')} sous={t('accueil.preuves.sous')} />
        <div className="lp-preuves-grille">
          {PREUVES.map((cle) => (
            <div key={cle} className="lp-preuve">
              <strong>{tt(`accueil.preuve.${cle}.valeur`)}</strong>
              <span>{tt(`accueil.preuve.${cle}.libelle`)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* --- 6. Pour qui : des situations, pas des avis ----------------- */}
      <section className="lp-section" aria-labelledby="lp-pourqui">
        <TeteSection id="lp-pourqui" surtitre={t('accueil.pourqui.surtitre')} titre={t('accueil.pourqui.titre')} sous={t('accueil.pourqui.sous')} />
        <ul className="lp-situations">
          {SITUATIONS.map((cle) => (
            <li key={cle}>
              <h3>{tt(`accueil.pourqui.${cle}.titre`)}</h3>
              <p>{tt(`accueil.pourqui.${cle}.corps`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* --- 7. Questions frequentes ----------------------------------- */}
      <section className="lp-section lp-faq" id="faq" aria-labelledby="lp-faq">
        <div>
          <TeteSection id="lp-faq" surtitre={t('accueil.nav.faq')} titre={t('accueil.faq.titre')} sous={t('accueil.faq.sous')} />
          <Link to="/faq" className="lp-lien">
            {t('accueil.faq.tout')}
          </Link>
        </div>
        <div className="lp-questions">
          {faq.map((q) => (
            <details key={q.titre}>
              <summary>{q.titre}</summary>
              {q.blocs.map((b, i) => (b.type === 'p' ? <p key={i}>{enLigne(b.texte)}</p> : null))}
            </details>
          ))}
        </div>
      </section>

      {/* --- 8. Appel final ------------------------------------------- */}
      <section className="lp-appel" aria-labelledby="lp-appel">
        <div className="lp-appel-texte">
          <h2 id="lp-appel">{t('accueil.appel.titre')}</h2>
          <p>{t('accueil.appel.corps')}</p>
          <div className="lp-actions">
            <Link className="bouton lp-bouton" to="/inscription">
              {t('accueil.cta.inscription')}
            </Link>
            <Link className="bouton bouton-secondaire lp-bouton" to="/connexion">
              {t('accueil.cta.connexion')}
            </Link>
          </div>
        </div>
        <img src="/photos/groupe-etude.jpg" alt={t('accueil.photo.groupe')} width="1024" height="681" loading="lazy" />
      </section>
    </main>
  );
}
