import { useEffect, useState } from 'react';
import { Alerte, Bouton, Chargement, ErreurApi, EtatVide, Pastille, Score } from './ui';
import { api, ApiError, telecharger } from '../lib/api';
import { LOCALE, useI18n } from '../lib/i18n';
import type { Progression, Tentative } from '../lib/types';

/**
 * Espace revision — historique et progression.
 *
 * N'appelle aucun modele : tout vient de la table des tentatives, qui
 * enregistrait deja ces donnees sans que personne ne les affiche. Cet onglet
 * transforme un outil de generation en outil de revision.
 */

function formaterDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
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
  const { t, langue } = useI18n();
  const [progression, setProgression] = useState<Progression | null>(null);
  const [tentatives, setTentatives] = useState<Tentative[]>([]);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [enCours, setEnCours] = useState(true);
  const [telechargement, setTelechargement] = useState(false);

  async function recupererFiche() {
    setErreur(null);
    setTelechargement(true);
    try {
      await telecharger(`/courses/${coursId}/revision.pdf`, 'fiche-de-revision.pdf');
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setTelechargement(false);
    }
  }

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
      <EtatVide titre={t('progression.vide')}>
        {t('progression.vide.corps')}
      </EtatVide>
    );
  }

  return (
    <div className="pile">
      <div className="ligne">
        <h2 style={{ margin: 0 }}>{t('progression.titre')}</h2>
        <div className="pousse">
          <Bouton secondaire onClick={recupererFiche} disabled={telechargement}>
            {telechargement ? t('progression.fichePreparation') : t('progression.fiche')}
          </Bouton>
        </div>
      </div>

      <ErreurApi erreur={erreur} onReessayer={charger} />

      <div className="ligne" style={{ alignItems: 'stretch', gap: 20 }}>
        <Score valeur={progression.averageScore} />
        <Chiffre valeur={String(progression.attemptCount)} libelle={t('progression.tentatives')} />
        <Chiffre valeur={`${progression.bestScore} %`} libelle={t('progression.meilleur')} />
        <Chiffre valeur={`${progression.lastScore} %`} libelle={t('progression.derniere')} />
      </div>

      {progression.trend.length >= 2 && (
        <div className="carte pile">
          <h2 style={{ margin: 0 }}>{t('progression.evolution')}</h2>
          <Courbe valeurs={progression.trend} />
        </div>
      )}

      {progression.weakQuestions.length > 0 ? (
        <div className="carte pile">
          <div className="ligne">
            <h2 style={{ margin: 0 }}>{t('progression.aRevoir')}</h2>
            <span className="discret petit pousse">
              {t('progression.ratees')}
            </span>
          </div>

          {progression.weakQuestions.map((q) => (
            <div key={q.question} className="pile" style={{ gap: 4 }}>
              <div className="ligne" style={{ gap: 10 }}>
                <Pastille ton="erreur">{t('progression.echecs', { n: q.wrongCount })}</Pastille>
                <strong style={{ fontWeight: 500 }}>{q.question}</strong>
              </div>
              {q.sourceQuote && (
                <div className="petit discret" style={{ fontStyle: 'italic' }}>
                  {t('progression.extrait', { texte: q.sourceQuote })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Alerte ton="succes" titre={t('progression.rienARevoir')}>
          {t('progression.rienARevoir.corps')}
        </Alerte>
      )}

      <details className="carte">
        <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
          {t(
            tentatives.length > 1 ? 'progression.historique.pluriel' : 'progression.historique',
            { n: tentatives.length },
          )}
        </summary>
        <div className="pile" style={{ gap: 8, marginTop: 12 }}>
          {/* La variable de boucle s'appelait `t`, comme la fonction de
              traduction : deux `t` differents dans la meme portee. Renommee. */}
          {tentatives.map((tentative) => (
            <div key={tentative.id} className="ligne" style={{ gap: 12 }}>
              <Pastille
                ton={
                  tentative.score / tentative.total >= 0.7
                    ? 'succes'
                    : tentative.score / tentative.total >= 0.45
                      ? 'alerte'
                      : 'erreur'
                }
              >
                {tentative.score} / {tentative.total}
              </Pastille>
              <span className="petit discret">{tentative.difficulty}</span>
              <span className="petit discret pousse">
                {formaterDate(tentative.createdAt, LOCALE[langue])}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
