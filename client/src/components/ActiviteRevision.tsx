import { useMemo } from 'react';
import { grilleActivite, pointsScores, type Point } from '../lib/activite';
import { LOCALE, useI18n } from '../lib/i18n';
import type { Apercu } from './TableauDuJour';

/**
 * « Votre regularite » : calendrier des 12 dernieres semaines et courbe des
 * derniers scores (20 octobre).
 *
 * Le tableau « Aujourd'hui » dit quoi faire maintenant ; ce bloc montre le
 * chemin parcouru. Le chiffre « 45 % » seul ne disait pas si l'etudiant
 * progresse : la courbe le dit. Et la regularite, qui compte plus que
 * l'intensite pour retenir, n'etait visible nulle part.
 *
 * Dessine en SVG, sans bibliotheque de graphiques : deux figures simples ne
 * justifient pas une dependance de plusieurs centaines de Ko.
 */

const CASE = 13;
const ECART = 3;
const PAS = CASE + ECART;
const GAUCHE = 22; // place des initiales des jours
const HAUT = 16; // place des mois

function Calendrier({ dates }: { dates: string[] }) {
  const { t, langue } = useI18n();
  const locale = LOCALE[langue];
  const g = useMemo(() => grilleActivite(dates, new Date()), [dates]);
  const largeur = GAUCHE + g.colonnes.length * PAS;
  const hauteur = HAUT + 7 * PAS;
  const fmtJour = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtMois = new Intl.DateTimeFormat(locale, { month: 'short' });
  const initiales = [t('activite.jour.lundi'), '', t('activite.jour.mercredi'), '', t('activite.jour.vendredi'), '', ''];

  const resume = t('activite.calendrier.resume', { jours: g.joursActifs, serie: g.serie });

  return (
    <div className="activite-calendrier">
      <div className="activite-chiffres">
        <span><strong>{g.joursActifs}</strong> {t('activite.joursActifs')}</span>
        <span><strong>{g.serie}</strong> {t('activite.serie')}</span>
      </div>
      <svg
        className="activite-svg"
        viewBox={`0 0 ${largeur} ${hauteur}`}
        role="img"
        aria-label={resume}
        preserveAspectRatio="xMinYMin meet"
      >
        {g.colonnes.map((col, s) => {
          const premier = new Date(col[0].jour + 'T12:00:00');
          const precedent = s > 0 ? new Date(g.colonnes[s - 1][0].jour + 'T12:00:00') : null;
          const nouveauMois = !precedent || precedent.getMonth() !== premier.getMonth();
          return (
            <g key={col[0].jour}>
              {nouveauMois && s < g.colonnes.length - 1 && (
                <text x={GAUCHE + s * PAS} y={10} className="activite-mois">
                  {fmtMois.format(premier)}
                </text>
              )}
              {col.map((c, j) => (
                <rect
                  key={c.jour}
                  x={GAUCHE + s * PAS}
                  y={HAUT + j * PAS}
                  width={CASE}
                  height={CASE}
                  rx={3}
                  className={c.futur ? 'activite-case activite-futur' : `activite-case activite-niv-${c.niveau}`}
                >
                  {!c.futur && (
                    <title>
                      {fmtJour.format(new Date(c.jour + 'T12:00:00'))} :{' '}
                      {c.n === 0 ? t('activite.case.aucune') : t('activite.case.n', { n: c.n })}
                    </title>
                  )}
                </rect>
              ))}
            </g>
          );
        })}
        {initiales.map((l, j) =>
          l ? (
            <text key={j} x={0} y={HAUT + j * PAS + 10} className="activite-jour">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      <div className="activite-legende" aria-hidden="true">
        <span>{t('activite.moins')}</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <i key={n} className={`activite-niv-${n}`} />
        ))}
        <span>{t('activite.plus')}</span>
      </div>
    </div>
  );
}

const L = 320;
const H = 140;
const MARGE = { g: 30, d: 10, h: 10, b: 22 };

function Courbe({ points }: { points: Point[] }) {
  const { t, langue } = useI18n();
  const locale = LOCALE[langue];
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const largeur = L - MARGE.g - MARGE.d;
  const hauteur = H - MARGE.h - MARGE.b;
  const x = (i: number) => MARGE.g + (points.length === 1 ? largeur / 2 : (i * largeur) / (points.length - 1));
  const y = (pct: number) => MARGE.h + hauteur - (pct * hauteur) / 100;
  const moyenne = Math.round(points.reduce((n, p) => n + p.pct, 0) / points.length);
  const trace = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  const dernier = points[points.length - 1];
  const resume = t('activite.courbe.resume', { n: points.length, moyenne, dernier: dernier.pct });

  return (
    <div className="activite-courbe">
      <div className="activite-chiffres">
        <span><strong>{dernier.pct} %</strong> {t('activite.dernier')}</span>
        <span><strong>{moyenne} %</strong> {t('activite.moyenne')}</span>
      </div>
      <svg className="activite-svg" viewBox={`0 0 ${L} ${H}`} role="img" aria-label={resume}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={MARGE.g} x2={L - MARGE.d} y1={y(v)} y2={y(v)} className="activite-grille" />
            <text x={MARGE.g - 6} y={y(v) + 4} className="activite-axe" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <line x1={MARGE.g} x2={L - MARGE.d} y1={y(moyenne)} y2={y(moyenne)} className="activite-moyenne" />
        <path d={trace} className="activite-trace" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.pct)} r={p.type === 'examen' ? 5 : 4} className={`activite-point activite-point-${p.type}`}>
            <title>
              {fmt.format(new Date(p.date))} — {p.type === 'examen' ? t('activite.type.examen') : t('activite.type.quiz')} : {p.pct} %
            </title>
          </circle>
        ))}
        <text x={MARGE.g} y={H - 4} className="activite-axe">
          {fmt.format(new Date(points[0].date))}
        </text>
        <text x={L - MARGE.d} y={H - 4} className="activite-axe" textAnchor="end">
          {fmt.format(new Date(dernier.date))}
        </text>
      </svg>
      <div className="activite-legende" aria-hidden="true">
        <i className="activite-point-quiz" /> <span>{t('activite.type.quiz')}</span>
        <i className="activite-point-examen" /> <span>{t('activite.type.examen')}</span>
        <i className="activite-legende-moyenne" /> <span>{t('activite.moyenne')}</span>
      </div>
    </div>
  );
}

export function ActiviteRevision({ apercu }: { apercu: Apercu }) {
  const { t } = useI18n();
  const tentatives = useMemo(
    () => Object.values(apercu.parCours).flatMap((a) => a.tentatives ?? []),
    [apercu.parCours],
  );
  const examens = useMemo(() => (apercu.examens ?? []).filter((e) => e.submittedAt), [apercu.examens]);
  const dates = useMemo(
    () => [...tentatives.map((t) => t.createdAt), ...examens.map((e) => e.submittedAt as string)],
    [tentatives, examens],
  );
  const points = useMemo(() => pointsScores(tentatives, examens), [tentatives, examens]);

  if (!apercu.pret) return null;

  return (
    <section className="activite" aria-labelledby="activite-titre">
      <h2 id="activite-titre" className="jour-titre">{t('activite.titre')}</h2>
      <div className="activite-grille-cartes">
        <article className="activite-carte">
          <h3>{t('activite.calendrier')}</h3>
          <Calendrier dates={dates} />
        </article>
        <article className="activite-carte">
          <h3>{t('activite.courbe')}</h3>
          {points.length > 0 ? <Courbe points={points} /> : <p className="discret">{t('activite.vide')}</p>}
        </article>
      </div>
    </section>
  );
}
