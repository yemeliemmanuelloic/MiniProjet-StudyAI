import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { classeCours } from '../lib/couleurCours';
import { LOCALE, useI18n } from '../lib/i18n';
import type { CoursResume, ExamenResume, Jeu, Progression, Tentative } from '../lib/types';

/**
 * Le tableau « Aujourd'hui » de la page d'accueil.
 *
 * POURQUOI. La page « Mes cours » etait une liste statique : rien n'y disait
 * ou en est l'etudiant ni par quoi commencer. Ce tableau repond a ces deux
 * questions avec des chiffres REELS : cartes dues, score moyen, dernier examen,
 * cours a retravailler.
 *
 * AUCUN APPEL AU MODELE. Tout vient de lectures deja exposees par l'API
 * (progression, jeu de cartes, historique d'examens), qui ne font que
 * consulter la base. Une lecture par cours : le nombre de cours d'un etudiant
 * reste petit, et un echec sur l'une n'empeche pas les autres de s'afficher
 * (Promise.allSettled) — une tuile manque, la page ne casse pas.
 */

export interface ApercuCours {
  progression?: Progression;
  dues?: number;
  totalCartes?: number;
  /** Historique des quiz rendus : calendrier et courbe de « Votre regularite ». */
  tentatives?: Tentative[];
}

export interface Apercu {
  parCours: Record<string, ApercuCours>;
  examens: ExamenResume[] | null;
  pret: boolean;
}

export function useApercu(cours: CoursResume[] | null): Apercu {
  const [apercu, setApercu] = useState<Apercu>({ parCours: {}, examens: null, pret: false });
  // La cle ne change que si la LISTE change (ajout, suppression), pas a
  // chaque rendu : sans elle, l'effet relancerait les lectures en boucle.
  const cle = (cours ?? []).map((c) => c.id).join(',');

  useEffect(() => {
    if (!cours) return;
    let annule = false;
    const lectures = cours.map(async (c) => {
      const [p, j, h] = await Promise.allSettled([
        api<Progression>(`/courses/${c.id}/progress`),
        api<Jeu>(`/courses/${c.id}/flashcards`),
        api<{ attempts: Tentative[] }>(`/courses/${c.id}/attempts`),
      ]);
      const ligne: ApercuCours = {};
      if (p.status === 'fulfilled') ligne.progression = p.value;
      if (j.status === 'fulfilled') {
        ligne.dues = j.value.etat.dues;
        ligne.totalCartes = j.value.etat.total;
      }
      if (h.status === 'fulfilled') ligne.tentatives = h.value.attempts;
      return [c.id, ligne] as const;
    });
    Promise.all([
      Promise.all(lectures),
      api<{ exams: ExamenResume[] }>('/exams').then((d) => d.exams).catch(() => null),
    ]).then(([lignes, examens]) => {
      if (!annule) setApercu({ parCours: Object.fromEntries(lignes), examens, pret: true });
    });
    return () => {
      annule = true;
    };
  }, [cle]);

  return apercu;
}

