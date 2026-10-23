import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alerte,
  Bouton,
  Chargement,
  ErreurApi,
  EtatVide,
  Pastille,
  TeteDePage,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { classeCours } from '../lib/couleurCours';
import { LOCALE, useI18n, useT, type Cle } from '../lib/i18n';
import type { CalendrierPlan, CoursResume, PlanResume, TachePlan } from '../lib/types';

/**
 * Plan de revision jusqu'a l'examen (decision 046).
 *
 * Le calendrier vient du serveur, RECALCULE A CHAQUE LECTURE a partir des
 * scores et des cartes du moment : ce fichier ne fait que l'afficher et
 * cocher des seances. Aucun appel au modele.
 *
 * La date du jour envoyee est celle de l'APPAREIL : minuit ne tombe pas au
 * meme moment pour l'etudiant et pour le serveur.
 */

const MINUTES = [15, 30, 45, 60, 90, 120, 180];

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function demain(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Une date ISO sans heure, lue a midi local : jamais decalee d'un jour. */
function dateLocale(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function PlanPage() {
  const t = useT();
  const { langue } = useI18n();
  const [plans, setPlans] = useState<PlanResume[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [calendrier, setCalendrier] = useState<CalendrierPlan | null>(null);
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  const charger = useCallback(() => {
    api<{ plans: PlanResume[] }>('/plans')
      .then((d) => {
        setPlans(d.plans);
        setChoisi((actuel) =>
          actuel && d.plans.some((p) => p.id === actuel) ? actuel : (d.plans[0]?.id ?? null),
        );
      })
      .catch((e) => {
        setPlans([]);
        setErreur(e as ApiError);
      });
  }, []);

  useEffect(charger, [charger]);

  useEffect(() => {
    if (!choisi) {
      setCalendrier(null);
      return;
    }
    let actif = true;
    api<CalendrierPlan>(`/plans/${choisi}?today=${aujourdhui()}`)
      .then((c) => actif && setCalendrier(c))
      .catch((e) => actif && setErreur(e as ApiError));
    return () => {
      actif = false;
    };
  }, [choisi]);

  async function cocher(tache: TachePlan, fait: boolean) {
    if (!calendrier) return;
    // La case se coche tout de suite ; la reponse du serveur fait foi ensuite,
    // et un echec remet l'etat d'avant.
    const avant = calendrier;
    setCalendrier({
      ...calendrier,
      days: calendrier.days.map((j) => ({
        ...j,
        taches: j.taches.map((x) => (x.cle === tache.cle ? { ...x, fait } : x)),
      })),
    });
    try {
      setCalendrier(
        await api<CalendrierPlan>(`/plans/${calendrier.plan.id}/tasks?today=${aujourdhui()}`, {
          body: { cle: tache.cle, fait },
        }),
      );
    } catch (e) {
      setCalendrier(avant);
      setErreur(e as ApiError);
    }
  }

  async function supprimer() {
    if (!calendrier || !window.confirm(t('plan.supprimer.confirmer'))) return;
    try {
      await api(`/plans/${calendrier.plan.id}`, { method: 'DELETE' });
      setChoisi(null);
      charger();
    } catch (e) {
      setErreur(e as ApiError);
    }
  }

  const formulaire = creation || (plans !== null && plans.length === 0);

  return (
    <main className="page pile">
      <TeteDePage
        surtitre={t('nav.plan')}
        titre={!formulaire && calendrier ? calendrier.plan.title : t('plan.titre')}
        sous={
          !formulaire && calendrier
            ? t('plan.examenLe', {
                date: dateLocale(calendrier.plan.examDate).toLocaleDateString(LOCALE[langue], {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
              })
            : t('plan.sous')
        }
        actions={
          !formulaire && plans && plans.length > 0 ? (
            <Bouton secondaire onClick={() => setCreation(true)}>
              {t('plan.nouveau')}
            </Bouton>
          ) : undefined
        }
      >
        {!formulaire && calendrier && (
          <div className="tete-chiffre">
            <div className="tete-chiffre-valeur">J-{calendrier.daysLeft}</div>
            <div className="tete-chiffre-libelle">
              {t(calendrier.daysLeft === 1 ? 'plan.joursRestantsUn' : 'plan.joursRestants', {
                n: calendrier.daysLeft,
              })}
            </div>
          </div>
        )}
      </TeteDePage>

      <ErreurApi erreur={erreur} />

      {plans === null && <Chargement lignes={4} />}

      {formulaire && (
        <Creation
          annulable={!!plans && plans.length > 0}
          onAnnuler={() => setCreation(false)}
          onCree={(c) => {
            setCreation(false);
            setChoisi(c.plan.id);
            setCalendrier(c);
            charger();
          }}
          onErreur={setErreur}
        />
      )}

      {!formulaire && plans && plans.length > 1 && (
        <div className="ligne plan-onglets" role="group" aria-label={t('plan.vosPlans')}>
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`lecteur-mode${p.id === choisi ? ' actif' : ''}`}
              aria-pressed={p.id === choisi}
              onClick={() => setChoisi(p.id)}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      {!formulaire && choisi && !calendrier && <Chargement lignes={4} />}

      {!formulaire && calendrier && (
        <>
          <Calendrier calendrier={calendrier} onCocher={cocher} />
          <div className="ligne">
            <Bouton secondaire onClick={supprimer}>
              {t('plan.supprimer')}
            </Bouton>
          </div>
        </>
      )}
    </main>
  );
}

function Creation({
  annulable,
  onAnnuler,
  onCree,
  onErreur,
}: {
  annulable: boolean;
  onAnnuler: () => void;
  onCree: (c: CalendrierPlan) => void;
  onErreur: (e: ApiError | null) => void;
}) {
  const t = useT();
  const [cours, setCours] = useState<CoursResume[] | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState(45);
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

  async function creer() {
    onErreur(null);
    setEnvoi(true);
    try {
      onCree(
        await api<CalendrierPlan>('/plans', {
          body: {
            title: titre.trim() || t('plan.titreParDefaut'),
            examDate: date,
            courseIds: choisis,
            minutesPerDay: minutes,
            today: aujourdhui(),
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
        {t('plan.sansCours')}
      </EtatVide>
    );
  }

  return (
    <div className="examen-composition">
      <section className="carte pile">
        <h2>{t('plan.quelsCours')}</h2>
        <div className="pile" style={{ gap: 6 }}>
          {cours.map((c) => (
            <label key={c.id} className="ligne choix-cours">
              <input type="checkbox" checked={choisis.includes(c.id)} onChange={() => basculer(c.id)} />
              <span style={{ flex: 1 }}>
                <span className={`puce-cours ${classeCours(c.title)}`} aria-hidden="true" />
                {c.title}
              </span>
            </label>
          ))}
        </div>
      </section>

      <aside className="carte pile examen-reglages">
        <h2>{t('plan.reglages')}</h2>
        <div className="champ">
          <label htmlFor="plan-titre">{t('plan.nom')}</label>
          <input
            id="plan-titre"
            value={titre}
            maxLength={120}
            placeholder={t('plan.titreParDefaut')}
            onChange={(e) => setTitre(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="plan-date">{t('plan.date')}</label>
          <input id="plan-date" type="date" min={demain()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="champ">
          <label htmlFor="plan-minutes">{t('plan.minutes')}</label>
          <select id="plan-minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {MINUTES.map((n) => (
              <option key={n} value={n}>
                {t('examen.duree.minutes', { n })}
              </option>
            ))}
          </select>
        </div>
        <Alerte ton="info">{t('plan.gratuit')}</Alerte>
        <div className="ligne" style={{ gap: 8 }}>
          <Bouton onClick={creer} disabled={choisis.length === 0 || !date || envoi}>
            {t('plan.creer')}
          </Bouton>
          {annulable && (
            <Bouton secondaire onClick={onAnnuler}>
              {t('plan.annuler')}
            </Bouton>
          )}
        </div>
      </aside>
    </div>
  );
}

function lienDe(tache: TachePlan, calendrier: CalendrierPlan): string {
  if (tache.type === 'examen') return '/examen';
  const cours =
    tache.courseId ?? calendrier.courses.find((c) => c.hasCards)?.id ?? calendrier.courses[0]?.id;
  const onglet = tache.type === 'cartes' ? 'cartes' : tache.type;
  return `/cours/${cours}?onglet=${onglet}`;
}

function Calendrier({
  calendrier,
  onCocher,
}: {
  calendrier: CalendrierPlan;
  onCocher: (t: TachePlan, fait: boolean) => void;
}) {
  const t = useT();
  const { langue } = useI18n();
  const [jour, ...suite] = calendrier.days;

  const libelle = (tache: TachePlan) =>
    t(`plan.tache.${tache.type}` as Cle, { cours: tache.courseTitle ?? '' });

  if (!jour) {
    return (
      <EtatVide titre={t('plan.jourJ')}>{t('plan.jourJ.corps')}</EtatVide>
    );
  }

  const faites = jour.taches.filter((x) => x.fait).length;

  return (
    <div className="plan-grille">
      <section className="carte pile">
        <div className="ligne" style={{ justifyContent: 'space-between' }}>
          <h2>{t('plan.aujourdhui')}</h2>
          <Pastille ton={faites === jour.taches.length ? 'succes' : 'marque'}>
            {t('plan.faites', { n: faites, total: jour.taches.length })}
          </Pastille>
        </div>
        <ul className="plan-taches">
          {jour.taches.map((tache) => (
            <li key={tache.cle} className={tache.fait ? 'fait' : ''}>
              <label className="ligne">
                <input
                  type="checkbox"
                  checked={tache.fait}
                  onChange={(e) => onCocher(tache, e.target.checked)}
                />
                <span className="plan-tache-texte">
                  {tache.courseTitle && (
                    <span className={`puce-cours ${classeCours(tache.courseTitle)}`} aria-hidden="true" />
                  )}
                  {libelle(tache)}
                  <span className="petit discret"> · {t('examen.duree.minutes', { n: tache.minutes })}</span>
                </span>
              </label>
              <Link className="bouton bouton-secondaire" to={lienDe(tache, calendrier)}>
                {t('plan.ouvrir')}
              </Link>
            </li>
          ))}
        </ul>
        <p className="petit discret">{t('plan.adaptatif')}</p>
      </section>

      <aside className="carte pile">
        <h2>{t('plan.vosCours')}</h2>
        <ul className="plan-cours">
          {calendrier.courses.map((c) => (
            <li key={c.id}>
              <span className={`puce-cours ${classeCours(c.title)}`} aria-hidden="true" />
              <span style={{ flex: 1 }}>{c.title}</span>
              <Pastille ton={c.mastery === null ? 'neutre' : c.mastery >= 75 ? 'succes' : 'alerte'}>
                {c.mastery === null ? t('plan.pasEncore') : `${c.mastery} %`}
              </Pastille>
            </li>
          ))}
        </ul>
      </aside>

      {suite.length > 0 && (
        <section className="carte pile plan-suite">
          <h2>{t('plan.prochainsJours')}</h2>
          <ol className="plan-jours">
            {suite.map((j) => (
              <li key={j.date}>
                <span className="plan-jour-date">
                  {dateLocale(j.date).toLocaleDateString(LOCALE[langue], {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="plan-jour-taches">
                  {j.taches.map((tache) => (
                    <span key={tache.cle} className="plan-puce">
                      {tache.courseTitle && (
                        <span className={`puce-cours ${classeCours(tache.courseTitle)}`} aria-hidden="true" />
                      )}
                      {libelle(tache)}
                    </span>
                  ))}
                </span>
                <span className="petit discret">{t('examen.duree.minutes', { n: j.minutes })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
