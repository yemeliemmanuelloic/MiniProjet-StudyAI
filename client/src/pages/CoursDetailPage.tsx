import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CartesPanel } from '../components/CartesPanel';
import { ChatPanel } from '../components/ChatPanel';
import { CarteMentalePanel } from '../components/CarteMentalePanel';
import { PresentationPanel } from '../components/PresentationPanel';
import { ProgressionPanel } from '../components/ProgressionPanel';
import { QuizPanel } from '../components/QuizPanel';
import { QuestionsOuvertesPanel } from '../components/QuestionsOuvertesPanel';
import { ResumePanel } from '../components/ResumePanel';
import { SourceCoursProvider, useSourceCours } from '../components/SourceCours';
import { Chargement, ErreurApi, TeteDePage } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { classeCours } from '../lib/couleurCours';
import { LOCALE, useI18n } from '../lib/i18n';
import { suffixe } from '../lib/metaPage';
import type { Cours } from '../lib/types';

/**
 * Fiche d'un cours : les trois modules IA, sous forme d'onglets.
 *
 * L'onglet actif vit dans l'URL (?onglet=quiz) et non dans un etat local.
 * Deux raisons : un rafraichissement en pleine demonstration ne renvoie pas
 * l'utilisateur sur le resume, et chaque module devient adressable — utile
 * pour une capture d'ecran ou un lien dans le rapport.
 */

/* Les pastilles « 1 appel » / « gratuit » qui suivaient chaque onglet ont
   ete retirees le 23 octobre (decision 042) : elles servaient la
   demonstration devant le jury, pas l'etudiant. */
const ONGLETS = [
  { cle: 'resume', traduction: 'onglet.resume' },
  { cle: 'presentation', traduction: 'onglet.presentation' },
  { cle: 'carte-mentale', traduction: 'onglet.carteMentale' },
  { cle: 'quiz', traduction: 'onglet.quiz' },
  { cle: 'chat', traduction: 'onglet.tuteur' },
  { cle: 'cartes', traduction: 'onglet.cartes' },
  { cle: 'progression', traduction: 'onglet.progression' },
] as const;

type CleOnglet = (typeof ONGLETS)[number]['cle'];

export function CoursDetailPage() {
  const { t, langue } = useI18n();
  const { id = '' } = useParams();
  const [parametres, setParametres] = useSearchParams();
  const [cours, setCours] = useState<Cours | null>(null);

  // L'onglet porte le titre du cours : avec plusieurs cours ouverts, « Mes
  // cours » ne permettait pas de les distinguer. `langue` en dependance :
  // MetaDeRoute reecrit le titre generique a chaque changement de langue.
  const titreCours = cours?.title;
  useEffect(() => {
    if (titreCours) document.title = suffixe(titreCours);
  }, [titreCours, langue]);
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
    <SourceCoursProvider texte={cours.content} classe={classeCours(cours.title)}>
    <main className={`page pile fiche-cours ${classeCours(cours.title)}`}>
      <TeteDePage
        surtitre={
          <>
            <Link to="/cours">{t('nav.cours')}</Link> ·{' '}
            {cours.subject ?? t('detail.sansMatiere')}
          </>
        }
        titre={cours.title}
        classeCours={classeCours(cours.title)}
        sous={t('detail.caracteres', {
          n: cours.charCount.toLocaleString(LOCALE[langue]),
        })}
        actions={<BoutonSource />}
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
          </button>
        ))}
        </div>
      </TeteDePage>

      {/* La cle force le remontage : changer de cours ne doit jamais laisser
          a l'ecran le quiz ou la conversation du cours precedent. */}
      {actif === 'resume' && <ResumePanel key={`r-${cours.id}`} coursId={cours.id} />}
      {actif === 'presentation' && <PresentationPanel key={`v-${cours.id}`} coursId={cours.id} />}
      {actif === 'carte-mentale' && <CarteMentalePanel key={`m-${cours.id}`} coursId={cours.id} />}
      {actif === 'quiz' && <OngletQuiz key={`q-${cours.id}`} coursId={cours.id} />}
      {actif === 'chat' && <ChatPanel key={`c-${cours.id}`} coursId={cours.id} />}
      {actif === 'cartes' && <CartesPanel key={`f-${cours.id}`} coursId={cours.id} />}
      {actif === 'progression' && <ProgressionPanel key={`p-${cours.id}`} coursId={cours.id} />}

    </main>
    </SourceCoursProvider>
  );
}

/** Ouvre le texte source depuis la tete de la fiche (components/SourceCours.tsx). */
function BoutonSource() {
  const source = useSourceCours();
  const { t } = useI18n();
  return (
    <button type="button" className="bouton bouton-secondaire" onClick={() => source?.ouvrir()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
      {t('source.bouton')}
    </button>
  );
}

/**
 * L'onglet Quiz porte deux exercices : le QCM, et les questions ouvertes
 * corrigees par l'IA (decision 049). Un onglet de plus aurait fait defiler
 * la barre d'onglets sur telephone pour deux variantes d'un meme geste.
 */
function OngletQuiz({ coursId }: { coursId: string }) {
  const { t } = useI18n();
  const [forme, setForme] = useState<'qcm' | 'ouvertes'>('qcm');
  return (
    <div className="pile">
      <div className="lecteur-modes" role="group" aria-label={t('ouvertes.forme')} style={{ alignSelf: 'flex-start' }}>
        {(['qcm', 'ouvertes'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`lecteur-mode${forme === f ? ' actif' : ''}`}
            aria-pressed={forme === f}
            onClick={() => setForme(f)}
          >
            {t(f === 'qcm' ? 'ouvertes.forme.qcm' : 'ouvertes.forme.ouvertes')}
          </button>
        ))}
      </div>
      {forme === 'qcm' ? <QuizPanel coursId={coursId} /> : <QuestionsOuvertesPanel coursId={coursId} />}
    </div>
  );
}
