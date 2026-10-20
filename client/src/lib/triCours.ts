/**
 * Filtre et tri de la liste « Mes cours » (20 octobre).
 *
 * Logique pure, separee de la page : c'est elle qui decide de l'ordre, et
 * un ordre faux ne se voit pas sur une liste de trois cours.
 *
 * Les tris « a revoir » et « score » s'appuient sur l'apercu deja charge
 * pour le tableau « Aujourd'hui » (TableauDuJour.tsx) : aucune requete de
 * plus.
 */

export type Tri = 'recent' | 'titre' | 'revoir' | 'score';

export interface CoursTriable {
  id: string;
  title: string;
  subject: string | null;
  createdAt: string;
}

export interface Suivi {
  dues?: number;
  progression?: { attemptCount: number; averageScore: number };
}

/** Minuscules, sans accents : « Système » se trouve en tapant « systeme ». */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filtrerEtTrier<T extends CoursTriable>(
  cours: T[],
  recherche: string,
  tri: Tri,
  suivi: Record<string, Suivi>,
): T[] {
  const motif = normaliser(recherche);
  const retenus = motif
    ? cours.filter((c) => normaliser(`${c.title} ${c.subject ?? ''}`).includes(motif))
    : [...cours];

  const score = (c: T): number | null => {
    const p = suivi[c.id]?.progression;
    return p && p.attemptCount > 0 ? p.averageScore : null;
  };

  // Departage stable : a egalite, le plus recent d'abord.
  const recence = (a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

  return retenus.sort((a, b) => {
    switch (tri) {
      case 'titre':
        return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) || recence(a, b);
      case 'revoir':
        return (suivi[b.id]?.dues ?? 0) - (suivi[a.id]?.dues ?? 0) || recence(a, b);
      case 'score': {
        // Le plus faible d'abord : c'est celui a retravailler. Un cours sans
        // quiz rendu n'a pas de score : il passe apres ceux qui en ont un.
        const sa = score(a);
        const sb = score(b);
        if (sa === null && sb === null) return recence(a, b);
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sa - sb || recence(a, b);
      }
      default:
        return recence(a, b);
    }
  });
}
