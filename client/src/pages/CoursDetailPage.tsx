import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CartesPanel } from '../components/CartesPanel';
import { ChatPanel } from '../components/ChatPanel';
import { ProgressionPanel } from '../components/ProgressionPanel';
import { QuizPanel } from '../components/QuizPanel';
import { ResumePanel } from '../components/ResumePanel';
import { Alerte, Chargement, ErreurApi, TeteDePage } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { LOCALE, useI18n } from '../lib/i18n';
import type { Cours } from '../lib/types';

/**
 * Fiche d'un cours : les trois modules IA, sous forme d'onglets.
 *
 * L'onglet actif vit dans l'URL (?onglet=quiz) et non dans un etat local.
 * Deux raisons : un rafraichissement en pleine demonstration ne renvoie pas
 * l'utilisateur sur le resume, et chaque module devient adressable — utile
 * pour une capture d'ecran ou un lien dans le rapport.
 */

/*
 * `appelle` n'est pas decoratif : c'est la singularite du projet rendue
 * visible a l'endroit ou la decision se prend. Trois onglets consomment un
 * appel au modele, les deux autres lisent la base. Jusqu'ici l'interface le
 * disait en prose, en bas de page, apres coup.
 */
const ONGLETS = [
  { cle: 'resume', traduction: 'onglet.resume', appelle: true },
  { cle: 'quiz', traduction: 'onglet.quiz', appelle: true },
  { cle: 'chat', traduction: 'onglet.tuteur', appelle: true },
  { cle: 'cartes', traduction: 'onglet.cartes', appelle: false },
  { cle: 'progression', traduction: 'onglet.progression', appelle: false },
] as const;

type CleOnglet = (typeof ONGLETS)[number]['cle'];

export function CoursDetailPage() {
  const { t, langue } = useI18n();
  const { id = '' } = useParams();
  const [parametres, setParametres] = useSearchParams();
  const [cours, setCours] = useState<Cours | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const ongletActif = useRef<HTMLButtonElement>(null);

  const demande = parametres.get('onglet');
  const actif: CleOnglet = ONGLETS.some((o) => o.cle === demande)
    ? (demande as CleOnglet)
    : 'resume';

  /*
   * Amene l'onglet actif dans le champ de vision.
   *
   * POURQUOI CE CODE EXISTE. Sur telephone, les cinq onglets ne tiennent pas
   * et la barre defile. En arrivant sur `?onglet=cartes`, l'ecran affichait
   * « Resume · Quiz · Tuteur » et le panneau des cartes en dessous : l'onglet
   * actif etait hors cadre, a droite. L'utilisateur voyait un contenu sans
   * voir ce qui l'avait selectionne — et un lien partage vers un onglet
   * precis arrivait sur une barre qui le contredisait.
   *
   * `block: 'nearest'` est indispensable : sans lui, le navigateur fait aussi
   * defiler la PAGE pour centrer l'element verticalement, ce qui escamote la
   * tete au chargement.
   *
   * ET IL DEPEND DE `cours`, pas seulement de l'onglet actif. Premiere
   * version : `[actif]` seul. L'effet se declenchait alors que la fiche
   * chargeait encore, donc avant que la barre ne soit montee — la reference
   * valait `null` et il ne se passait rien. Quand le cours arrivait,
   * `actif` n'avait pas change et l'effet ne repartait pas. Mesure apres
   * coup : l'onglet actif restait hors cadre.
   */
  useEffect(() => {
    ongletActif.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [actif, cours]);

  useEffect(() => {
    setCours(null);
    setErreur(null);
    api<{ course: Cours }>(`/courses/${id}`)
      .then((d) => setCours(d.course))
      .catch((e) => setErreur(e as ApiError));
  }, [id]);

  if (erreur) {
    return (
      <main className="page pile">
        <ErreurApi erreur={erreur} />
        <p>
          <Link to="/cours">{t('detail.retour')}</Link>
        </p>
      </main>
    );
  }

  if (!cours) {
    return (
      <main className="page pile">
        <Chargement lignes={4} />
      </main>
    );
  }

  return (
    <main className="page pile">
      <TeteDePage
        surtitre={
          <>
            <Link to="/cours">{t('nav.cours')}</Link> ·{' '}
            {cours.subject ?? t('detail.sansMatiere')}
          </>
        }
        titre={cours.title}
        sous={t('detail.caracteres', {
          n: cours.charCount.toLocaleString(LOCALE[langue]),
        })}
      >
        {/* LES ONGLETS SONT ACCROCHES AU BAS DU BLOC, et ne flottent plus
            au-dessus du contenu. Ils sont la navigation de l'ecran : les
            poser sur le bord de la tete donne a la fiche une structure que
            la pile de cartes n'avait pas, et les distingue nettement des
            panneaux qu'ils commandent. */}
        <div className="onglets onglets-tete" role="tablist">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            ref={o.cle === actif ? ongletActif : undefined}
            type="button"
            role="tab"
            className={`onglet${o.cle === actif ? ' onglet-actif' : ''}`}
            onClick={() => setParametres({ onglet: o.cle }, { replace: true })}
            aria-selected={o.cle === actif}
            aria-current={o.cle === actif ? 'page' : undefined}
          >
            {t(o.traduction)}
            <span
              className={`cout-pastille${o.appelle ? ' cout-paye' : ' cout-gratuit'}`}
              title={
                o.appelle
                  ? t('cout.paye.infobulle')
                  : t('cout.gratuit.infobulle')
              }
            >
              {o.appelle ? t('cout.paye') : t('cout.gratuit')}
            </span>
          </button>
        ))}
        </div>
      </TeteDePage>

      {/* La cle force le remontage : changer de cours ne doit jamais laisser
          a l'ecran le quiz ou la conversation du cours precedent. */}
      {actif === 'resume' && <ResumePanel key={`r-${cours.id}`} coursId={cours.id} />}
      {actif === 'quiz' && <QuizPanel key={`q-${cours.id}`} coursId={cours.id} />}
      {actif === 'chat' && <ChatPanel key={`c-${cours.id}`} coursId={cours.id} />}
      {actif === 'cartes' && <CartesPanel key={`f-${cours.id}`} coursId={cours.id} />}
      {actif === 'progression' && <ProgressionPanel key={`p-${cours.id}`} coursId={cours.id} />}

      <details className="carte">
        <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
          {t('detail.source')}
        </summary>
        <Alerte>
          {t('detail.source.note')}
        </Alerte>
        <div className="bloc-code" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {cours.content}
        </div>
      </details>
    </main>
  );
}
