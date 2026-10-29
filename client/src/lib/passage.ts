/**
 * Retrouver un passage cite dans le texte du cours (22 octobre).
 *
 * Une citation du quiz ou du tuteur est censee etre recopiee du cours, mais
 * pas a l'octet pres : le modele recolle les lignes coupees par l'import PDF,
 * change la casse d'un debut de phrase, remplace une apostrophe droite par une
 * typographique. Une recherche exacte echouerait sur des citations fideles.
 *
 * On compare donc deux versions NORMALISEES (espaces fusionnes, casse et
 * apostrophes unifiees), en gardant pour chaque caractere normalise sa
 * position dans le texte d'origine : le surlignage tombe ensuite sur le texte
 * reel, pas sur sa copie normalisee.
 *
 * Si la citation entiere n'est pas trouvee, on cherche son debut : une
 * citation tronquee ou terminee par une reformulation garde le plus souvent
 * un debut exact. Rien n'est invente : sans correspondance, on rend `null`,
 * et l'interface le dit.
 */

export interface Plage {
  debut: number;
  fin: number;
}

const APOSTROPHES = /[’‘ʼ`]/g;
const GUILLEMETS = /[«»“”]/g;

function unifier(c: string): string {
  return c.toLowerCase().replace(APOSTROPHES, "'").replace(GUILLEMETS, '"');
}

/** Texte normalise et, pour chaque caractere, son indice dans l'original. */
function normaliser(texte: string): { forme: string; origine: number[] } {
  let forme = '';
  const origine: number[] = [];
  let espace = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (/\s/.test(c)) {
      espace = forme.length > 0;
      continue;
    }
    if (espace) {
      forme += ' ';
      origine.push(i);
      espace = false;
    }
    forme += unifier(c);
    origine.push(i);
  }
  return { forme, origine };
}

/** Retire les guillemets et points de suspension qui encadrent souvent une citation. */
function nettoyer(citation: string): string {
  return citation
    .trim()
    .replace(/^[«"“\s]+|[»"”\s]+$/g, '')
    .replace(/^(\.{3}|…)\s*|\s*(\.{3}|…)$/g, '')
    .trim();
}

const DEBUT_MINIMAL = 24;

export function localiser(texte: string, citation: string): Plage | null {
  const propre = nettoyer(citation);
  if (propre.length < 3) return null;
  const t = normaliser(texte);
  const c = normaliser(propre).forme;

  const essayer = (cible: string): Plage | null => {
    const i = t.forme.indexOf(cible);
    if (i < 0) return null;
    return { debut: t.origine[i], fin: t.origine[i + cible.length - 1] + 1 };
  };

  const entiere = essayer(c);
  if (entiere) return entiere;
  if (c.length <= DEBUT_MINIMAL) return null;
  // Le debut seul, coupe sur un mot entier.
  const coupe = c.slice(0, Math.max(DEBUT_MINIMAL, Math.floor(c.length / 2)));
  const debut = coupe.slice(0, coupe.lastIndexOf(' ') > DEBUT_MINIMAL ? coupe.lastIndexOf(' ') : coupe.length);
  return essayer(debut);
}

/** Toutes les occurrences d'une recherche, sans tenir compte de la casse ni des espaces. */
export function occurrences(texte: string, requete: string, maximum = 500): Plage[] {
  const q = normaliser(requete.trim()).forme;
  if (q.length < 2) return [];
  const t = normaliser(texte);
  const plages: Plage[] = [];
  let i = t.forme.indexOf(q);
  while (i >= 0 && plages.length < maximum) {
    plages.push({ debut: t.origine[i], fin: t.origine[i + q.length - 1] + 1 });
    i = t.forme.indexOf(q, i + q.length);
  }
  return plages;
}

const LETTRE = /[\p{L}\p{N}]/u;

/**
 * Les occurrences des termes du glossaire dans le texte (decision 054).
 *
 * Mots ENTIERS seulement (« quantum » ne s'allume pas dans « quantums ») ;
 * casse ignoree, comme la recherche. Les accents comptent : la consigne
 * demande des termes ecrits EXACTEMENT comme dans le cours (10 sur 10 a
 * l'essai reel du 29 octobre). Quand deux termes se
 * chevauchent, le plus long l'emporte : « algorithme FIFO » plutot que
 * « FIFO ». Chaque plage porte l'indice de son terme.
 */
export function plagesDesTermes(
  texte: string,
  termes: string[],
  maximum = 400,
): (Plage & { terme: number })[] {
  const ordre = termes.map((t, i) => ({ t, i })).sort((a, b) => b.t.length - a.t.length);
  const retenues: (Plage & { terme: number })[] = [];
  const chevauche = (p: Plage) => retenues.some((r) => p.debut < r.fin && r.debut < p.fin);
  for (const { t, i } of ordre) {
    for (const p of occurrences(texte, t, maximum)) {
      const avant = texte[p.debut - 1] ?? ' ';
      const apres = texte[p.fin] ?? ' ';
      if (LETTRE.test(avant) || LETTRE.test(apres) || chevauche(p)) continue;
      retenues.push({ ...p, terme: i });
      if (retenues.length >= maximum) break;
    }
  }
  return retenues.sort((a, b) => a.debut - b.debut);
}
