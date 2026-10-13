import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ProgressionPanel } from '../components/ProgressionPanel';
import { QuizPanel } from '../components/QuizPanel';
import { ResumePanel } from '../components/ResumePanel';
import { Alerte, Chargement, ErreurApi } from '../components/ui';
import { api, ApiError } from '../lib/api';
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
  { cle: 'resume', libelle: 'Resume', appelle: true },
  { cle: 'quiz', libelle: 'Quiz', appelle: true },
  { cle: 'chat', libelle: 'Tuteur', appelle: true },
  { cle: 'progression', libelle: 'Progression', appelle: false },
] as const;

type CleOnglet = (typeof ONGLETS)[number]['cle'];

export function CoursDetailPage() {
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
          <Link to="/cours">Retour a mes cours</Link>
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
          <Link to="/cours">Mes cours</Link> · {cours.subject ?? 'Sans matiere'}
        </p>
        <h1>{cours.title}</h1>
        <p className="discret petit" style={{ margin: 0 }}>
          {cours.charCount.toLocaleString('fr-FR')} caracteres analyses
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
            {o.libelle}
            <span
              className={`cout-pastille${o.appelle ? ' cout-paye' : ' cout-gratuit'}`}
              title={
                o.appelle
                  ? 'Cet onglet peut declencher un appel au modele'
                  : 'Cet onglet ne lit que la base : aucun appel au modele'
              }
            >
              {o.appelle ? '1 appel' : 'gratuit'}
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
          Texte du cours tel qu'il est enregistre
        </summary>
        <Alerte>
          C'est ce texte qui part au modele, <strong>apres anonymisation</strong>. L'onglet Resume
          permet de verifier ce qui a reellement ete transmis.
        </Alerte>
        <div className="bloc-code" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {cours.content}
        </div>
      </details>
    </main>
  );
}
