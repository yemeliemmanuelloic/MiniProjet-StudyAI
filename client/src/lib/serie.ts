/**
 * Serie de revision et objectif de la semaine (decision 050).
 *
 * Logique pure, testee a part. Les gestes viennent du journal d'activite du
 * serveur (horodatages) ; les JOURS sont comptes ici, en heure LOCALE : une
 * revision a 0 h 30 a Tunis compte pour le jour ou l'etudiant l'a faite.
 */

import { cleJour } from './activite';

export interface Serie {
  /** Jours consecutifs de revision, jusqu'a aujourd'hui ou hier. */
  actuelle: number;
  /** La plus longue serie connue. */
  record: number;
  /** A-t-on deja revise aujourd'hui ? Sinon, la serie est en jeu. */
  aujourdhui: boolean;
}

export interface JourSemaine {
  cle: string;
  actif: boolean;
  futur: boolean;
}

export function joursActifs(horodatages: string[]): Set<string> {
  const jours = new Set<string>();
  for (const iso of horodatages) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) jours.add(cleJour(d));
  }
  return jours;
}

function veille(d: Date): Date {
  const v = new Date(d);
  v.setDate(v.getDate() - 1);
  return v;
}

/**
 * La serie reste vivante jusqu'a la fin de la journee : n'avoir pas encore
 * revise aujourd'hui ne la remet pas a zero, cela la met EN JEU.
 */
export function serie(jours: Set<string>, maintenant: Date): Serie {
  const aujourdhui = jours.has(cleJour(maintenant));
  let curseur = aujourdhui ? maintenant : veille(maintenant);
  let actuelle = 0;
  while (jours.has(cleJour(curseur))) {
    actuelle++;
    curseur = veille(curseur);
  }

  let record = 0;
  for (const cle of jours) {
    // Un depart de serie : la veille n'est pas active.
    const d = new Date(`${cle}T12:00:00`);
    if (jours.has(cleJour(veille(d)))) continue;
    let n = 0;
    const c = new Date(d);
    while (jours.has(cleJour(c))) {
      n++;
      c.setDate(c.getDate() + 1);
    }
    record = Math.max(record, n);
  }
  return { actuelle, record: Math.max(record, actuelle), aujourdhui };
}

/** La semaine en cours, du lundi au dimanche. */
export function semaine(jours: Set<string>, maintenant: Date): JourSemaine[] {
  const lundi = new Date(maintenant);
  lundi.setHours(12, 0, 0, 0);
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const aujourdhui = cleJour(maintenant);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    const cle = cleJour(d);
    return { cle, actif: jours.has(cle), futur: cle > aujourdhui };
  });
}
