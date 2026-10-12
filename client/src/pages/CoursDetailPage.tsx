import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { QuizPanel } from '../components/QuizPanel';
import { ResumePanel } from '../components/ResumePanel';
import { Alerte, ErreurApi } from '../components/ui';
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

const ONGLETS = [
  { cle: 'resume', libelle: 'Resume' },
  { cle: 'quiz', libelle: 'Quiz' },
  { cle: 'chat', libelle: 'Tuteur' },
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
      <main className="page">
        <p className="discret">Chargement du cours…</p>
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

      <div className="ligne" style={{ gap: 8, borderBottom: '1px solid var(--bordure)' }}>
        {ONGLETS.map((o) => {
          const estActif = o.cle === actif;
          return (
            <button
              key={o.cle}
              type="button"
              onClick={() => setParametres({ onglet: o.cle }, { replace: true })}
              aria-current={estActif ? 'page' : undefined}
              style={{
                font: 'inherit',
                fontWeight: estActif ? 600 : 500,
                color: estActif ? 'var(--brand)' : 'var(--texte-secondaire)',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${estActif ? 'var(--brand)' : 'transparent'}`,
                padding: '10px 14px',
                marginBottom: -1,
                cursor: 'pointer',
              }}
            >
              {o.libelle}
            </button>
          );
        })}
      </div>

      {/* La cle force le remontage : changer de cours ne doit jamais laisser
          a l'ecran le quiz ou la conversation du cours precedent. */}
      {actif === 'resume' && <ResumePanel key={`r-${cours.id}`} coursId={cours.id} />}
      {actif === 'quiz' && <QuizPanel key={`q-${cours.id}`} coursId={cours.id} />}
      {actif === 'chat' && <ChatPanel key={`c-${cours.id}`} coursId={cours.id} />}

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
