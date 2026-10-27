import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { classeCours } from '../lib/couleurCours';
import { LOCALE, useI18n, type Cle } from '../lib/i18n';
import { joursActifs, semaine, serie } from '../lib/serie';
import type { CalendrierPlan, PlanResume } from '../lib/types';

/**
 * « Votre rythme » : la serie de revision et le plan du jour, en tete de la
 * page « Mes cours » (decision 050).
 *
 * POURQUOI ICI. Le plan du jour vivait dans une page a part, et rien ne
 * disait a l'etudiant qui se connecte qu'il avait trois seances a faire. La
 * serie, elle, est ce qui fait revenir : un jour de plus, ou la perdre.
 *
 * AUCUN APPEL AU MODELE : deux lectures (journal d'activite, plan), et une
 * ecriture quand l'etudiant change son objectif.
 */

function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function IconeSerie() {
  return (
    <span className="jour-icone" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.8 2.5-5 .2 1.6 1 2.6 2 3 0-3 .5-5.4.5-8z" />
      </svg>
    </span>
  );
}

function IconePlan() {
  return (
    <span className="jour-icone" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16M8.5 14.5l2 2 4-4" />
      </svg>
    </span>
  );
}

export function SerieEtPlan() {
  const { t, langue } = useI18n();
  const [journal, setJournal] = useState<{ events: { at: string }[]; weeklyGoal: number } | null>(null);
  const [plan, setPlan] = useState<CalendrierPlan | null | undefined>(undefined);

  useEffect(() => {
    let actif = true;
    api<{ events: { at: string }[]; weeklyGoal: number }>('/activity?days=400')
      .then((j) => actif && setJournal(j))
      .catch(() => actif && setJournal(null));
    api<{ plans: PlanResume[] }>('/plans')
      .then(async (d) => {
        // Le plan dont l'examen est le plus proche, s'il n'est pas passe.
        const prochain = d.plans.filter((p) => p.examDate >= aujourdhuiIso())[0];
        if (!prochain) return actif && setPlan(null);
        const c = await api<CalendrierPlan>(`/plans/${prochain.id}?today=${aujourdhuiIso()}`);
        if (actif) setPlan(c);
      })
      .catch(() => actif && setPlan(null));
    return () => {
      actif = false;
    };
  }, []);

  async function changerObjectif(objectif: number) {
    if (!journal) return;
    setJournal({ ...journal, weeklyGoal: objectif });
    try {
      await api('/activity/goal', { method: 'PUT', body: { weeklyGoal: objectif } });
    } catch {
      setJournal(journal);
    }
  }

  const maintenant = new Date();
  const jours = joursActifs(journal?.events.map((e) => e.at) ?? []);
  const s = serie(jours, maintenant);
  const cetteSemaine = semaine(jours, maintenant);
  const actifsSemaine = cetteSemaine.filter((j) => j.actif).length;
  const lettres = cetteSemaine.map((j) =>
    new Date(`${j.cle}T12:00:00`).toLocaleDateString(LOCALE[langue], { weekday: 'narrow' }),
  );

  const duJour = plan?.days[0]?.taches ?? [];
  const faites = duJour.filter((x) => x.fait).length;

  return (
    <section className="jour" aria-labelledby="rythme-titre">
      <h2 id="rythme-titre" className="jour-titre">{t('rythme.titre')}</h2>
      <div className="jour-grille rythme-grille">
        <article className="jour-tuile jour-serie">
          <IconeSerie />
          <div className="jour-corps">
            <span className="jour-libelle">{t('rythme.serie')}</span>
            <strong className="jour-valeur">
              {journal ? t(s.actuelle === 1 ? 'rythme.jour' : 'rythme.jours', { n: s.actuelle }) : '…'}
            </strong>
            <span className="jour-detail">
              {!journal
                ? ' '
                : s.actuelle === 0
                  ? t('rythme.commencer')
                  : s.aujourdhui
                    ? t('rythme.record', { n: s.record })
                    : t('rythme.enJeu')}
            </span>
            {journal && (
              <>
                <ol className="rythme-semaine" aria-label={t('rythme.semaine', { n: actifsSemaine, objectif: journal.weeklyGoal })}>
                  {cetteSemaine.map((j, i) => (
                    <li key={j.cle} className={`${j.actif ? 'actif' : ''}${j.futur ? ' futur' : ''}`} title={j.cle}>
                      {lettres[i]}
                    </li>
                  ))}
                </ol>
                <label className="rythme-objectif">
                  <span>
                    {t(actifsSemaine >= journal.weeklyGoal ? 'rythme.objectifAtteint' : 'rythme.semaine', {
                      n: actifsSemaine,
                      objectif: journal.weeklyGoal,
                    })}
                  </span>
                  <select
                    aria-label={t('rythme.objectif')}
                    value={journal.weeklyGoal}
                    onChange={(e) => changerObjectif(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {t('rythme.objectif.option', { n })}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </article>

        <article className="jour-tuile jour-plan">
          <IconePlan />
          <div className="jour-corps">
            <span className="jour-libelle">{t('rythme.plan')}</span>
            {plan === undefined ? (
              <strong className="jour-valeur">…</strong>
            ) : plan === null ? (
              <>
                <span className="jour-detail">{t('rythme.plan.aucun')}</span>
                <Link className="jour-lien" to="/plan">
                  {t('rythme.plan.creer')} →
                </Link>
              </>
            ) : (
              <>
                <strong className="jour-valeur">
                  {duJour.length === 0 ? t('rythme.plan.repos') : `${faites} / ${duJour.length}`}
                </strong>
                <span className="jour-detail">
                  {t('rythme.plan.examen', { titre: plan.plan.title, n: plan.daysLeft })}
                </span>
                {duJour.length > 0 && (
                  <ul className="rythme-taches">
                    {duJour.map((x) => (
                      <li key={x.cle} className={x.fait ? 'fait' : ''}>
                        {x.courseTitle && (
                          <span className={`puce-cours ${classeCours(x.courseTitle)}`} aria-hidden="true" />
                        )}
                        {t(`plan.tache.${x.type}` as Cle, { cours: x.courseTitle ?? '' })}
                      </li>
                    ))}
                  </ul>
                )}
                <Link className="jour-lien" to="/plan">
                  {t('rythme.plan.ouvrir')} →
                </Link>
              </>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
