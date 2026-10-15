import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { EN } from './traductions.en';
import { FR } from './traductions.fr';

/**
 * Internationalisation de StudyAI, sans dependance.
 *
 * POURQUOI PAS `react-i18next`. Deux langues, un dictionnaire plat, aucun
 * pluriel complexe, aucun chargement differe : la bibliotheque apporterait
 * une configuration, un format de fichiers et 40 ko pour un `Record` et un
 * contexte. Le projet appelle deja ses API sans SDK (DECISIONS 003) et
 * produit ses PDF sans dependance systeme (012) ; la meme logique vaut ici.
 *
 * CE QUE LA TRADUCTION A CORRIGE AU PASSAGE, et qui vaut autant qu'elle :
 * l'interface etait en francais SANS ACCENTS — « Aucun resume pour ce
 * cours », « 8 caracteres minimum », « Detaille ». Les prompts avaient ete
 * accentues en v3 (DECISIONS 015) ; l'interface, jamais. Extraire chaque
 * chaine oblige a la relire une par une, et c'est la que le defaut se
 * repare.
 *
 * CE QUI N'EST PAS TRADUIT, et pourquoi :
 *   - les sorties du modele restent en francais. Parametrer le fragment
 *     LANGUE creerait une version de prompt, et les mesures publiees du banc
 *     d'essai ne couvrent que le francais. Le tuteur fait exception sans
 *     qu'on ait rien a faire : son prompt dit deja « reponds dans la langue
 *     de la question » ;
 *   - les messages d'erreur du serveur. Le client les recompose a partir des
 *     `details` structures (DECISIONS 022), donc dans la langue active ;
 *     ceux qui n'ont pas de details s'affichent en francais.
 */

export type Langue = 'fr' | 'en';

export const LANGUES: Record<Langue, string> = {
  fr: 'Francais',
  en: 'English',
};

/**
 * Les cles sont celles du dictionnaire francais, qui fait reference.
 * Le dictionnaire anglais est contraint au meme type : une cle oubliee est
 * une erreur de compilation, pas un texte manquant a l'execution.
 */
export type Cle = keyof typeof FR;

const DICTIONNAIRES: Record<Langue, Record<Cle, string>> = { fr: FR, en: EN };

const CLE_STOCKAGE = 'langue';

function langueInitiale(): Langue {
  try {
    const gardee = localStorage.getItem(CLE_STOCKAGE);
    if (gardee === 'fr' || gardee === 'en') return gardee;
  } catch {
    // Navigation privee, stockage bloque : on retombe sur la detection.
  }
  // `navigator.language` vaut « fr-FR », « en-GB »… : seul le prefixe compte.
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

interface Contexte {
  langue: Langue;
  changer(langue: Langue): void;
  t(cle: Cle, variables?: Record<string, string | number>): string;
}

const I18nContext = createContext<Contexte | null>(null);

/** Remplace les marqueurs `{nom}` par leur valeur. */
function interpoler(
  modele: string,
  variables?: Record<string, string | number>,
): string {
  if (!variables) return modele;
  return modele.replace(/\{(\w+)\}/g, (brut, nom: string) =>
    nom in variables ? String(variables[nom]) : brut,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(langueInitiale);

  useEffect(() => {
    // `lang` sur <html> n'est pas cosmetique : il decide de la synthese
    // vocale, de la cesure des mots et de ce qu'annonce un lecteur d'ecran.
    document.documentElement.lang = langue;
    try {
      localStorage.setItem(CLE_STOCKAGE, langue);
    } catch {
      // Sans stockage, le choix vaut pour la session. Pas de quoi echouer.
    }
  }, [langue]);

  const t = useCallback(
    (cle: Cle, variables?: Record<string, string | number>) =>
      interpoler(DICTIONNAIRES[langue][cle] ?? FR[cle] ?? cle, variables),
    [langue],
  );

  const valeur = useMemo<Contexte>(
    () => ({ langue, changer: setLangue, t }),
    [langue, t],
  );

  return <I18nContext.Provider value={valeur}>{children}</I18nContext.Provider>;
}

export function useI18n(): Contexte {
  const c = useContext(I18nContext);
  if (!c) throw new Error('useI18n doit etre utilise dans un I18nProvider');
  return c;
}

/** Raccourci : `const t = useT()`. */
export function useT(): Contexte['t'] {
  return useI18n().t;
}

/**
 * Etiquette de locale pour `Intl`.
 *
 * Sept appels ecrivaient `'fr-FR'` en dur — nombres et dates. Un etudiant en
 * anglais lisait « 27 281 » avec une espace fine et « 13 oct. 2026 ».
 */
export const LOCALE: Record<Langue, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};
