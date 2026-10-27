import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alerte,
  Bouton,
  Chargement,
  ErreurApi,
  EtatVide,
  Pastille,
  Score,
  TeteDePage,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { classeCours } from '../lib/couleurCours';
import { LOCALE, useI18n, useT } from '../lib/i18n';
import type {
  CorrectionExamen,
  CoursResume,
  ExamenPose,
  ExamenResume,
} from '../lib/types';

/**
 * Examen blanc multi-cours.
 *
 * Trois choses a savoir en lisant ce fichier.
 *
 * 1. LE NAVIGATEUR NE CONNAIT AUCUNE BONNE REPONSE avant la remise. La route
 *    de composition ne renvoie que les enonces et les options ; la correction
 *    descend uniquement en reponse a /submit. Meme discipline que le quiz.
 *
 * 2. LE DECOMPTE AFFICHE ICI N'EST QU'UN AFFICHAGE. Le serveur fait foi sur le
 *    temps ecoule : il recalcule `remainingS` a chaque lecture et marque la
 *    copie en retard le cas echeant. Trafiquer l'horloge du navigateur ne
 *    donne donc rien.
 *
 * 3. COMPOSER UN EXAMEN NE COUTE AUCUN APPEL AU MODELE : les questions
 *    viennent des quiz deja generes. C'est pourquoi « completer les cours sans
 *    quiz » est une case a cocher, decochee par defaut, et annoncee comme
 *    payante.
 */

type Etape = 'choix' | 'epreuve' | 'resultat';

