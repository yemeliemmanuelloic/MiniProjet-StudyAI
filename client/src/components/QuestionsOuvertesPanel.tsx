import { useEffect, useState } from 'react';
import { Citation } from './SourceCours';
import { Bouton, Chargement, ErreurApi, EtatVide, Pastille, Score } from './ui';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { CopieOuverte, SerieOuverte } from '../lib/types';

/**
 * Questions ouvertes corrigees par l'IA (decision 049).
 *
 * Le navigateur ne recoit que les ENONCES : les points attendus et la reponse
 * modele n'arrivent qu'avec la correction, comme pour le quiz.
 *
 * La note est calculee par le serveur a partir des jugements du modele
 * (acquis, partiel, absent) : on l'affiche donc AVEC son detail, point par
 * point, pour que l'etudiant voie d'ou elle vient.
 *
 * Le brouillon est garde dans le navigateur : une copie de dix minutes ne
 * doit pas se perdre parce qu'on a change d'onglet.
 */

const cleBrouillon = (id: string) => `copie-ouverte:${id}`;

function lireBrouillon(id: string, n: number): string[] {
  try {
    const brut = JSON.parse(localStorage.getItem(cleBrouillon(id)) ?? '[]');
    return Array.from({ length: n }, (_, i) => (typeof brut[i] === 'string' ? brut[i] : ''));
  } catch {
    return Array(n).fill('');
  }
}

function ecrireBrouillon(id: string, reponses: string[] | null) {
  try {
    if (reponses) localStorage.setItem(cleBrouillon(id), JSON.stringify(reponses));
    else localStorage.removeItem(cleBrouillon(id));
  } catch {
    /* stockage indisponible : le brouillon ne survivra pas, rien de plus */
  }
}

const TON = { acquis: 'succes', partiel: 'alerte', absent: 'erreur' } as const;

export function QuestionsOuvertesPanel({ coursId }: { coursId: string }) {
  const { t } = useI18n();
  const [serie, setSerie] = useState<SerieOuverte | null | undefined>(undefined);
  const [reponses, setReponses] = useState<string[]>([]);
  const [copie, setCopie] = useState<CopieOuverte | null>(null);
  const [nombre, setNombre] = useState(3);
  const [generation, setGeneration] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  function installer(s: SerieOuverte | null) {
    setSerie(s);
    setCopie(null);
    setReponses(s ? lireBrouillon(s.id, s.questions.length) : []);
  }

  useEffect(() => {
    api<{ openQuiz: SerieOuverte | null }>(`/courses/${coursId}/open-quiz`)
      .then((d) => installer(d.openQuiz))
      .catch((e) => {
        installer(null);
        setErreur(e as ApiError);
      });
  }, [coursId]);

  async function generer() {
    setErreur(null);
    setGeneration(true);
    try {
      const d = await api<{ openQuiz: SerieOuverte }>(`/courses/${coursId}/open-quiz`, {
        body: { questionCount: nombre },
      });
      installer(d.openQuiz);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setGeneration(false);
    }
  }

  async function rendre() {
    if (!serie) return;
    setErreur(null);
    setCorrection(true);
    try {
      setCopie(await api<CopieOuverte>(`/open-quizzes/${serie.id}/submit`, { body: { answers: reponses } }));
      ecrireBrouillon(serie.id, null);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setCorrection(false);
    }
  }

  function saisir(i: number, texte: string) {
    if (!serie) return;
    const suivantes = reponses.map((r, j) => (j === i ? texte : r));
    setReponses(suivantes);
    ecrireBrouillon(serie.id, suivantes);
  }

  function recommencer() {
    if (!serie) return;
    setCopie(null);
    setReponses(Array(serie.questions.length).fill(''));
    ecrireBrouillon(serie.id, null);
  }

  if (serie === undefined) return <Chargement lignes={3} />;

  const reglages = (
    <div className="ligne">
      <div className="champ" style={{ flex: '0 1 160px' }}>
        <label htmlFor="nb-ouvertes">{t('ouvertes.nombre')}</label>
        <select id="nb-ouvertes" value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <Bouton onClick={generer} disabled={generation || correction} style={{ alignSelf: 'flex-end' }}>
        {serie ? t('ouvertes.nouvelles') : t('ouvertes.action')}
      </Bouton>
    </div>
  );

  return (
    <div className="pile">
      {reglages}
      <ErreurApi erreur={erreur} onReessayer={copie || !serie ? generer : rendre} />

      {generation && (
        <div className="carte">
          <Chargement lignes={5} message={t('ouvertes.generation')} />
        </div>
      )}

      {!serie && !generation && (
        <EtatVide titre={t('ouvertes.vide')}>{t('ouvertes.vide.corps')}</EtatVide>
      )}

      {serie && !generation && !copie && (
        <>
          {serie.questions.map((q, i) => (
            <div key={i} className="carte champ" style={{ gap: 8 }}>
              <label htmlFor={`rep-${i}`} style={{ fontSize: '1rem', color: 'var(--texte)' }}>
                <strong>
                  {i + 1}. {q}
                </strong>
              </label>
              <textarea
                id={`rep-${i}`}
                rows={5}
                maxLength={3000}
                value={reponses[i] ?? ''}
                disabled={correction}
                placeholder={t('ouvertes.placeholder')}
                onChange={(e) => saisir(i, e.target.value)}
              />
            </div>
          ))}
          {correction ? (
            <div className="carte">
              <Chargement lignes={4} message={t('ouvertes.correction')} />
            </div>
          ) : (
            <div className="ligne">
              <Bouton onClick={rendre} disabled={!reponses.some((r) => r.trim())}>
                {t('ouvertes.rendre')}
              </Bouton>
              <span className="petit discret">{t('ouvertes.note')}</span>
            </div>
          )}
        </>
      )}

      {serie && copie && !generation && (
        <Corrige copie={copie} onRecommencer={recommencer} />
      )}
    </div>
  );
}

