import { useState } from 'react';
import { Alerte, Bouton, Chargement, ErreurApi, EtatVide, Pastille, Score } from './ui';
import { api, ApiError } from '../lib/api';
import type { Correction, QuizPose } from '../lib/types';

/**
 * Module 2 — quiz d'auto-evaluation.
 *
 * Le navigateur ne connait jamais la bonne reponse avant la soumission : la
 * route de generation ne renvoie que l'enonce et les options, et la correction
 * se fait cote serveur. Sans cela, l'inspecteur reseau suffirait a tricher.
 */
export function QuizPanel({ coursId }: { coursId: string }) {
  const [quiz, setQuiz] = useState<QuizPose | null>(null);
  const [reponses, setReponses] = useState<Record<number, number>>({});
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
        body: { questionCount: nombre, difficulty: difficulte },
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

  const toutRepondu = quiz ? quiz.questions.every((_, i) => reponses[i] !== undefined) : false;

  return (
    <div className="pile">
      <div className="ligne">
        <div className="champ" style={{ flex: '0 1 140px' }}>
          <label htmlFor="nb">Questions</label>
          <select id="nb" value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
            {[3, 5, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="champ" style={{ flex: '0 1 180px' }}>
          <label htmlFor="diff">Difficulte</label>
          <select id="diff" value={difficulte} onChange={(e) => setDifficulte(e.target.value)}>
            <option value="facile">Facile</option>
            <option value="standard">Standard</option>
            <option value="difficile">Difficile</option>
          </select>
        </div>
        <Bouton onClick={generer} disabled={enCours} style={{ alignSelf: 'flex-end' }}>
          {enCours ? 'Redaction du quiz…' : quiz ? 'Nouveau quiz' : 'Generer un quiz'}
        </Bouton>
      </div>

      <ErreurApi erreur={erreur} onReessayer={generer} />

      {enCours && (
        <div className="carte">
          <Chargement lignes={6} />
        </div>
      )}

      {quiz && quiz.segmentCount > 1 && !enCours && (
        <Alerte>
          Cours long : les questions ont ete tirees de parties echelonnees sur l'ensemble
          du cours, et non de son seul debut.
        </Alerte>
      )}

      {!quiz && !enCours && !erreur && (
        <EtatVide titre="Aucun quiz pour ce cours">
          StudyAI genere des questions a choix multiples tirees de votre cours, avec l'explication
          de chaque reponse.
        </EtatVide>
      )}

      {/* --- Score, une fois corrige --- */}
      {correction && (
        <div className="ligne" style={{ alignItems: 'stretch', flexWrap: 'nowrap', gap: 20 }}>
          <Score valeur={Math.round((correction.attempt.score / correction.attempt.total) * 100)} />
          <div className="carte" style={{ flex: 1 }}>
            <h2>Resultat</h2>
            <p style={{ margin: 0 }}>
              {correction.attempt.score} bonne{correction.attempt.score > 1 ? 's' : ''} reponse
              {correction.attempt.score > 1 ? 's' : ''} sur {correction.attempt.total}. Les
              explications ci-dessous citent le passage du cours dont chaque question est tiree.
            </p>
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
                  Question {i + 1}
                </Pastille>
                {ligne && (
                  <span className="petit" style={{ color: ligne.correct ? 'var(--succes)' : 'var(--erreur)' }}>
                    {ligne.correct ? 'Bonne reponse' : 'Reponse incorrecte'}
                  </span>
                )}
              </div>

              <strong>{q.question}</strong>

              <div className="pile" style={{ gap: 6 }}>
                {q.options.map((o, j) => {
                  const choisi = reponses[i] === j;
                  const estBonne = ligne?.correctIndex === j;
                  let fond = 'var(--fond-surface)';
                  let bordure = 'var(--bordure)';
                  if (ligne) {
                    if (estBonne) {
                      fond = 'var(--succes-fond)';
                      bordure = 'var(--succes)';
                    } else if (choisi) {
                      fond = 'var(--erreur-fond)';
                      bordure = 'var(--erreur)';
                    }
                  } else if (choisi) {
                    fond = 'var(--brand-clair)';
                    bordure = 'var(--brand)';
                  }

                  return (
                    <button
                      key={j}
                      type="button"
                      disabled={Boolean(correction)}
                      onClick={() => setReponses((r) => ({ ...r, [i]: j }))}
                      style={{
                        textAlign: 'left',
                        font: 'inherit',
                        padding: '10px 14px',
                        borderRadius: 6,
                        border: `1px solid ${bordure}`,
                        background: fond,
                        cursor: correction ? 'default' : 'pointer',
                      }}
                    >
                      <span className="discret petit" style={{ marginRight: 8 }}>
                        {String.fromCharCode(65 + j)}
                      </span>
                      {o}
                    </button>
                  );
                })}
              </div>

              {ligne && (
                <>
                  <Alerte ton={ligne.correct ? 'succes' : 'attention'} titre="Explication">
                    {ligne.explanation}
                  </Alerte>
                  <div className="petit discret">
                    Extrait du cours : « {ligne.sourceQuote} »
                  </div>
                </>
              )}
            </div>
          );
        })}

      {quiz && !correction && !enCours && (
        <div className="ligne">
          <Bouton onClick={soumettre} disabled={!toutRepondu}>
            Valider mes reponses
          </Bouton>
          {!toutRepondu && (
            <span className="discret petit">
              {quiz.questions.length - Object.keys(reponses).length} question(s) sans reponse
            </span>
          )}
        </div>
      )}
    </div>
  );
}
