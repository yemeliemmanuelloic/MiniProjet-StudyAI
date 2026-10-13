import { useEffect, useState } from 'react';
import { Alerte, Chargement, ErreurApi, EtatVide, Pastille, Score } from './ui';
import { api, ApiError } from '../lib/api';
import type { Progression, Tentative } from '../lib/types';

/**
 * Espace revision — historique et progression.
 *
 * N'appelle aucun modele : tout vient de la table des tentatives, qui
 * enregistrait deja ces donnees sans que personne ne les affiche. Cet onglet
 * transforme un outil de generation en outil de revision.
 */

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Courbe des scores, en SVG ecrit a la main.
 *
 * Une bibliotheque de graphiques pour douze points couterait 200 Ko : le jeu
 * n'en vaut pas la chandelle.
 */
function Courbe({ valeurs }: { valeurs: number[] }) {
  const L = 560;
  const H = 110;
  const marge = 10;

  if (valeurs.length < 2) return null;

  const pas = (L - marge * 2) / (valeurs.length - 1);
  const y = (v: number) => H - marge - (v / 100) * (H - marge * 2);
  const points = valeurs.map((v, i) => [marge + i * pas, y(v)] as const);
  const ligne = points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${L} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`Evolution des scores : ${valeurs.join(', ')} pour cent`}
    >
      {[0, 50, 100].map((repere) => (
        <g key={repere}>
          <line
            x1={marge}
            x2={L - marge}
            y1={y(repere)}
            y2={y(repere)}
            stroke="var(--bordure)"
            strokeDasharray={repere === 0 || repere === 100 ? undefined : '3 4'}
          />
          <text x={0} y={y(repere) + 4} fontSize="10" fill="var(--texte-secondaire)">
            {repere}
          </text>
        </g>
      ))}

      <polyline
        points={ligne}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="4" fill="var(--fond-surface)" stroke="var(--brand)" strokeWidth="2.5" />
      ))}
    </svg>
  );
}

function Chiffre({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="carte" style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>{valeur}</div>
      <div className="petit discret">{libelle}</div>
    </div>
  );
}

export function ProgressionPanel({ coursId }: { coursId: string }) {
  const [progression, setProgression] = useState<Progression | null>(null);
  const [tentatives, setTentatives] = useState<Tentative[]>([]);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [enCours, setEnCours] = useState(true);

  function charger() {
    setErreur(null);
    setEnCours(true);
    Promise.all([
      api<Progression>(`/courses/${coursId}/progress`),
      api<{ attempts: Tentative[] }>(`/courses/${coursId}/attempts`),
    ])
      .then(([p, t]) => {
        setProgression(p);
        setTentatives(t.attempts);
      })
      .catch((e) => setErreur(e as ApiError))
      .finally(() => setEnCours(false));
  }

  useEffect(charger, [coursId]);

  if (enCours) {
    return (
      <div className="carte">
        <Chargement lignes={4} />
      </div>
    );
  }

  if (erreur) return <ErreurApi erreur={erreur} onReessayer={charger} />;
  if (!progression) return null;

  if (progression.attemptCount === 0) {
    return (
      <EtatVide titre="Aucune tentative pour ce cours">
        Lancez un quiz dans l'onglet Quiz : vos scores et les questions sur lesquelles vous
        butez apparaitront ici.
      </EtatVide>
    );
  }

  return (
    <div className="pile">
      <div className="ligne" style={{ alignItems: 'stretch', gap: 20 }}>
        <Score valeur={progression.averageScore} />
        <Chiffre valeur={String(progression.attemptCount)} libelle="tentatives" />
        <Chiffre valeur={`${progression.bestScore} %`} libelle="meilleur score" />
        <Chiffre valeur={`${progression.lastScore} %`} libelle="derniere tentative" />
      </div>

      {progression.trend.length >= 2 && (
        <div className="carte pile">
          <h2 style={{ margin: 0 }}>Evolution</h2>
          <Courbe valeurs={progression.trend} />
        </div>
      )}

      {progression.weakQuestions.length > 0 ? (
        <div className="carte pile">
          <div className="ligne">
            <h2 style={{ margin: 0 }}>A revoir en priorite</h2>
            <span className="discret petit pousse">
              questions ratees au moins deux fois
            </span>
          </div>

          {progression.weakQuestions.map((q) => (
            <div key={q.question} className="pile" style={{ gap: 4 }}>
              <div className="ligne" style={{ gap: 10 }}>
                <Pastille ton="erreur">{q.wrongCount} echecs</Pastille>
                <strong style={{ fontWeight: 500 }}>{q.question}</strong>
              </div>
              {q.sourceQuote && (
                <div className="petit discret" style={{ fontStyle: 'italic' }}>
                  Extrait du cours : « {q.sourceQuote} »
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Alerte ton="succes" titre="Rien a revoir en priorite">
          Aucune question n'a ete ratee deux fois ou plus. Relancez un quiz pour verifier que
          cela tient dans le temps.
        </Alerte>
      )}

      <details className="carte">
        <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
          Historique des {tentatives.length} tentative{tentatives.length > 1 ? 's' : ''}
        </summary>
        <div className="pile" style={{ gap: 8, marginTop: 12 }}>
          {tentatives.map((t) => (
            <div key={t.id} className="ligne" style={{ gap: 12 }}>
              <Pastille
                ton={
                  t.score / t.total >= 0.7
                    ? 'succes'
                    : t.score / t.total >= 0.45
                      ? 'alerte'
                      : 'erreur'
                }
              >
                {t.score} / {t.total}
              </Pastille>
              <span className="petit discret">{t.difficulty}</span>
              <span className="petit discret pousse">{formaterDate(t.createdAt)}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