function Icone({ forme }: { forme: 'cartes' | 'score' | 'examen' | 'cible' }) {
  const traits: Record<typeof forme, string> = {
    cartes: 'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6M9 13h4',
    score: 'M4 19V11M10 19V5M16 19v-6M22 19H2',
    examen: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    cible: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  };
  return (
    <span className="jour-icone" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d={traits[forme]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function TableauDuJour({ cours, apercu }: { cours: CoursResume[]; apercu: Apercu }) {
  const { t, langue } = useI18n();
  const locale = LOCALE[langue];
  const lignes = cours.map((c) => ({ c, a: apercu.parCours[c.id] ?? {} }));

  const totalDues = lignes.reduce((n, l) => n + (l.a.dues ?? 0), 0);
  const totalCartes = lignes.reduce((n, l) => n + (l.a.totalCartes ?? 0), 0);
  const plusDeDues = [...lignes].sort((x, y) => (y.a.dues ?? 0) - (x.a.dues ?? 0))[0];

  const notes = lignes.filter((l) => (l.a.progression?.attemptCount ?? 0) > 0);
  const tentatives = notes.reduce((n, l) => n + (l.a.progression?.attemptCount ?? 0), 0);
  const moyenne = notes.length
    ? Math.round(notes.reduce((n, l) => n + (l.a.progression?.averageScore ?? 0), 0) / notes.length)
    : null;
  const aRetravailler = notes.length
    ? [...notes].sort(
        (x, y) => (x.a.progression?.averageScore ?? 0) - (y.a.progression?.averageScore ?? 0),
      )[0]
    : null;

  const rendus = (apercu.examens ?? []).filter((e) => e.submittedAt && e.score !== null);
  const dernier = rendus.sort((x, y) => (y.submittedAt ?? '').localeCompare(x.submittedAt ?? ''))[0];

  const attente = !apercu.pret;

  return (
    <section className="jour" aria-labelledby="jour-titre">
      <h2 id="jour-titre" className="jour-titre">{t('jour.titre')}</h2>
      <div className="jour-grille">
        <article className="jour-tuile jour-cartes">
          <Icone forme="cartes" />
          <div className="jour-corps">
            <span className="jour-libelle">{t('jour.cartes')}</span>
            <strong className="jour-valeur">{attente ? '…' : totalDues}</strong>
            <span className="jour-detail">
              {attente
                ? ' '
                : totalCartes === 0
                  ? t('jour.cartes.aucune')
                  : totalDues === 0
                    ? t('jour.cartes.ajour')
                    : t('jour.cartes.dans', { titre: plusDeDues.c.title })}
            </span>
            {!attente && totalDues > 0 && (
              <Link className="jour-lien" to={`/cours/${plusDeDues.c.id}?onglet=cartes`}>
                {t('jour.cartes.action')} →
              </Link>
            )}
          </div>
        </article>

        <article className="jour-tuile jour-score">
          <Icone forme="score" />
          <div className="jour-corps">
            <span className="jour-libelle">{t('jour.score')}</span>
            <strong className="jour-valeur">{attente ? '…' : moyenne === null ? '—' : `${moyenne} %`}</strong>
            {moyenne !== null && (
              <span className="jour-jauge" role="img" aria-label={`${moyenne} %`}>
                <i style={{ width: `${moyenne}%` }} />
              </span>
            )}
            <span className="jour-detail">
              {attente ? ' ' : moyenne === null ? t('jour.score.aucun') : t('jour.score.sur', { n: tentatives })}
            </span>
          </div>
        </article>

        <article className="jour-tuile jour-examen">
          <Icone forme="examen" />
          <div className="jour-corps">
            <span className="jour-libelle">{t('jour.examen')}</span>
            <strong className="jour-valeur">
              {attente ? '…' : dernier ? `${dernier.score}/${dernier.total}` : '—'}
            </strong>
            <span className="jour-detail">
              {attente
                ? ' '
                : dernier
                  ? t('jour.examen.le', {
                      date: new Date(dernier.submittedAt ?? '').toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      }),
                    })
                  : t('jour.examen.aucun')}
            </span>
            <Link className="jour-lien" to="/examen">
              {t('jour.examen.action')} →
            </Link>
          </div>
        </article>

        <article className="jour-tuile jour-cible">
          <Icone forme="cible" />
          <div className="jour-corps">
            <span className="jour-libelle">{t('jour.retravailler')}</span>
            {aRetravailler ? (
              <>
                <strong className="jour-valeur jour-valeur-titre">
                  <span className={`puce-cours ${classeCours(aRetravailler.c.title)}`} aria-hidden="true" />
                  {aRetravailler.c.title}
                </strong>
                <span className="jour-detail">
                  {t('jour.retravailler.score', { n: aRetravailler.a.progression?.averageScore ?? 0 })}
                </span>
                <Link className="jour-lien" to={`/cours/${aRetravailler.c.id}?onglet=quiz`}>
                  {t('jour.retravailler.action')} →
                </Link>
              </>
            ) : (
              <>
                <strong className="jour-valeur">{attente ? '…' : '—'}</strong>
                <span className="jour-detail">{attente ? ' ' : t('jour.score.aucun')}</span>
              </>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
