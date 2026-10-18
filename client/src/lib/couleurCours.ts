/**
 * La couleur d'un cours.
 *
 * POURQUOI. Toutes les cartes de cours se ressemblaient : meme blanc, meme
 * initiale rouge pale. Le jury, comme l'etudiant, ne pouvait pas distinguer
 * deux cours d'un coup d'oeil (refonte du 18 octobre, docs/PROMPT-ECLAT-VISUEL.md).
 *
 * DETERMINISTE : le meme cours a la meme couleur sur toutes les pages et a
 * chaque visite, sans rien stocker ni rien demander au serveur. Les six
 * teintes sont des jetons de `index.css` (`--cours-1` a `--cours-6`), chacune
 * mesuree a plus de 5:1 avec le blanc.
 *
 * DERIVEE DU TITRE, PAS DE L'IDENTIFIANT. Premiere version sur l'identifiant :
 * deux des trois cours du compte de demonstration tombaient sur la meme
 * teinte, et un cours supprime puis reimporte changeait de couleur. Le titre
 * survit a la reimportation. Deux cours de meme titre partagent une couleur :
 * c'est le cas ou ils ne se distinguent deja pas.
 *
 * FNV-1a sur 32 bits : court, et mieux reparti que la somme ponderee par 31
 * sur des titres qui ne different que d'un chiffre (« Atelier 4 », « Atelier 5 »).
 */

export const NOMBRE_TEINTES = 6;

/** Rang de teinte, de 1 a NOMBRE_TEINTES. */
export function teinteCours(titre: string): number {
  let h = 0x811c9dc5;
  for (const caractere of titre.trim().toLowerCase().normalize('NFC')) {
    h ^= caractere.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % NOMBRE_TEINTES) + 1;
}

/** La classe CSS qui pose `--c`, `--c-teinte` et `--c-encre`. */
export function classeCours(titre: string): string {
  return `ton-cours-${teinteCours(titre)}`;
}
