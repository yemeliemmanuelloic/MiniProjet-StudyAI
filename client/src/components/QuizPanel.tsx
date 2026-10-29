import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Citation } from './SourceCours';
import { Alerte, Bouton, Chargement, ErreurApi, EtatVide, Pastille, Score } from './ui';
import { api, ApiError } from '../lib/api';
import { useT } from '../lib/i18n';
import type { Correction, FormatQuestion, QuizPose } from '../lib/types';
import { TexteATrous } from './TexteATrous';

/**
 * Module 2 — quiz d'auto-evaluation.
 *
 * Le navigateur ne connait jamais la bonne reponse avant la soumission : la
 * route de generation ne renvoie que l'enonce et les options, et la correction
 * se fait cote serveur. Sans cela, l'inspecteur reseau suffirait a tricher.
 */
export function QuizPanel({ coursId }: { coursId: string }) {
  const t = useT();
  const [quiz, setQuiz] = useState<QuizPose | null>(null);
  const [reponses, setReponses] = useState<Record<number, number | string>>({});
  /* Formats demandes (decision 053) : au moins un, QCM par defaut. */
  const [formats, setFormats] = useState<FormatQuestion[]>(['qcm']);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [nombre, setNombre] = useState(5);
  const [difficulte, setDifficulte] = useState('standard');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  async function generer() {
    setErreur(null);
    setEnCours(true);
    setCorrection(null);
    setReponses({});
    try {
      const d = await api<{ quiz: QuizPose }>(`/courses/${coursId}/quiz`, {
        body: { questionCount: nombre, difficulty: difficulte, formats },
      });
      setQuiz(d.quiz);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setEnCours(false);
    }
  }

  async function soumettre() {
    if (!quiz) return;
    setErreur(null);
    try {
      const answers = quiz.questions.map((_, i) => reponses[i] ?? -1);
      setCorrection(await api<Correction>(`/quizzes/${quiz.id}/submit`, { body: { answers } }));
    } catch (e) {
      setErreur(e as ApiError);
    }
  }

  const repondue = (i: number) => {
    const r = reponses[i];
    return typeof r === 'string' ? r.trim().length > 0 : r !== undefined;
  };
  const toutRepondu = quiz ? quiz.questions.every((_, i) => repondue(i)) : false;

  function basculerFormat(f: FormatQuestion) {
    setFormats((actuels) => {
      const suivants = actuels.includes(f) ? actuels.filter((x) => x !== f) : [...actuels, f];
      // Toujours au moins un format, et dans un ordre stable.
      return suivants.length ? (['qcm', 'vrai_faux', 'trous'] as const).filter((x) => suivants.includes(x)) : actuels;
    });
  }

  return (
    <div className="pile">
      <div className="ligne">
        <div className="champ" style={{ flex: '0 1 140px' }}>
          <label htmlFor="nb">{t('quiz.nombre')}</label>
          <select id="nb" value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
            {[3, 5, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="champ" style={{ flex: '0 1 180px' }}>
          <label htmlFor="diff">{t('quiz.difficulte')}</label>
          <select id="diff" value={difficulte} onChange={(e) => setDifficulte(e.target.value)}>
            <option value="facile">{t('quiz.facile')}</option>
            <option value="standard">{t('quiz.standard')}</option>
            <option value="difficile">{t('quiz.difficile')}</option>
          </select>
        </div>
        <Bouton onClick={generer} disabled={enCours} style={{ alignSelf: 'flex-end' }}>
          {enCours ? t('quiz.encours') : quiz ? t('quiz.nouveau') : t('quiz.action')}
        </Bouton>
      </div>
      <fieldset className="formats-quiz">
        <legend className="petit discret">{t('formats.legende')}</legend>
        {(['qcm', 'vrai_faux', 'trous'] as const).map((f) => (
          <label key={f} className="formats-choix">
            <input type="checkbox" checked={formats.includes(f)} onChange={() => basculerFormat(f)} />
            {t(`formats.${f}` as const)}
          </label>
        ))}
      </fieldset>

      <ErreurApi erreur={erreur} onReessayer={generer} />

      {enCours && (
        <div className="carte">
          <Chargement lignes={6} message={t('chargement.quiz')} />
        </div>
      )}

      {quiz && quiz.segmentCount > 1 && !enCours && (
        <Alerte>
          {t('quiz.coursLong')}
        </Alerte>
      )}

      {!quiz && !enCours && !erreur && (
        <EtatVide titre={t('quiz.vide')}>
          {t('quiz.vide.corps')}
        </EtatVide>
      )}

      {/* --- Score, une fois corrige --- */}
      {correction && (
        <div className="ligne" style={{ alignItems: 'stretch', flexWrap: 'nowrap', gap: 20 }}>
          <Score valeur={Math.round((correction.attempt.score / correction.attempt.total) * 100)} />
          <div className="carte" style={{ flex: 1 }}>
            <h2>{t('quiz.resultat')}</h2>
            <p style={{ margin: 0 }}>
              {t('quiz.bilan', {
                score: correction.attempt.score,
                total: correction.attempt.total,
              })}
            </p>
            {(correction.cardsQueued ?? 0) > 0 && (
              <p className="petit" style={{ margin: '8px 0 0' }}>
                {t(correction.cardsQueued === 1 ? 'erreurs.cartesUne' : 'erreurs.cartes', {
                  n: correction.cardsQueued ?? 0,
                })}{' '}
                <Link to={`/cours/${coursId}?onglet=cartes`}>{t('erreurs.reviser')}</Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- Les questions --- */}
      {quiz &&
        !enCours &&
        quiz.questions.map((q, i) => {
          const ligne = correction?.correction[i];
          return (
            <div key={i} className="carte pile" style={{ gap: 10 }}>
              <div className="ligne">
                <Pastille ton={ligne ? (ligne.correct ? 'succes' : 'erreur') : 'neutre'}>
                  {t('quiz.question', { n: i + 1 })}
                </Pastille>
                {ligne && (
                  <span className={`petit ${ligne.correct ? 'verdict-juste' : 'verdict-faux'}`}>
                    {ligne.correct ? t('quiz.bonne') : t('quiz.incorrecte')}
                  </span>
                )}
              </div>

              {q.type === 'trous' ? (
                <TexteATrous
                  question={q.question}
                  libelle={t('formats.saisie', { n: i + 1 })}
                  valeur={typeof reponses[i] === 'string' ? (reponses[i] as string) : ''}
                  onChange={(v) => setReponses((r) => ({ ...r, [i]: v }))}
                  corrige={ligne ? { correct: ligne.correct, expected: ligne.expected ?? null } : undefined}
                />
              ) : (
                <strong>{q.question}</strong>
              )}

              {q.type !== 'trous' && (
              <div className={`pile options-quiz${q.type === 'vrai_faux' ? ' options-vrai-faux' : ''}`}>
                {q.options.map((o, j) => {
                  const choisi = reponses[i] === j;
                  const estBonne = ligne?.correctIndex === j;

                  /* LES MEMES CLASSES QUE LE CORRIGE DE L'EXAMEN BLANC.
                     Elles existaient deja dans la feuille de style, et ce
                     panneau en tenait une seconde implementation en styles
                     ecrits en ligne : la meme « bonne reponse » n'avait donc
                     pas le meme aspect selon qu'on relisait un quiz ou un
                     examen, et le marqueur ✓ / ✕ — celui qui rend le corrige
                     lisible sans la couleur — manquait ici. */
                  const classe = ligne
                    ? `option-corrigee${estBonne ? ' option-bonne' : ''}${
                        choisi && !estBonne ? ' option-fausse' : ''
                      }`
                    : `option option-bouton${choisi ? ' option-choisie' : ''}`;

                  return (
                    <button
                      key={j}
                      type="button"
                      className={classe}
                      disabled={Boolean(correction)}
                      aria-pressed={!correction ? choisi : undefined}
                      onClick={() => setReponses((r) => ({ ...r, [i]: j }))}
                    >
                      {q.type !== 'vrai_faux' && (
                        <span className="discret petit option-rang">
                          {String.fromCharCode(65 + j)}
                        </span>
                      )}
                      {o}
                    </button>
                  );
                })}
              </div>
              )}

              {ligne && (
                <>
                  <Alerte ton={ligne.correct ? 'succes' : 'attention'} titre={t('quiz.explication')}>
                    {ligne.explanation}
                  </Alerte>
                  <Citation passage={ligne.sourceQuote}>
                    {t('quiz.extrait', { texte: ligne.sourceQuote })}
                  </Citation>
                </>
              )}
            </div>
          );
        })}

      {quiz && !correction && !enCours && (
        <div className="ligne">
          <Bouton onClick={soumettre} disabled={!toutRepondu}>
            {t('quiz.valider')}
          </Bouton>
          {!toutRepondu && (
            <span className="discret petit">
              {t('quiz.sansReponse', {
                n: quiz.questions.filter((_, i) => !repondue(i)).length,
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