function Corrige({ copie, onRecommencer }: { copie: CopieOuverte; onRecommencer: () => void }) {
  const { t } = useI18n();
  const etat = (e: 'acquis' | 'partiel' | 'absent') => t(`ouvertes.etat.${e}` as const);

  return (
    <div className="pile">
      <div className="ligne" style={{ alignItems: 'stretch', flexWrap: 'nowrap', gap: 20 }}>
        <Score valeur={Math.round(copie.score * 5)} />
        <div className="carte" style={{ flex: 1 }}>
          <h2>{t('ouvertes.resultat', { note: copie.score.toLocaleString() })}</h2>
          <p className="petit discret" style={{ margin: 0 }}>
            {t('ouvertes.bareme')}
          </p>
        </div>
      </div>

      {copie.correction.map((c, i) => (
        <article key={i} className="carte pile ouverte-corrige" style={{ gap: 10 }}>
          <div className="ligne" style={{ justifyContent: 'space-between' }}>
            <strong>
              {i + 1}. {c.question}
            </strong>
            <Pastille ton={c.note >= 14 ? 'succes' : c.note >= 8 ? 'alerte' : 'erreur'}>
              {c.note.toLocaleString()} / 20
            </Pastille>
          </div>

          <div className="ouverte-reponse">
            <span className="petit discret">{t('ouvertes.votreReponse')}</span>
            <p>{c.reponse || <em>{t('ouvertes.sansReponse')}</em>}</p>
          </div>

          <div className="pile" style={{ gap: 6 }}>
            <span className="petit discret">{t('ouvertes.attendus')}</span>
            <ul className="ouverte-attendus">
              {c.attendus.map((a, j) => (
                <li key={j} className={`ouverte-${a.etat}`}>
                  <Pastille ton={TON[a.etat]}>{etat(a.etat)}</Pastille>
                  <div className="pile" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    <span>{a.point}</span>
                    {a.etat !== 'acquis' && <Citation passage={a.citation}>{a.citation}</Citation>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {c.erreurs.length > 0 && (
            <div className="pile" style={{ gap: 6 }}>
              <span className="petit discret">{t('ouvertes.erreurs')}</span>
              {c.erreurs.map((e, j) => (
                <div key={j} className="ouverte-erreur pile" style={{ gap: 4 }}>
                  <s>{e.affirmation}</s>
                  <span>{e.correction}</span>
                  <Citation passage={e.citation}>{e.citation}</Citation>
                </div>
              ))}
            </div>
          )}

          <p style={{ margin: 0 }}>{c.commentaire}</p>

          <details>
            <summary>{t('ouvertes.modele')}</summary>
            <p>{c.reponseModele}</p>
          </details>
        </article>
      ))}

      <div className="ligne">
        <Bouton secondaire onClick={onRecommencer}>
          {t('ouvertes.recommencer')}
        </Bouton>
      </div>
    </div>
  );
}
