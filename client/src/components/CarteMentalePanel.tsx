import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Citation } from './SourceCours';
import { Bouton, Chargement, ErreurApi, EtatVide } from './ui';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { CarteMentale, IdeeCarte } from '../lib/types';

/**
 * Carte mentale du cours (decision 047).
 *
 * Le serveur rend la STRUCTURE (un appel au modele, chaque idee citant le
 * cours) ; ce fichier la dessine. Deux vues :
 *  - « Carte » : le sujet au centre, les branches de part et d'autre, leurs
 *    idees vers l'exterieur, en SVG. Telechargeable en PNG.
 *  - « Plan » : la meme structure en liste depliable — la vue par defaut sur
 *    un ecran etroit, ou une carte en largeur devient illisible.
 * Cliquer une idee affiche sa citation, qui ouvre le texte source.
 *
 * COULEURS EN DUR dans le SVG, et non en variables CSS : l'image telechargee
 * est un SVG serialise, hors de la feuille de style. Ce sont les teintes
 * `--cours-1` a `--cours-6` d'index.css.
 */

const TEINTES = ['#1d4ed8', '#be185d', '#0f766e', '#6d28d9', '#a1540a', '#0e7490', '#b91c1c'];
const ENCRE = '#111827';
const POLICE = 'Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

const LARGEUR = 1200;
const CENTRE = { l: 230 };
// Bornes horizontales : sujet 485-715, branches 285-465 et 735-915, idees
// 40-240 et 960-1160. Aucune boite ne sort du dessin.
const BRANCHE = { l: 180, x: 135 };
const IDEE = { l: 200, ecart: 45 };
const LIGNE = 20;
const MARGE_NOEUD = 12;
const ESPACE = 14;

type Selection = { idee: string; citation: string; teinte: string } | null;

