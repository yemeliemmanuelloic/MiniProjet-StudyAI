import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ProgressionPanel } from '../components/ProgressionPanel';
import { QuizPanel } from '../components/QuizPanel';
import { ResumePanel } from '../components/ResumePanel';
import { Alerte, Chargement, ErreurApi } from '../components/ui';
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
 * appel au modele, le quatrieme lit la base. Jusqu'ici l'interface le disait
 * en prose, en bas de page, apres coup.
 */
const ONGLETS = [
  { cle: 'resume', traduction: 'onglet.resume', appelle: true },
  { cle: 'quiz', traduction: 'onglet.quiz', appelle: true },
  { cle: 'chat', traduction: 'onglet.tuteur', appelle: true },
  { cle: 'progression', traduction: 'onglet.progression', appelle: false },
] as const;

type CleOnglet = (typeof ONGLETS)[number]['cle'];

export function CoursDetailPage() {
  const { t, langue } = useI18n();
  const { id = '' } = useParams();
  const [parametres, setParametres] = useSearchParams();
  const [cours, setCours] = useState<Cours | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  const demande = parametres.get('onglet');
  const actif: CleOnglet = ONGLETS.some((o) => o.cle === demande)
    ? (demande as CleOnglet)
    : 'resume';

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
      <div>
        <p className="petit discret" style={{ margin: '0 0 4px' }}>
          <Link to="/cours">{t('nav.cours')}</Link> · {cours.subject ?? t('detail.sansMatiere')}
        </p>
        <h1>{cours.title}</h1>
        <p className="discret petit" style={{ margin: 0 }}>
          {t('detail.caracteres', { n: cours.charCount.toLocaleString(LOCALE[langue]) })}
        </p>
      </div>

      {/* Les onglets etaient stylés par une douzaine de valeurs ecrites en
          ligne — couleurs, epaisseurs, espacements — en contradiction avec la
          regle que la feuille de style enonce en commentaire. */}
      <div className="onglets" role="tablist">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
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

      {/* La cle force le remontage : changer de cours ne doit jamais laisser
          a l'ecran le quiz ou la conversation du cours precedent. */}
      {actif === 'resume' && <ResumePanel key={`r-${cours.id}`} coursId={cours.id} />}
      {actif === 'quiz' && <QuizPanel key={`q-${cours.id}`} coursId={cours.id} />}
      {actif === 'chat' && <ChatPanel key={`c-${cours.id}`} coursId={cours.id} />}
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