function mmss(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ExamenPage() {
  const t = useT();
  const [etape, setEtape] = useState<Etape>('choix');
  const [examen, setExamen] = useState<ExamenPose | null>(null);
  const [correction, setCorrection] = useState<CorrectionExamen | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  function recommencer() {
    setExamen(null);
    setCorrection(null);
    setErreur(null);
    setEtape('choix');
  }

  return (
    <main className="page pile">
      <TeteDePage
        surtitre={t('nav.examen')}
        titre={t('examen.titre')}
        sous={etape === 'resultat' ? undefined : t('examen.sous')}
      >
        {/* LE SCORE MONTE DANS LA TETE une fois la copie rendue, pour la
            meme raison que le montant de la consommation : c'est le chiffre
            qu'on vient chercher, et il etait un `h2` dans une carte blanche
            parmi d'autres cartes blanches. La phrase d'introduction, elle,
            disparait — elle explique comment composer un examen, ce qui n'a
            plus d'objet une fois qu'on lit son corrige. */}
        {etape === 'resultat' && correction && (
          <div className="tete-chiffre">
            <div className="tete-chiffre-valeur">
              {correction.exam.score} / {correction.exam.total}
            </div>
            <div className="tete-chiffre-libelle">
              {t('examen.bilan', {
                cours: correction.exam.courses.length,
                minutes: Math.round(correction.exam.durationS / 60),
              })}
            </div>
          </div>
        )}
      </TeteDePage>

      <ErreurApi erreur={erreur} />

      {etape === 'choix' && (
        <Composition
          onCompose={(e) => {
            setExamen(e);
            setEtape('epreuve');
          }}
          onErreur={setErreur}
        />
      )}

      {etape === 'epreuve' && examen && (
        <Epreuve
          examen={examen}
          onRendu={(c) => {
            setCorrection(c);
            setEtape('resultat');
          }}
          onErreur={setErreur}
        />
      )}

      {etape === 'resultat' && correction && (
        <Resultat correction={correction} onRecommencer={recommencer} />
      )}

      {etape === 'choix' && <Historique />}
    </main>
  );
}

/* --- Etape 1 : choisir les cours et le format --- */

function Composition({
  onCompose,
  onErreur,
}: {
  onCompose: (e: ExamenPose) => void;
  onErreur: (e: ApiError | null) => void;
}) {
  const t = useT();
  const [cours, setCours] = useState<CoursResume[] | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [nombre, setNombre] = useState(10);
  const [duree, setDuree] = useState<number | ''>('');
  const [completer, setCompleter] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api<{ courses: CoursResume[] }>('/courses')
      .then((d) => setCours(d.courses))
      .catch((e) => onErreur(e as ApiError));
  }, [onErreur]);

  function basculer(id: string) {
    setChoisis((actuels) =>
      actuels.includes(id) ? actuels.filter((x) => x !== id) : [...actuels, id],
    );
  }

  async function composer() {
    onErreur(null);
    setEnvoi(true);
    try {
      onCompose(
        await api<ExamenPose>('/exams', {
          body: {
            courseIds: choisis,
            questionCount: nombre,
            durationMin: duree === '' ? undefined : duree,
            completer,
          },
        }),
      );
    } catch (e) {
      onErreur(e as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  if (cours === null) return <Chargement lignes={3} />;

  if (cours.length === 0) {
    return (
      <EtatVide
        titre={t('examen.sansCoursTitre')}
        action={
          <Link className="bouton" to="/cours">
            {t('recherche.importer')}
          </Link>
        }
      >
        {t('examen.sansCoursCorps')}
      </EtatVide>
    );
  }

  // Le compte de quiz vient de la liste des cours : un cours sans quiz ne peut
  // rien fournir, et le dire ICI evite un avertissement apres coup.
  const sansQuiz = cours.filter((c) => c._count.quizzes === 0 && choisis.includes(c.id));

  return (
    /* DEUX COLONNES, et elles correspondent aux deux decisions a prendre :
       SUR QUOI porter l'examen, et SOUS QUELLE FORME. Empilees, la seconde
       se decouvrait apres avoir fait defiler la premiere — sur une
       bibliotheque de dix cours, le bouton « Composer » sortait de l'ecran.
       Le panneau de droite reste colle en vue : le resume du choix et
       l'action restent lisibles pendant qu'on coche. */
    <div className="examen-composition">
      <section className="carte pile">
        <h2>{t('examen.quelsCours')}</h2>

        <div className="pile" style={{ gap: 6 }}>
        {cours.map((c) => (
          <label key={c.id} className="ligne choix-cours">
            <input
              type="checkbox"
              checked={choisis.includes(c.id)}
              onChange={() => basculer(c.id)}
            />
            <span style={{ flex: 1 }}>
              <span className={`puce-cours ${classeCours(c.title)}`} aria-hidden="true" />
              {c.title}
            </span>
            <Pastille ton={c._count.quizzes > 0 ? 'succes' : 'alerte'}>
              {c._count.quizzes > 0
                ? t('examen.quiz', { n: c._count.quizzes })
                : t('examen.aucunQuiz')}
            </Pastille>
          </label>
          ))}
        </div>
      </section>

      <aside className="carte pile examen-reglages">
        <h2>{t('examen.format')}</h2>

        <div className="champ">
          <label htmlFor="nb-questions">{t('examen.nbQuestions')}</label>
          <select
            id="nb-questions"
            value={nombre}
            onChange={(e) => setNombre(Number(e.target.value))}
          >
            {[5, 10, 15, 20, 30, 40].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="duree">{t('examen.duree')}</label>
          <select
            id="duree"
            value={duree}
            onChange={(e) => setDuree(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">{t('examen.duree.defaut')}</option>
            {[5, 10, 15, 20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {t('examen.duree.minutes', { n })}
              </option>
            ))}
          </select>
        </div>

        {sansQuiz.length > 0 && (
        <Alerte ton="attention">
          {t(sansQuiz.length === 1 ? 'examen.sansQuizUn' : 'examen.sansQuizPlusieurs', {
            n: sansQuiz.length,
            liste: sansQuiz.map((c) => c.title).join(', '),
          })}
          <label className="ligne" style={{ gap: 8, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={completer}
              onChange={(e) => setCompleter(e.target.checked)}
            />
            <span>
              {t('examen.completer')} — <strong>{t('examen.completer.cout')}</strong>
            </span>
          </label>
        </Alerte>
      )}

        <div className="pile" style={{ gap: 8 }}>
          <Bouton onClick={composer} disabled={choisis.length === 0 || envoi}>
            {envoi ? t('examen.composition') : t('examen.composer')}
          </Bouton>
          <span className="petit discret">
            {choisis.length === 0
              ? t('examen.choisir')
              : t('examen.resume', { questions: nombre, cours: choisis.length })}
          </span>
        </div>
      </aside>
    </div>
  );
}

/* --- Etape 2 : l'epreuve chronometree --- */

function Epreuve({
  examen,
  onRendu,
  onErreur,
}: {
  examen: ExamenPose;
  onRendu: (c: CorrectionExamen) => void;
  onErreur: (e: ApiError | null) => void;
}) {
  const t = useT();
  const [reponses, setReponses] = useState<Record<number, number>>({});
  const [restant, setRestant] = useState(examen.remainingS);
  const [envoi, setEnvoi] = useState(false);
  // Garde contre une double remise : le minuteur et le bouton peuvent
  // declencher la soumission dans le meme tour de boucle.
  const rendu = useRef(false);

  const rendreCopie = useCallback(async () => {
    if (rendu.current) return;
    rendu.current = true;
    setEnvoi(true);
    onErreur(null);
    try {
      const answers = examen.questions.map((_, i) =>
        reponses[i] === undefined ? null : reponses[i],
      );
      onRendu(await api<CorrectionExamen>(`/exams/${examen.id}/submit`, { body: { answers } }));
    } catch (e) {
      rendu.current = false;
      onErreur(e as ApiError);
    } finally {
      setEnvoi(false);
    }
  }, [examen, reponses, onRendu, onErreur]);

  useEffect(() => {
    if (restant <= 0) {
      // Remise automatique a zero : le travail deja fait n'est pas perdu.
      void rendreCopie();
      return;
    }
    const minuteur = setTimeout(() => setRestant((s) => s - 1), 1000);
    return () => clearTimeout(minuteur);
  }, [restant, rendreCopie]);

  const repondues = Object.keys(reponses).length;
  const urgence = restant <= 60;

  return (
    <section className="pile">
      <div className="carte ligne barre-examen">
        <div>
          <span className="petit discret">{t('examen.tempsRestant')}</span>
          <div className={`chrono${urgence ? ' chrono-urgent' : ''}`}>{mmss(restant)}</div>
        </div>
        <div className="pousse" style={{ textAlign: 'right' }}>
          <span className="petit discret">{t('examen.repondu')}</span>
          <div className="chrono">
            {repondues} / {examen.total}
          </div>
        </div>
      </div>

      {examen.warnings.length > 0 && (
        <Alerte ton="attention">
          <strong>{t('examen.desequilibre')}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {examen.warnings.map((a) => (
              <li key={a.courseId}>
                {t('examen.desequilibre.ligne', {
                  cours: a.courseTitle,
                  obtenu: a.obtenu,
                  attendu: a.attendu,
                  raison: a.raison,
                })}
              </li>
            ))}
          </ul>
        </Alerte>
      )}

      {examen.questions.map((q, i) => (
        <article key={i} className="carte carte-question pile" style={{ gap: 10 }}>
          <strong>
            {i + 1}. {q.question}
          </strong>
          <div className="pile" style={{ gap: 6 }}>
            {q.options.map((option, j) => (
              <label key={j} className="ligne option">
                <input
                  type="radio"
                  name={`q-${i}`}
                  checked={reponses[i] === j}
                  onChange={() => setReponses((r) => ({ ...r, [i]: j }))}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </article>
      ))}

      <div className="ligne">
        <Bouton onClick={rendreCopie} disabled={envoi}>
          {envoi ? t('examen.remise') : t('examen.rendre')}
        </Bouton>
        <span className="petit discret">
          {repondues < examen.total
            ? t(
                examen.total - repondues > 1
                  ? 'examen.sansReponse.pluriel'
                  : 'examen.sansReponse',
                { n: examen.total - repondues },
              )
            : t('examen.toutRepondu')}
        </span>
      </div>
    </section>
  );
}

/* --- Etape 3 : le resultat et le corrige --- */

function Resultat({
  correction,
  onRecommencer,
}: {
  correction: CorrectionExamen;
  onRecommencer: () => void;
}) {
  const t = useT();
  const { exam, parCours } = correction;
  const pourcentage = Math.round(((exam.score ?? 0) / exam.total) * 100);

  return (
    <section className="pile">
      {/* Le score chiffre vit maintenant dans la tete de page. Ce qui reste
          ici est ce qu'elle ne porte pas : le cadran de pourcentage, et le
          classement des cours par ou reprendre. */}
      <section className="carte pile examen-bilan">
        <div className="ligne" style={{ alignItems: 'center', gap: 24 }}>
          <Score valeur={pourcentage} />
          <div className="pile" style={{ gap: 6 }}>
            <h2 style={{ margin: 0 }}>{t('examen.parOuReprendre')}</h2>
            <span className="petit discret">{t('examen.parOuReprendre.note')}</span>
            {exam.late && <Pastille ton="alerte">{t('examen.horsDelai')}</Pastille>}
          </div>
        </div>
        {(correction.cardsQueued ?? 0) > 0 && (
          <Alerte ton="info">
            {t(correction.cardsQueued === 1 ? 'erreurs.cartesUne' : 'erreurs.cartesExamen', {
              n: correction.cardsQueued ?? 0,
            })}
          </Alerte>
        )}
        {parCours.map((c) => (
          <div key={c.courseId} className="ligne">
            <Link to={`/cours/${c.courseId}`} style={{ flex: 1 }}>
              {c.courseTitle}
            </Link>
            <Pastille ton={c.score === c.total ? 'succes' : c.score * 2 < c.total ? 'erreur' : 'alerte'}>
              {c.score} / {c.total}
            </Pastille>
          </div>
        ))}
      </section>

      <h2>{t('examen.corrige')}</h2>
      {correction.correction.map((ligne, i) => (
        <article key={i} className="carte pile" style={{ gap: 8 }}>
          <div className="ligne">
            <Pastille ton={ligne.correct ? 'succes' : 'erreur'}>
              {ligne.correct ? t('examen.juste') : t('examen.faux')}
            </Pastille>
            <Link className="petit pousse" to={`/cours/${ligne.courseId}`}>
              {ligne.courseTitle}
            </Link>
          </div>
          <strong>
            {i + 1}. {ligne.question}
          </strong>
          <div className="pile" style={{ gap: 4 }}>
            {ligne.options.map((option, j) => {
              const estBonne = j === ligne.correctIndex;
              const estChoisie = j === ligne.chosen;
              return (
                <div
                  key={j}
                  className={`option-corrigee${estBonne ? ' option-bonne' : ''}${
                    estChoisie && !estBonne ? ' option-fausse' : ''
                  }`}
                >
                  {option}
                  {estBonne && <span className="petit"> — {t('examen.bonneReponse')}</span>}
                  {estChoisie && !estBonne && (
                    <span className="petit"> — {t('examen.votreReponse')}</span>
                  )}
                </div>
              );
            })}
          </div>
          {ligne.chosen === null && (
            <span className="petit discret">{t('examen.pasRepondu')}</span>
          )}
          <p className="petit">{ligne.explanation}</p>
          <blockquote className="citation">{ligne.sourceQuote}</blockquote>
        </article>
      ))}

      <div className="ligne">
        <Bouton onClick={onRecommencer}>{t('examen.recommencer')}</Bouton>
      </div>
    </section>
  );
}

/* --- Historique --- */

function Historique() {
  const t = useT();
  const { langue } = useI18n();
  const [examens, setExamens] = useState<ExamenResume[] | null>(null);

  useEffect(() => {
    api<{ exams: ExamenResume[] }>('/exams')
      .then((d) => setExamens(d.exams))
      .catch(() => setExamens([]));
  }, []);

  if (!examens || examens.length === 0) return null;

  return (
    <section className="carte pile">
      <h2>{t('examen.passes')}</h2>
      {examens.map((e) => (
        <div key={e.id} className="ligne">
          <span style={{ flex: 1 }}>{e.courses.map((c) => c.title).join(' · ')}</span>
          <span className="petit discret">
            {new Date(e.createdAt).toLocaleDateString(LOCALE[langue])}
          </span>
          {e.score === null ? (
            <Pastille>{t('examen.nonRendu')}</Pastille>
          ) : (
            <Pastille ton={e.score * 2 >= e.total ? 'succes' : 'alerte'}>
              {e.score} / {e.total}
            </Pastille>
          )}
        </div>
      ))}
    </section>
  );
}