/** Coupe une etiquette en lignes d'au plus `max` caracteres (3 lignes au plus). */
function couper(texte: string, max: number): string[] {
  const lignes: string[] = [];
  let courante = '';
  for (const mot of texte.split(/\s+/)) {
    if (!courante) courante = mot;
    else if ((courante + ' ' + mot).length <= max) courante += ' ' + mot;
    else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  if (lignes.length > 3) return [...lignes.slice(0, 2), lignes.slice(2).join(' ').slice(0, max - 1) + '…'];
  return lignes;
}

const hauteur = (lignes: string[]) => lignes.length * LIGNE + 2 * MARGE_NOEUD;

interface NoeudPlace {
  idee: IdeeCarte;
  lignes: string[];
  x: number;
  y: number;
  l: number;
  h: number;
}

interface BranchePlacee extends NoeudPlace {
  teinte: string;
  cote: 1 | -1;
  enfants: NoeudPlace[];
}

/**
 * La mise en page : les branches de droite (la premiere moitie, dans l'ordre
 * du cours, de haut en bas) puis celles de gauche. Chaque branche occupe un
 * bloc aussi haut que la pile de ses idees ; les blocs d'un cote sont centres
 * verticalement sur le sujet.
 */
function placer(carte: CarteMentale['payload']) {
  const n = carte.branches.length;
  const droite = carte.branches.slice(0, Math.ceil(n / 2));
  const gauche = carte.branches.slice(Math.ceil(n / 2));

  const blocs = (branches: typeof carte.branches, cote: 1 | -1, decalage: number) =>
    branches.map((b, i) => {
      const lignes = couper(b.idee, 19);
      const enfants = (b.enfants ?? []).map((e) => {
        const l = couper(e.idee, 22);
        return { idee: e, lignes: l, h: hauteur(l) };
      });
      const pile = enfants.reduce((s, e) => s + e.h, 0) + Math.max(0, enfants.length - 1) * 8;
      return {
        b,
        lignes,
        h: hauteur(lignes),
        enfants,
        bloc: Math.max(hauteur(lignes), pile),
        teinte: TEINTES[(decalage + i) % TEINTES.length],
        cote,
      };
    });

  const cotes = [blocs(droite, 1, 0), blocs(gauche, -1, droite.length)];
  const hauteurCote = (c: ReturnType<typeof blocs>) =>
    c.reduce((s, x) => s + x.bloc, 0) + Math.max(0, c.length - 1) * ESPACE * 2;
  const H = Math.max(320, ...cotes.map(hauteurCote)) + 60;
  const cy = H / 2;

  const branches: BranchePlacee[] = [];
  for (const cote of cotes) {
    let y = cy - hauteurCote(cote) / 2;
    for (const x of cote) {
      const milieu = y + x.bloc / 2;
      const bx = x.cote === 1 ? LARGEUR / 2 + BRANCHE.x : LARGEUR / 2 - BRANCHE.x - BRANCHE.l;
      const ix = x.cote === 1 ? bx + BRANCHE.l + IDEE.ecart : bx - IDEE.ecart - IDEE.l;
      let ey = milieu - (x.enfants.reduce((s, e) => s + e.h, 0) + Math.max(0, x.enfants.length - 1) * 8) / 2;
      branches.push({
        idee: x.b,
        lignes: x.lignes,
        x: bx,
        y: milieu - x.h / 2,
        l: BRANCHE.l,
        h: x.h,
        teinte: x.teinte,
        cote: x.cote,
        enfants: x.enfants.map((e) => {
          const place = { idee: e.idee, lignes: e.lignes, x: ix, y: ey, l: IDEE.l, h: e.h };
          ey += e.h + 8;
          return place;
        }),
      });
      y += x.bloc + ESPACE * 2;
    }
  }

  const sujet = couper(carte.sujet, 17);
  return { H, cy, branches, sujet, hs: hauteur(sujet) + 8 };
}

/** Courbe de raccord entre deux points, horizontale aux extremites. */
function courbe(x1: number, y1: number, x2: number, y2: number): string {
  const m = (x1 + x2) / 2;
  return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
}

export function CarteMentalePanel({ coursId }: { coursId: string }) {
  const { t } = useI18n();
  const [carte, setCarte] = useState<CarteMentale | null | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  useEffect(() => {
    api<{ mindMap: CarteMentale | null }>(`/courses/${coursId}/mindmap`)
      .then((d) => setCarte(d.mindMap))
      .catch((e) => {
        setCarte(null);
        setErreur(e as ApiError);
      });
  }, [coursId]);

  async function generer() {
    setErreur(null);
    setEnCours(true);
    try {
      const d = await api<{ mindMap: CarteMentale }>(`/courses/${coursId}/mindmap`, { method: 'POST' });
      setCarte(d.mindMap);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setEnCours(false);
    }
  }

  if (carte === undefined) return <Chargement lignes={3} />;

  return (
    <div className="pile">
      <ErreurApi erreur={erreur} onReessayer={generer} />

      {enCours && (
        <div className="carte pile">
          <Chargement lignes={4} message={t('carteMentale.encours')} />
        </div>
      )}

      {!carte && !enCours && (
        <EtatVide
          titre={t('carteMentale.vide')}
          action={<Bouton onClick={generer}>{t('carteMentale.action')}</Bouton>}
        >
          {t('carteMentale.vide.corps')}
        </EtatVide>
      )}

      {carte && !enCours && (
        <>
          <Dessin key={carte.id} carte={carte} />
          <div className="ligne">
            <Bouton secondaire onClick={generer}>
              {t('carteMentale.regenerer')}
            </Bouton>
          </div>
        </>
      )}
    </div>
  );
}

function Dessin({ carte }: { carte: CarteMentale }) {
  const { t } = useI18n();
  const [vue, setVue] = useState<'carte' | 'plan'>(() =>
    window.matchMedia('(max-width: 760px)').matches ? 'plan' : 'carte',
  );
  const [selection, setSelection] = useState<Selection>(null);
  const svg = useRef<SVGSVGElement>(null);
  const place = useMemo(() => placer(carte.payload), [carte.payload]);
  const { sujet } = carte.payload;

  function choisir(idee: IdeeCarte, teinte: string) {
    setSelection({ idee: idee.idee, citation: idee.citation, teinte });
  }

  const touches = (idee: IdeeCarte, teinte: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': idee.idee,
    onClick: () => choisir(idee, teinte),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choisir(idee, teinte);
      }
    },
  });

  async function telecharger() {
    const element = svg.current;
    if (!element) return;
    const source = new XMLSerializer().serializeToString(element);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      await new Promise<void>((ok, ko) => {
        image.onload = () => ok();
        image.onerror = () => ko(new Error('svg'));
        image.src = url;
      });
      // Deux fois la taille du dessin : net a l'impression comme a l'ecran.
      const echelle = 2;
      const toile = document.createElement('canvas');
      toile.width = LARGEUR * echelle;
      toile.height = place.H * echelle;
      const ctx = toile.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, toile.width, toile.height);
      ctx.drawImage(image, 0, 0, toile.width, toile.height);
      const lien = document.createElement('a');
      lien.href = toile.toDataURL('image/png');
      lien.download = `${sujet.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'carte-mentale'}.png`;
      lien.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const cx = LARGEUR / 2;

  return (
    <section className="carte-mentale" aria-label={sujet}>
      <div className="lecteur-barre">
        <strong className="lecteur-titre">{sujet}</strong>
        <div className="ligne" style={{ gap: 8 }}>
          <div className="lecteur-modes" role="group" aria-label={t('carteMentale.vue')}>
            {(['carte', 'plan'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`lecteur-mode${vue === v ? ' actif' : ''}`}
                aria-pressed={vue === v}
                onClick={() => setVue(v)}
              >
                {t(v === 'carte' ? 'carteMentale.vue.carte' : 'carteMentale.vue.plan')}
              </button>
            ))}
          </div>
          {vue === 'carte' && (
            <button type="button" className="lecteur-mode" onClick={telecharger}>
              {t('carteMentale.telecharger')}
            </button>
          )}
        </div>
      </div>

      {vue === 'carte' ? (
        <div className="carte-mentale-toile">
          <svg
            ref={svg}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${LARGEUR} ${place.H}`}
            width={LARGEUR}
            height={place.H}
            role="group"
            aria-label={sujet}
            fontFamily={POLICE}
          >
            {place.branches.map((b, i) => {
              const ancre = b.cote === 1 ? b.x : b.x + b.l;
              const sortie = b.cote === 1 ? b.x + b.l : b.x;
              return (
                <g key={`liens-${i}`} fill="none" stroke={b.teinte} strokeWidth={2.5} strokeOpacity={0.55}>
                  <path d={courbe(cx + (b.cote * CENTRE.l) / 2, place.cy, ancre, b.y + b.h / 2)} />
                  {b.enfants.map((e, j) => (
                    <path
                      key={j}
                      strokeWidth={1.6}
                      d={courbe(sortie, b.y + b.h / 2, b.cote === 1 ? e.x : e.x + e.l, e.y + e.h / 2)}
                    />
                  ))}
                </g>
              );
            })}

            <g>
              <rect
                x={cx - CENTRE.l / 2}
                y={place.cy - place.hs / 2}
                width={CENTRE.l}
                height={place.hs}
                rx={16}
                fill={ENCRE}
              />
              {place.sujet.map((ligne, k) => (
                <text
                  key={k}
                  x={cx}
                  y={place.cy - place.hs / 2 + MARGE_NOEUD + 4 + LIGNE * (k + 0.8)}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={18}
                  fontWeight={700}
                >
                  {ligne}
                </text>
              ))}
            </g>

            {place.branches.map((b, i) => (
              <g key={`noeuds-${i}`}>
                <g className="carte-mentale-noeud" {...touches(b.idee, b.teinte)}>
                  <rect x={b.x} y={b.y} width={b.l} height={b.h} rx={12} fill={b.teinte} />
                  {b.lignes.map((ligne, k) => (
                    <text
                      key={k}
                      x={b.x + b.l / 2}
                      y={b.y + MARGE_NOEUD + LIGNE * (k + 0.8)}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={16}
                      fontWeight={700}
                    >
                      {ligne}
                    </text>
                  ))}
                </g>
                {b.enfants.map((e, j) => (
                  <g key={j} className="carte-mentale-noeud" {...touches(e.idee, b.teinte)}>
                    <rect
                      x={e.x}
                      y={e.y}
                      width={e.l}
                      height={e.h}
                      rx={10}
                      fill="#ffffff"
                      stroke={b.teinte}
                      strokeWidth={1.5}
                    />
                    {e.lignes.map((ligne, k) => (
                      <text
                        key={k}
                        x={e.x + (b.cote === 1 ? 12 : e.l - 12)}
                        y={e.y + MARGE_NOEUD + LIGNE * (k + 0.8)}
                        textAnchor={b.cote === 1 ? 'start' : 'end'}
                        fill={ENCRE}
                        fontSize={15}
                      >
                        {ligne}
                      </text>
                    ))}
                  </g>
                ))}
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <ol className="carte-mentale-plan">
          {place.branches
            .slice()
            .sort((a, b) => carte.payload.branches.indexOf(a.idee) - carte.payload.branches.indexOf(b.idee))
            .map((b, i) => (
              <li key={i} style={{ '--c': b.teinte } as React.CSSProperties}>
                <details open>
                  <summary>
                    <button type="button" className="carte-mentale-idee forte" onClick={() => choisir(b.idee, b.teinte)}>
                      {b.idee.idee}
                    </button>
                  </summary>
                  {b.enfants.length > 0 && (
                    <ul>
                      {b.enfants.map((e, j) => (
                        <li key={j}>
                          <button type="button" className="carte-mentale-idee" onClick={() => choisir(e.idee, b.teinte)}>
                            {e.idee.idee}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            ))}
        </ol>
      )}

      {selection ? (
        <div className="carte-mentale-detail" style={{ '--c': selection.teinte } as React.CSSProperties} aria-live="polite">
          <strong>{selection.idee}</strong>
          <Citation passage={selection.citation}>{selection.citation}</Citation>
        </div>
      ) : (
        <p className="petit discret">{t('carteMentale.aide')}</p>
      )}
    </section>
  );
}
