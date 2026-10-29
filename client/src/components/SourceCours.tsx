import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { localiser, occurrences, type Plage } from '../lib/passage';
import { useRetours } from './Retours';
import { Alerte } from './ui';

/**
 * Le texte source d'un cours, dans un panneau lateral (22 octobre).
 *
 * POURQUOI. Le texte enregistre etait un bloc depliable colle sous chaque
 * onglet, en police de code : il passait pour un reste de debogage, alors
 * que c'est la preuve sur laquelle repose tout StudyAI — l'IA ne repond qu'a
 * partir de ce texte. Il s'ouvre desormais depuis la tete de la fiche, et
 * depuis chaque citation du quiz, du tuteur, des cartes et de la progression,
 * qui surligne alors le passage cite : la transparence devient un geste,
 * plus une mention.
 *
 * Fenetre modale sur le cote : Echap, la croix ou un clic sur le voile la
 * referment, et le focus revient a l'element qui l'avait ouverte.
 */

interface Contexte {
  ouvrir(passage?: string): void;
}

const SourceContexte = createContext<Contexte | null>(null);

/** `null` hors d'une fiche de cours : la citation reste alors une simple citation. */
export const useSourceCours = () => useContext(SourceContexte);

export function SourceCoursProvider({
  texte,
  classe,
  children,
}: {
  texte: string;
  /** Classe de teinte du cours (lib/couleurCours) : le passage cite en prend la couleur. */
  classe?: string;
  children: ReactNode;
}) {
  const [etat, setEtat] = useState<{ ouvert: boolean; passage: string | null }>({ ouvert: false, passage: null });
  const ouvrir = useCallback((passage?: string) => setEtat({ ouvert: true, passage: passage ?? null }), []);
  const fermer = useCallback(() => setEtat({ ouvert: false, passage: null }), []);
  const valeur = useMemo(() => ({ ouvrir }), [ouvrir]);
  return (
    <SourceContexte.Provider value={valeur}>
      {children}
      {etat.ouvert && (
        <PanneauSource texte={texte} passage={etat.passage} fermer={fermer} classe={classe} />
      )}
    </SourceContexte.Provider>
  );
}

/** Decoupe le texte en morceaux, surlignes ou non, sans jamais le modifier. */
function morceaux(texte: string, plages: Plage[], classe: string): ReactNode[] {
  const sortie: ReactNode[] = [];
  let curseur = 0;
  plages.forEach((p, i) => {
    if (p.debut > curseur) sortie.push(texte.slice(curseur, p.debut));
    sortie.push(
      <mark key={i} className={classe}>
        {texte.slice(p.debut, p.fin)}
      </mark>,
    );
    curseur = p.fin;
  });
  if (curseur < texte.length) sortie.push(texte.slice(curseur));
  return sortie;
}

function PanneauSource({
  texte,
  passage,
  fermer,
  classe,
}: {
  texte: string;
  passage: string | null;
  fermer(): void;
  classe?: string;
}) {
  const { t } = useI18n();
  const { notifier } = useRetours();
  const [requete, setRequete] = useState('');
  const corps = useRef<HTMLDivElement>(null);
  const croix = useRef<HTMLButtonElement>(null);

  const plagePassage = useMemo(() => (passage ? localiser(texte, passage) : null), [texte, passage]);
  const trouvees = useMemo(() => occurrences(texte, requete), [texte, requete]);
  const enRecherche = requete.trim().length >= 2;

  // Focus a l'ouverture, retour a l'element d'origine a la fermeture ;
  // la page ne defile plus derriere le panneau.
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    croix.current?.focus();
    const debordement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('keydown', touche);
      document.body.style.overflow = debordement;
      precedent?.focus();
    };
  }, [fermer]);

  // Amene le passage cite, ou le premier resultat, au milieu du panneau.
  useEffect(() => {
    const cible = corps.current?.querySelector('mark');
    cible?.scrollIntoView({ block: 'center' });
  }, [plagePassage, trouvees]);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      notifier(t('source.copie'));
    } catch {
      notifier(t('source.copie.echec'), 'erreur');
    }
  };

  return (
    <div className={`source-fond${classe ? ` ${classe}` : ''}`}>
      <div className="source-voile" onClick={fermer} aria-hidden="true" />
      <aside className="source-panneau" role="dialog" aria-modal="true" aria-labelledby="source-titre">
        <div className="source-entete">
          <h2 id="source-titre">{t('source.titre')}</h2>
          <button ref={croix} type="button" className="source-croix" onClick={fermer} aria-label={t('source.fermer')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="source-note">{t('detail.source.note')}</p>

        <div className="source-outils">
          <input
            type="search"
            value={requete}
            onChange={(e) => setRequete(e.target.value)}
            placeholder={t('source.rechercher')}
            aria-label={t('source.rechercher')}
          />
          <button type="button" className="bouton bouton-secondaire" onClick={copier}>
            {t('source.copier')}
          </button>
        </div>
        <p className="source-compte" aria-live="polite">
          {enRecherche ? t('source.resultats', { n: trouvees.length }) : ' '}
        </p>

        {passage && !plagePassage && !enRecherche && <Alerte ton="attention">{t('source.introuvable')}</Alerte>}

        <div className="source-texte" dir="auto" ref={corps} tabIndex={0} aria-label={t('source.titre')}>
          {enRecherche
            ? morceaux(texte, trouvees, 'source-trouve')
            : morceaux(texte, plagePassage ? [plagePassage] : [], 'source-passage')}
        </div>
      </aside>
    </div>
  );
}

/**
 * Une citation du cours. Sur une fiche de cours, elle porte un lien « Voir
 * dans le cours » qui ouvre le texte source au passage cite.
 */
export function Citation({ passage, children }: { passage: string; children: ReactNode }) {
  const source = useSourceCours();
  const { t } = useI18n();
  return (
    <blockquote className="citation">
      {children}
      {source && (
        <button type="button" className="citation-voir" onClick={() => source.ouvrir(passage)}>
          {t('source.voir')}
        </button>
      )}
    </blockquote>
  );
}
